/**
 * Thin UltraMsg WhatsApp sender used by the voice AI agent endpoints.
 *
 * Environment variables:
 *   ULTRAMSG_INSTANCE_ID  e.g. "instance173060"
 *   ULTRAMSG_TOKEN        the API token from UltraMsg dashboard
 */

const BASE = 'https://api.ultramsg.com';

export async function sendWhatsAppText(args: {
  toPhone: string;   // E.164, e.g. +972541234567
  body: string;
  priority?: number;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const instance = process.env.ULTRAMSG_INSTANCE_ID;
  const token = process.env.ULTRAMSG_TOKEN;
  if (!instance || !token) {
    return { ok: false, error: 'UltraMsg not configured' };
  }

  const url = `${BASE}/${instance}/messages/chat`;
  const params = new URLSearchParams({
    token,
    to: args.toPhone,
    body: args.body,
    priority: String(args.priority ?? 10),
  });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || (data && data.error) || !data?.id) {
      return { ok: false, error: data?.error || `HTTP ${res.status}` };
    }
    return { ok: true, id: data?.id ? String(data.id) : undefined };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * Institute sender (0544020043) for messages Sarah sends to families.
 * Uses only MAGIC_KIDS_ULTRAMSG_* and verifies the sender identity first;
 * never falls back to the shared Nour/Marhaba instance.
 */
export async function sendInstituteWhatsAppText(args: {
  toPhone: string;
  body: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { ownerWhatsAppIdentity } = await import('@/lib/appointments/owner-whatsapp-identity');
  const identity = await ownerWhatsAppIdentity();
  if (identity !== 'verified') return { ok: false, error: `institute_whatsapp_${identity}` };
  const instance = process.env.MAGIC_KIDS_ULTRAMSG_INSTANCE_ID!;
  const token = process.env.MAGIC_KIDS_ULTRAMSG_TOKEN!;
  try {
    const res = await fetch(`${BASE}/${instance}/messages/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token, to: args.toPhone, body: args.body, priority: '10' }).toString(),
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error || !data?.id) return { ok: false, error: data?.error ? 'provider_rejected' : `HTTP ${res.status}` };
    return { ok: true, id: String(data.id) };
  } catch {
    // A timeout may still mean the provider accepted it; the agent must not resend blindly.
    return { ok: false, error: 'send_uncertain' };
  }
}
