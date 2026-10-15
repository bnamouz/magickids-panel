import { getSupabaseAdmin } from '@/lib/supabase';
import { ownerWhatsAppIdentity } from './owner-whatsapp-identity';
import { OWNER_WHATSAPP_TEST } from './owner-whatsapp-test';

// Dedicated institute sender. Existing shared notification helpers are untouched.
// Stable keys intentionally do not change when configuration is corrected.
export async function notifyMagicKidsOnce(id: string, phone: string, message: string) {
  if (id !== OWNER_WHATSAPP_TEST.id &&
    !/^appointment-confirmation:[0-9a-f-]{36}:whatsapp$/i.test(id)) return 'blocked';
  const identity = await ownerWhatsAppIdentity();
  if (identity !== 'verified') return identity;
  const instance = process.env.MAGIC_KIDS_ULTRAMSG_INSTANCE_ID;
  const token = process.env.MAGIC_KIDS_ULTRAMSG_TOKEN;
  if (instance !== OWNER_WHATSAPP_TEST.instance || !token) return 'not_configured';
  const db = getSupabaseAdmin();
  const inserted = await db.from('clinic_notifications').upsert({ id }, { onConflict: 'id', ignoreDuplicates: true });
  if (inserted.error) return 'unavailable';
  const claim = await db.from('clinic_notifications')
    .update({ state: 'sending', updated_at: new Date().toISOString() })
    .eq('id', id).eq('state', 'pending').select('id').maybeSingle();
  if (claim.error) return 'unavailable';
  if (!claim.data) {
    const prior = await db.from('clinic_notifications').select('state').eq('id', id).maybeSingle();
    return prior.error ? 'unknown' : prior.data?.state ?? 'unknown';
  }
  let state = 'unknown';
  let providerId: string | null = null;
  try {
    const response = await fetch(`https://api.ultramsg.com/${instance}/messages/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token, to: phone, body: message, priority: '10' }).toString(),
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (response.ok && !data?.error &&
      ((typeof data?.id === 'string' && data.id.length > 0) || (typeof data?.id === 'number' && data.id > 0))) {
      state = 'accepted'; providerId = String(data.id);
    }
  } catch {
    // A timeout may still mean the provider accepted it. Never retry automatically.
  }
  const saved = await db.from('clinic_notifications')
    .update({ state, provider_id: providerId, updated_at: new Date().toISOString() })
    .eq('id', id).eq('state', 'sending');
  return saved.error ? 'unknown' : state;
}
