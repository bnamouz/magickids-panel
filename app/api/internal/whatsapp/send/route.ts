import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { timingSafeEqual } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase';
import { notifyOnce } from '@/lib/moxo/notification';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const reply = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'private, no-store' } });
const Body = z.object({
  key: z.string().trim().regex(/^[a-z0-9:_-]{8,120}$/i),          // dedupe key, e.g. moxo-reminder:<id>:<day>
  to: z.string().trim().regex(/^\+9725\d{8}$/),                     // Israeli mobile only
  text: z.string().trim().min(5).max(1500).refine(v => !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v)),
  sender: z.enum(['institute', 'clinic', 'doctor']).default('institute'),
  reason: z.string().trim().max(120),
}).strict();

function authorized(req: NextRequest) {
  const secret = process.env.CLINIC_CAMPAIGN_SECRET, given = req.headers.get('x-campaign-secret') ?? '';
  return !!secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

/**
 * Scheduled/operator one-off WhatsApp message (e.g. an approved appointment reminder) from a verified
 * institute/clinic/doctor number. Secret-protected, once per key, written to the audit log. Never bulk.
 */
export async function POST(req: NextRequest) {
  if (!authorized(req)) return reply({ error: 'forbidden' }, 403);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return reply({ error: 'invalid_request', detail: p.error.issues[0]?.message }, 400);
  const { key, to, text, sender, reason } = p.data;
  const db = getSupabaseAdmin();
  const before = await db.from('clinic_notifications').select('state,provider_id').eq('id', key).maybeSingle();
  if (before.data && before.data.state !== 'failed') return reply({ state: before.data.state, provider_id: before.data.provider_id ?? null, duplicate: true });
  const state = await notifyOnce(key, to, text, { sender });
  const after = await db.from('clinic_notifications').select('state,provider_id').eq('id', key).maybeSingle();
  await db.from('audit_log').insert({ actor_type: 'system', action: 'whatsapp_oneoff_send', entity_type: 'clinic_notification', metadata: { key, sender, reason, state, to_suffix: to.slice(-4), length: text.length } }).then(() => null, () => null);
  return reply({ state, provider_id: after.data?.provider_id ?? null, duplicate: false }, state === 'accepted' ? 200 : 502);
}
