import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { notifyOnce } from '@/lib/moxo/notification';
import { OWNER_WHATSAPP_TEST } from '@/lib/appointments/owner-whatsapp-test';
import { ownerWhatsAppIdentity } from '@/lib/appointments/owner-whatsapp-identity';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const consent = z.object({ confirm: z.literal(true) }).strict();
async function storedState() {
  const { data, error } = await getSupabaseAdmin().from('clinic_notifications')
    .select('state').eq('id', OWNER_WHATSAPP_TEST.id).maybeSingle();
  if (error) throw new Error('unavailable');
  return data?.state ?? 'not_requested';
}

export async function GET() {
  if ((await getCurrentStaff())?.role !== 'admin') return reply({ state: 'forbidden' }, 403);
  try {
    const state = await storedState();
    const identity = await ownerWhatsAppIdentity();
    return reply({ state, identity, configured: identity === 'verified' });
  } catch { return reply({ state: 'unavailable', configured: false }, 503); }
}

export async function POST(req: NextRequest) {
  if ((await getCurrentStaff())?.role !== 'admin' || req.headers.get('origin') !== req.nextUrl.origin)
    return reply({ state: 'forbidden' }, 403);
  if (!consent.safeParse(await req.json().catch(() => null)).success)
    return reply({ state: 'invalid_request' }, 400);
  try {
    const prior = await storedState();
    if (!['not_requested', 'pending'].includes(prior)) return reply({ state: prior });
    const identity = await ownerWhatsAppIdentity();
    if (identity !== 'verified') return reply({ state: identity }, 503);
    // Existing atomic once-only claim protects against concurrent clicks and reloads.
    const state = await notifyOnce(OWNER_WHATSAPP_TEST.id, OWNER_WHATSAPP_TEST.to, OWNER_WHATSAPP_TEST.body);
    return reply({ state });
  } catch { return reply({ state: 'unknown' }, 503); }
}
