import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentStaff, isAdmin } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { notifyOnce } from '@/lib/moxo/notification';
import { clinicWhatsAppIdentity } from '@/lib/whatsapp-clinic';
import { applyFilters } from '@/lib/clinic-patients/query';
import { buildRecipients, campaignId, isMobile, render, MAX_BROADCAST, BATCH } from '@/lib/clinic-patients/messaging';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const Text = z.string().trim().min(2).max(1000);
const Filter = z.object({ f: z.string().max(20).optional(), q: z.string().max(100).optional() });

async function audience(filter: { f?: string; q?: string }) {
  const db = getSupabaseAdmin(); const rows: any[] = [];
  // PostgREST returns at most 1000 rows per request, so page through all patients.
  for (let from = 0; from < 20000; from += 1000) {
    const r = await applyFilters(db.from('clinic_patients').select('id,first_name,phone1,phone2,extra'), filter).order('id').range(from, from + 999);
    if (r.error) throw new Error('unavailable');
    rows.push(...(r.data ?? []));
    if ((r.data?.length ?? 0) < 1000) break;
  }
  return buildRecipients(rows);
}
/** Numbers that already got (or may have got) this campaign. Definite failures can be retried. */
async function alreadySent(cid: string) {
  const db = getSupabaseAdmin(); const done = new Set<string>();
  for (let from = 0; from < 20000; from += 1000) {
    const r = await db.from('clinic_notifications').select('id').like('id', `clinic-bc:${cid}:%`).neq('state', 'failed').order('id').range(from, from + 999);
    if (r.error) throw new Error('unavailable');
    for (const x of r.data ?? []) done.add(String(x.id).split(':')[2]);
    if ((r.data?.length ?? 0) < 1000) break;
  }
  return done;
}
async function failedCount(cid: string) {
  const r = await getSupabaseAdmin().from('clinic_notifications').select('id', { count: 'exact', head: true }).like('id', `clinic-bc:${cid}:%`).eq('state', 'failed');
  return r.count ?? 0;
}

export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin) return reply({ error: 'forbidden' }, 403);
  const staff = await getCurrentStaff();
  if (!staff || !isAdmin(staff)) return reply({ error: 'forbidden' }, 403);
  let b: any; try { b = await req.json(); } catch { return reply({ error: 'invalid_request' }, 400); }
  const db = getSupabaseAdmin();
  if (b.action === 'status') return reply({ clinic_whatsapp: await clinicWhatsAppIdentity(true) });
  if ((b.action === 'send_one' || b.action === 'send_batch') && (await clinicWhatsAppIdentity(true)) !== 'verified') return reply({ error: 'clinic_whatsapp_not_connected' }, 409);

  if (b.action === 'send_one') {
    const p = z.object({ patient_id: z.string().uuid(), phone: z.enum(['phone1', 'phone2']), text: Text, request_id: z.string().uuid() }).safeParse(b);
    if (!p.success) return reply({ error: 'invalid_request' }, 400);
    const pt = await db.from('clinic_patients').select('id,first_name,phone1,phone2,extra').eq('id', p.data.patient_id).single();
    if (pt.error || !pt.data) return reply({ error: 'not_found' }, 404);
    const to = (pt.data as any)[p.data.phone] as string | null;
    if (!isMobile(to)) return reply({ error: 'not_mobile' }, 400);
    const state = await notifyOnce(`clinic-msg:${p.data.request_id}`, to, render(p.data.text, [pt.data.first_name]), { sender: 'clinic' });
    if (state !== 'accepted') return reply({ error: 'send_failed', state }, 502);
    const extra = { ...((pt.data.extra as any) ?? {}), last_message_at: new Date().toISOString() };
    await db.from('clinic_patients').update({ extra }).eq('id', pt.data.id);
    await db.from('audit_log').insert({ actor_id: staff.id, actor_type: 'user', action: 'clinic_whatsapp_single', entity_type: 'clinic_patient', entity_id: pt.data.id, metadata: { phone_field: p.data.phone } });
    return reply({ sent: true, to });
  }

  const filter = Filter.safeParse(b.filter ?? {});
  const text = Text.safeParse(b.text);
  if (!filter.success || !text.success) return reply({ error: 'invalid_request' }, 400);
  if (filter.data.f === 'archived') return reply({ error: 'archived_not_allowed' }, 400);
  const cid = campaignId(text.data, filter.data);

  try {
    if (b.action === 'preview') {
      const a = await audience(filter.data); const done = await alreadySent(cid);
      const pending = a.list.filter(r => !done.has(r.phone));
      return reply({
        clinic_whatsapp: await clinicWhatsAppIdentity(),
        failed_before: await failedCount(cid),
        patients: a.patients, phones: a.list.length, already_sent: a.list.length - pending.length, pending: pending.length,
        this_round: Math.min(pending.length, MAX_BROADCAST), max_per_round: MAX_BROADCAST, no_mobile: a.noMobile, opted_out: a.optedOut,
        sample: pending[0] ? render(text.data, pending[0].names) : null,
      });
    }

    if (b.action === 'send_batch') {
      const round = z.number().int().min(0).max(MAX_BROADCAST).safeParse(b.round_sent ?? 0);
      if (!round.success || b.confirmed !== true) return reply({ error: 'invalid_request' }, 400);
      const a = await audience(filter.data); const done = await alreadySent(cid);
      const pending = a.list.filter(r => !done.has(r.phone));
      const batch = pending.slice(0, Math.max(0, Math.min(BATCH, MAX_BROADCAST - round.data)));
      let sent = 0, failed = 0, stop = '', streak = 0;
      for (const r of batch) {
        const s = await notifyOnce(`clinic-bc:${cid}:${r.phone}`, r.phone, render(text.data, r.names), { sender: 'clinic' });
        if (s === 'accepted') { sent++; streak = 0; } else { failed++; streak++; }
        if (s === 'not_configured' || s === 'unavailable') { stop = s; break; }
        // Three rejections in a row = the WhatsApp connection is down or limited. Stop instead of burning the list.
        if (streak >= 3) { stop = 'whatsapp_failing'; break; }
      }
      if (round.data === 0 && batch.length) await db.from('audit_log').insert({ actor_id: staff.id, actor_type: 'user', action: 'clinic_whatsapp_broadcast', entity_type: 'clinic_patients', metadata: { campaign: cid, filter: filter.data, recipients: pending.length, text: text.data.slice(0, 300) } });
      const processed = sent + failed;
      const roundSent = round.data + processed;
      return reply({ sent, failed, stop: stop || null, remaining_total: pending.length - processed, round_sent: roundSent,
        round_done: !!stop || pending.length - processed <= 0 || roundSent >= MAX_BROADCAST });
    }
  } catch { return reply({ error: 'unavailable' }, 503); }
  return reply({ error: 'invalid_request' }, 400);
}
