import { NextRequest, NextResponse } from 'next/server';
import { book, bookingSchema, BookingError, getSlots } from '@/lib/booking/server';
import { isClinic, TIME_ZONE, durationFor } from '@/lib/booking/schedule';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store, max-age=0', 'Referrer-Policy': 'no-referrer' };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
function failure(error: unknown) {
  // Google errors and clinical data must never appear in a public response/log.
  return error instanceof BookingError ? reply({ error: error.code }, error.status) : reply({ error: 'unavailable' }, 503);
}
export async function GET(_req: NextRequest, { params }: { params: { clinic: string } }) {
  if (!isClinic(params.clinic)) return reply({ error: 'unknown_clinic' }, 404);
  try { return reply({ clinic: params.clinic, timeZone: TIME_ZONE, durationMinutes: durationFor(params.clinic), slots: await getSlots(params.clinic), remindersEnabled: process.env.BOOKING_REMINDERS_ENABLED === 'true' && !!process.env.ULTRAMSG_INSTANCE_ID && !!process.env.ULTRAMSG_TOKEN }); }
  catch (error) { return failure(error); }
}
export async function POST(req: NextRequest, { params }: { params: { clinic: string } }) {
  if (!isClinic(params.clinic)) return reply({ error: 'unknown_clinic' }, 404);
  if (req.headers.get('origin') !== req.nextUrl.origin) return reply({ error: 'invalid_origin' }, 403);
  if (!req.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'invalid_body' }, 400);
  if (Number(req.headers.get('content-length')) > 8192) return reply({ error: 'invalid_body' }, 413);
  try {
    const raw = await req.text();
    if (raw.length > 8192) return reply({ error: 'invalid_body' }, 413);
    let input;
    try { input = JSON.parse(raw); } catch { return reply({ error: 'invalid_body' }, 400); }
    const parsed = bookingSchema.safeParse(input);
    if (!parsed.success) return reply({ error: 'invalid_body' }, 400);
    return reply(await book(params.clinic, parsed.data, req.ip || 'unknown'));
  } catch (error) { return failure(error); }
}
