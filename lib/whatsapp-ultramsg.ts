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
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || (data && data.error)) {
      return { ok: false, error: data?.error || `HTTP ${res.status}` };
    }
    return { ok: true, id: data?.id ? String(data.id) : undefined };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
