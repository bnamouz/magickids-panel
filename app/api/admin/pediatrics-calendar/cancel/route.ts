import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getCalendarClient } from '@/lib/google-calendar';
import { getPediatricsCalendarId } from '@/lib/pediatrics-calendar';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const schema = z.object({ eventId: z.string().min(1).max(200), reason: z.string().max(300).optional() }).strict();
const missing = (e: unknown) => [404, 410].includes(Number((e as { code?: number })?.code ?? (e as { response?: { status?: number } })?.response?.status));

/** Staff cancellation of a pediatrics-calendar appointment (e.g. the family asked by phone/WhatsApp):
 *  deletes the Google event, releases the mirrored website booking so the slot opens again, records an audit row. */
export async function POST(req: NextRequest) {
  const staff = await getCurrentStaff();
  if (!staff || req.headers.get('origin') !== req.nextUrl.origin) return reply({ error: 'forbidden' }, 403);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return reply({ error: 'invalid_body' }, 400);
  const { eventId, reason } = parsed.data;
  const calendarId = getPediatricsCalendarId();
  const calendar = getCalendarClient();
  let summary: string | null = null, start: string | null = null, bookingId: string | null = null, already = false;
  try {
    const ev = (await calendar.events.get({ calendarId, eventId }, { timeout: 10000, retry: false })).data;
    summary = ev.summary ?? null; start = ev.start?.dateTime ?? ev.start?.date ?? null; bookingId = ev.extendedProperties?.private?.websiteBooking ?? null;
    if (ev.status === 'cancelled') already = true;
    else if (ev.start?.date) return reply({ error: 'all_day' }, 409); // all-day blocks are managed in Google Calendar / clinic hours
    else await calendar.events.delete({ calendarId, eventId, sendUpdates: 'none' }, { timeout: 10000, retry: false });
  } catch (e) {
    if (missing(e)) already = true; else return reply({ error: 'calendar_unavailable' }, 503);
  }
  const db = getSupabaseAdmin();
  const released = await db.from('website_bookings').update({ status: 'released', updated_at: new Date().toISOString() }).eq('event_id', eventId).eq('calendar_id', calendarId).neq('status', 'released').select('id');
  if (released.error) return reply({ error: 'db' }, 503);
  await db.from('audit_log').insert({ actor_id: staff.id, actor_type: 'user', action: 'pediatrics_appointment_cancelled', entity_type: 'website_booking', entity_id: bookingId ?? released.data?.[0]?.id ?? null, metadata: { event_id: eventId, summary, start, reason: reason?.trim() || null, already_gone: already, released: (released.data ?? []).length } }).then(() => null, () => null);
  return reply({ ok: true, already, released: (released.data ?? []).length });
}
