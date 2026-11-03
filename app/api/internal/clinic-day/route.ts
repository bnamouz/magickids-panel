import { NextRequest, NextResponse } from 'next/server';
import { secretOk } from '@/lib/clinic-patients/campaign';
import { getCalendarClient, getCalendarId } from '@/lib/google-calendar';
import { getPediatricsCalendarId } from '@/lib/pediatrics-calendar';
import { localToUTC, TIME_ZONE } from '@/lib/booking/schedule';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Phone as written by the booking flow ("טלפון: 05x…") or by staff; normalised to +972. */
function phoneFrom(description: string | null | undefined): string | null {
  const m = (description ?? '').match(/(?:\+?972|0)5\d[\s-]?\d{3}[\s-]?\d{4}/);
  if (!m) return null;
  const digits = m[0].replace(/\D/g, '');
  return digits.startsWith('972') ? `+${digits}` : `+972${digits.slice(1)}`;
}
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/**
 * Internal, read-only: the system calendar for one clinic day — who is booked, when, and the parent phone recorded
 * on the event. Used to prepare owner-approved reminders (sent one by one via /api/internal/whatsapp/send). Never public.
 */
export async function GET(req: NextRequest) {
  if (!secretOk(req.headers.get('x-campaign-secret'))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const day = req.nextUrl.searchParams.get('day') ?? '', clinic = req.nextUrl.searchParams.get('clinic') ?? 'adhd';
  if (!DAY.test(day) || !['adhd', 'pediatrics'].includes(clinic)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const calendarId = clinic === 'adhd' ? getCalendarId() : getPediatricsCalendarId();
  const next = new Date(Date.parse(day + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10);
  const r = await getCalendarClient().events.list({ calendarId, timeMin: localToUTC(day, 0).toISOString(), timeMax: localToUTC(next, 0).toISOString(), singleEvents: true, showDeleted: false, orderBy: 'startTime', maxResults: 250, fields: 'items(id,summary,description,start,end,status,transparency,extendedProperties)' }, { timeout: 15000 });
  const events = (r.data.items ?? []).filter(e => e.start?.dateTime && e.end?.dateTime).map(e => {
    const priv = e.extendedProperties?.private ?? {};
    const phone = phoneFrom(e.description);
    return { id: e.id, summary: e.summary ?? '', start: e.start!.dateTime, end: e.end!.dateTime, time: fmt.format(new Date(e.start!.dateTime!)), end_time: fmt.format(new Date(e.end!.dateTime!)),
      phone_masked: phone ? phone.slice(0, 7) + '***' + phone.slice(-3) : null, phone, appointment_id: priv.appointmentId ?? null, booking_id: priv.bookingId ?? priv.websiteBookingId ?? null,
      transparency: e.transparency ?? 'opaque', location_hint: /תופיק|توفيق/.test(e.description ?? '') ? 'clinic' : 'institute' };
  });
  return NextResponse.json({ clinic, day, count: events.length, events }, { headers: { 'Cache-Control': 'private, no-store' } });
}
