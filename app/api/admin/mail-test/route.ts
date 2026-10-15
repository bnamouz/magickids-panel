import { NextRequest, NextResponse } from 'next/server';
import { getCurrentStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { emailOnce, mailConfigured } from '@/lib/therapists/mail';
import { OWNER_MAIL_TEST } from '@/lib/therapists/owner-mail-test-copy';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET() {
  if ((await getCurrentStaff())?.role !== 'admin') return reply({ state: 'forbidden' }, 403);
  try {
    const { data, error } = await getSupabaseAdmin().from('clinic_notifications')
      .select('state').eq('id', OWNER_MAIL_TEST.id).maybeSingle();
    if (error) return reply({ state: 'unavailable' }, 503);
    return reply({ state: data?.state ?? 'not_requested', configured: mailConfigured() });
  } catch {
    return reply({ state: 'unavailable' }, 503);
  }
}

export async function POST(req: NextRequest) {
  if ((await getCurrentStaff())?.role !== 'admin' || req.headers.get('origin') !== req.nextUrl.origin)
    return reply({ state: 'forbidden' }, 403);
  const body = await req.json().catch(() => null);
  if (!body || Object.keys(body).length !== 1 || body.confirm !== true)
    return reply({ state: 'invalid_request' }, 400);
  try {
    // Existing atomic claim and stable ID prevent duplicate sends, including concurrent requests.
    // No appointments, patient data, calendars, alternate senders or automatic retries.
    const state = await emailOnce(OWNER_MAIL_TEST.id, OWNER_MAIL_TEST.to, OWNER_MAIL_TEST.subject, OWNER_MAIL_TEST.body);
    return reply({ state });
  } catch {
    return reply({ state: 'unknown' }, 503);
  }
}
