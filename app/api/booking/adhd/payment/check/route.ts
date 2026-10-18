import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { isBookingToken, tokenHash } from '@/lib/booking/payment-tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store, max-age=0', 'Referrer-Policy': 'no-referrer' } });
/** Validates the personal booking link sent after the payment was approved. */
export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin) return reply({ error: 'invalid_origin' }, 403);
  const body = await req.json().catch(() => ({}));
  if (!isBookingToken(body.payToken)) return reply({ error: 'invalid_payment' }, 403);
  const r = await getSupabaseAdmin().from('adhd_payment_requests').select('visit_type,fund,status,moxo').eq('booking_token_hash', tokenHash(body.payToken)).maybeSingle();
  if (r.error) return reply({ error: 'unavailable' }, 503);
  if (!r.data) return reply({ error: 'invalid_payment' }, 403);
  if (r.data.status === 'booked') return reply({ error: 'payment_used' }, 409);
  if (r.data.status !== 'approved') return reply({ error: 'invalid_payment' }, 403);
  return reply({ ok: true, visitType: r.data.visit_type, fund: r.data.fund, moxo: r.data.moxo });
}
