import { timingSafeEqual } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase';
import { notifyOnce } from '@/lib/moxo/notification';

/**
 * Paced WhatsApp campaign to clinic patients (one message every ~30 s, sender 050-995-5137).
 * Queue rows: clinic_notifications id `clinic-cmp:<cid>:<seq>:<phone>` (pending → accepted/failed/unknown).
 * Control row: `clinic-cmp-ctl:<cid>`; state sending = running, pending = paused, accepted = done,
 * failed = stopped automatically. provider_id holds JSON {text, from, to, label}.
 */
export const GAP_MS = 30_000;
const CTL = 'clinic-cmp-ctl:';
type Cfg = { text: string; from: number; to: number; label?: string; reason?: string };

export function secretOk(given: string | null) {
  const want = process.env.CLINIC_CAMPAIGN_SECRET;
  if (!want || !given) return false;
  const a = Buffer.from(given), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
const hourIL = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }).format(new Date())) % 24;

async function counts(cid: string) {
  const db = getSupabaseAdmin(); const out: Record<string, number> = {};
  for (const s of ['pending', 'sending', 'accepted', 'failed', 'unknown']) {
    const r = await db.from('clinic_notifications').select('id', { count: 'exact', head: true }).like('id', `clinic-cmp:${cid}:%`).eq('state', s);
    out[s] = r.count ?? 0;
  }
  return out;
}

export async function campaigns() {
  const db = getSupabaseAdmin();
  const r = await db.from('clinic_notifications').select('id,state,provider_id,updated_at').like('id', `${CTL}%`).order('id');
  const list = [];
  for (const c of r.data ?? []) {
    const cid = c.id.slice(CTL.length); let cfg: Cfg | null = null; try { cfg = JSON.parse(c.provider_id ?? ''); } catch {}
    const last = await db.from('clinic_notifications').select('updated_at').like('id', `clinic-cmp:${cid}:%`).neq('state', 'pending').order('updated_at', { ascending: false }).limit(1).maybeSingle();
    list.push({ cid, state: c.state, label: cfg?.label ?? cid, text: cfg?.text ?? '', from: cfg?.from, to: cfg?.to, reason: cfg?.reason ?? null, counts: await counts(cid), last_sent_at: last.data?.updated_at ?? null });
  }
  return list;
}

async function setCtl(cid: string, state: string, patch: Partial<Cfg> = {}) {
  const db = getSupabaseAdmin();
  const c = await db.from('clinic_notifications').select('provider_id').eq('id', CTL + cid).single();
  if (c.error) return false;
  const cfg = { ...JSON.parse(c.data.provider_id ?? '{}'), ...patch };
  const u = await db.from('clinic_notifications').update({ state, provider_id: JSON.stringify(cfg), updated_at: new Date().toISOString() }).eq('id', CTL + cid);
  return !u.error;
}
export const pause = (cid: string) => setCtl(cid, 'pending', { reason: 'paused_by_admin' });
export const resume = (cid: string) => setCtl(cid, 'sending', { reason: undefined });

/** One step: sends at most one message, never faster than GAP_MS. */
export async function tick() {
  const db = getSupabaseAdmin();
  const ctl = await db.from('clinic_notifications').select('id,provider_id').like('id', `${CTL}%`).eq('state', 'sending').order('id').limit(1).maybeSingle();
  if (ctl.error) return { status: 'unavailable' };
  if (!ctl.data) return { status: 'idle' };
  const cid = ctl.data.id.slice(CTL.length); const cfg: Cfg = JSON.parse(ctl.data.provider_id ?? '{}');
  const h = hourIL();
  if (h < cfg.from || h >= cfg.to) return { status: 'outside_hours', cid };
  const last = await db.from('clinic_notifications').select('updated_at').like('id', `clinic-cmp:${cid}:%`).neq('state', 'pending').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  const since = last.data ? Date.now() - new Date(last.data.updated_at).getTime() : Infinity;
  if (since < GAP_MS - 2000) return { status: 'wait', cid, wait_ms: GAP_MS - since };
  const next = await db.from('clinic_notifications').select('id').like('id', `clinic-cmp:${cid}:%`).eq('state', 'pending').order('id').limit(1).maybeSingle();
  if (next.error) return { status: 'unavailable' };
  if (!next.data) { await setCtl(cid, 'accepted', { reason: 'done' }); return { status: 'done', cid }; }
  const phone = next.data.id.split(':')[3];
  const s = await notifyOnce(next.data.id, phone, cfg.text, { sender: 'clinic' });
  if (s === 'not_configured' || s === 'unavailable') { await setCtl(cid, 'failed', { reason: 'whatsapp_not_connected' }); return { status: 'stopped', cid, reason: 'whatsapp_not_connected' }; }
  if (s !== 'accepted') {
    // Three rejections in a row → stop instead of burning the list (the number may be disconnected or limited).
    const recent = await db.from('clinic_notifications').select('state').like('id', `clinic-cmp:${cid}:%`).neq('state', 'pending').order('updated_at', { ascending: false }).limit(3);
    if ((recent.data ?? []).length === 3 && recent.data!.every((r: any) => r.state !== 'accepted')) {
      await setCtl(cid, 'failed', { reason: 'rejected_3_in_a_row' }); return { status: 'stopped', cid, reason: 'rejected_3_in_a_row' };
    }
  }
  return { status: 'sent', cid, result: s };
}
