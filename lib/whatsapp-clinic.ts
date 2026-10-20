/**
 * Pediatric clinic sender: Dr. Baseem Namouz's own WhatsApp (050-995-5137).
 * Uses CLINIC_ULTRAMSG_INSTANCE_ID / CLINIC_ULTRAMSG_TOKEN, or — only if
 * CLINIC_ULTRAMSG_USE_SHARED=true — the shared ULTRAMSG_* instance.
 * The connected number is verified before every send window; no fallback to other numbers.
 */
export const CLINIC_SENDER = '+972509955137';
export const CLINIC_SENDER_LOCAL = '050-995-5137';
const BASE = 'https://api.ultramsg.com';
export type ClinicIdentity = 'verified' | 'not_configured' | 'identity_mismatch' | 'identity_unavailable';

function creds() {
  if (process.env.CLINIC_ULTRAMSG_INSTANCE_ID && process.env.CLINIC_ULTRAMSG_TOKEN)
    return { instance: process.env.CLINIC_ULTRAMSG_INSTANCE_ID.trim(), token: process.env.CLINIC_ULTRAMSG_TOKEN.trim() };
  if (process.env.CLINIC_ULTRAMSG_USE_SHARED === 'true' && process.env.ULTRAMSG_INSTANCE_ID && process.env.ULTRAMSG_TOKEN)
    return { instance: process.env.ULTRAMSG_INSTANCE_ID.trim(), token: process.env.ULTRAMSG_TOKEN.trim() };
  return null;
}

let cache: { at: number; value: ClinicIdentity } | null = null;
export async function clinicWhatsAppIdentity(fresh = false): Promise<ClinicIdentity> {
  // A verified/mismatch answer is good for a minute; a provider hiccup is only remembered for a few seconds.
  if (!fresh && cache && Date.now() - cache.at < (cache.value === 'identity_unavailable' ? 5_000 : 60_000)) return cache.value;
  const c = creds();
  let value: ClinicIdentity = 'not_configured';
  if (c) {
    // The provider occasionally times out or answers slowly; retry before giving up so a brief hiccup never changes the sender.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const url = new URL(`${BASE}/${c.instance}/instance/me`); url.searchParams.set('token', c.token);
        const r = await fetch(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000) });
        const d = r.ok ? await r.json().catch(() => null) : null;
        value = typeof d?.id !== 'string' ? 'identity_unavailable' : d.id === `${CLINIC_SENDER.slice(1)}@c.us` ? 'verified' : 'identity_mismatch';
      } catch { value = 'identity_unavailable'; }
      if (value !== 'identity_unavailable') break;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  cache = { at: Date.now(), value };
  return value;
}

export async function sendClinicWhatsAppText(args: { toPhone: string; body: string }): Promise<{ ok: boolean; id?: string; error?: string }> {
  const identity = await clinicWhatsAppIdentity();
  if (identity !== 'verified') return { ok: false, error: `clinic_whatsapp_${identity}` };
  const c = creds()!;
  try {
    const res = await fetch(`${BASE}/${c.instance}/messages/chat`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: c.token, to: args.toPhone, body: args.body, priority: '10' }).toString(),
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error || !data?.id) { cache = null; return { ok: false, error: data?.error ? 'provider_rejected' : `HTTP ${res.status}` }; }
    return { ok: true, id: String(data.id) };
  } catch { return { ok: false, error: 'send_uncertain' }; }
}
