import { NextRequest, NextResponse } from 'next/server';
import { book, bookingSchema, BookingError, getSlots } from '@/lib/booking/server';
import { sendBookingConfirmation } from '@/lib/booking/confirmation-whatsapp';
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
export async function GET(req: NextRequest, { params }: { params: { clinic: string } }) {
  if (!isClinic(params.clinic)) return reply({ error: 'unknown_clinic' }, 404);
  const visitType = req.nextUrl.searchParams.get('visitType') ?? 'assessment';
  if (!['assessment', 'followup', 'flu'].includes(visitType) || (params.clinic !== 'adhd' && visitType === 'followup') || (params.clinic === 'adhd' && visitType === 'flu')) return reply({ error: 'invalid_body' }, 400);
  if (params.clinic === 'adhd' && visitType === 'assessment') return reply({ error: 'invalid_intake' }, 403);
  const kind = visitType as 'assessment' | 'followup' | 'flu';
  try { return reply({ clinic: params.clinic, timeZone: TIME_ZONE, durationMinutes: durationFor(params.clinic, kind), slots: await getSlots(params.clinic, kind), remindersEnabled: process.env.BOOKING_REMINDERS_ENABLED === 'true' && !!process.env.ULTRAMSG_INSTANCE_ID && !!process.env.ULTRAMSG_TOKEN }); }
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
    // The public ADHD form must state the health fund; payment rules depend on it.
    if (params.clinic === 'adhd' && !parsed.data.fund) return reply({ error: 'fund_required' }, 400);
    if (params.clinic !== 'adhd' && (parsed.data.fund || parsed.data.payToken)) return reply({ error: 'invalid_body' }, 400);
    const result = await book(params.clinic, parsed.data, req.ip || 'unknown');
    // WhatsApp confirmation with the personal cancellation link; never fails the booking itself.
    let whatsapp = 'not_sent';
    if (result.confirmed) {
      const lang = parsed.data.language === 'he' || parsed.data.language === 'en' ? parsed.data.language : 'ar';
      whatsapp = (await sendBookingConfirmation({ clinic: result.clinic, visitType: parsed.data.visitType ?? 'assessment', start: result.start, durationMinutes: result.durationMinutes, childName: parsed.data.childName, parentName: parsed.data.parentName, phone: parsed.data.phone, reference: result.reference, lang }).catch(() => ({ state: 'unknown' }))).state;
    }
    return reply({ ...result, whatsapp });
  } catch (error) { return failure(error); }
}
