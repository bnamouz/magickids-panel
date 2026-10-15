import { OWNER_WHATSAPP_TEST } from './owner-whatsapp-test';

// No secrets or upstream error bodies are returned or logged.
export async function ownerWhatsAppIdentity() {
  const instance = process.env.ULTRAMSG_INSTANCE_ID;
  const token = process.env.ULTRAMSG_TOKEN;
  if (!instance || !token) return 'not_configured';
  if (instance !== OWNER_WHATSAPP_TEST.instance) return 'identity_mismatch';
  try {
    const url = new URL(`https://api.ultramsg.com/${instance}/instance/me`);
    url.searchParams.set('token', token);
    const response = await fetch(url, {
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return 'identity_unavailable';
    const data = await response.json();
    if (typeof data?.id !== 'string') return 'identity_unavailable';
    return data.id === `${OWNER_WHATSAPP_TEST.sender.slice(1)}@c.us`
      ? 'verified' : 'identity_mismatch';
  } catch { return 'identity_unavailable'; }
}
