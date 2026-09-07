import { intakeProgress } from '@/lib/intake/progress';
import { createHmac, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getCalendarClient, getCalendarId } from '@/lib/google-calendar';
import { getPediatricsCalendarId } from '@/lib/pediatrics-calendar';
import { getSupabaseAdmin } from '@/lib/supabase';
import { candidateSlots, durationFor, freeSlots, overlaps, parseFreeBusy, TIME_ZONE, type Clinic } from './schedule';

export class BookingError extends Error {
  constructor(public code: string, public status = 503) { super(code); }
}
const name = z.string().trim().min(2).max(100).refine(value => !/[\r\n\x00-\x1f]/.test(value));
export const bookingSchema = z.object({
  requestId: z.string().uuid(),
  start: z.string().datetime(),
  childName: name,
  parentName: name,
  phone: z.string().trim().regex(/^[+\d() .-]{7,25}$/),
  parentToken: z.string().uuid().optional(),
  consent: z.literal(true),
  website: z.literal('').default(''),
}).strict();
type BookingBody = z.infer<typeof bookingSchema>;

export function bookingSettings() {
  if (process.env.PUBLIC_BOOKING_ENABLED !== 'true' || !process.env.BOOKING_HASH_SECRET || process.env.BOOKING_HASH_SECRET.length < 32) throw new BookingError('unavailable');
  const ids = { pediatrics: getPediatricsCalendarId().trim(), adhd: getCalendarId().trim() };
  // A generic "primary" calendar cannot establish two distinct clinic targets.
  if (!ids.pediatrics || !ids.adhd || ids.pediatrics === ids.adhd || Object.values(ids).includes('primary')) throw new BookingError('unavailable');
  return ids;
}
function digest(value: string) {
  return createHmac('sha256', process.env.BOOKING_HASH_SECRET!).update(value).digest('hex');
}
async function ensureWritable(ids: string[]) {
  try {
    const client = getCalendarClient();
    const calendars = await Promise.all(ids.map(calendarId => client.calendarList.get({ calendarId })));
    if (calendars.some(calendar => !['writer', 'owner'].includes(calendar.data.accessRole ?? ''))) throw new Error();
  } catch { throw new BookingError('unavailable'); }
}
async function busyFromGoogle(start: string, end: string, ids: string[]) {
  const response = await getCalendarClient().freebusy.query({ requestBody: { timeMin: start, timeMax: end, timeZone: TIME_ZONE, items: ids.map(id => ({ id })) } });
  return parseFreeBusy(response.data.calendars, ids);
}
export async function getSlots(clinic: Clinic) {
  const ids = bookingSettings();
  await ensureWritable(Object.values(ids));
  const candidates = candidateSlots(clinic);
  if (!candidates.length) return [];
  const from = candidates[0];
  const to = new Date(Date.parse(candidates[candidates.length - 1]) + durationFor(clinic) * 60000).toISOString();
  const [busy, held] = await Promise.all([
    busyFromGoogle(from, to, Object.values(ids)),
    getSupabaseAdmin().from('website_bookings').select('id,status,calendar_id,event_id,starts_at,ends_at').neq('status', 'released').lt('starts_at', to).gt('ends_at', from).limit(1000),
  ]);
  if (held.error || (held.data?.length ?? 0) >= 1000) throw new BookingError('unavailable');
  // Staff can cancel in Google Calendar. Release a confirmed website hold only
  // after Google explicitly confirms that event is absent/cancelled. Uncertain
  // pending writes remain reserved for retry or staff reconciliation.
  const released = new Set<string>();
  for (const row of (held.data ?? []).filter(row => row.status === 'confirmed' && !busy.some(interval => overlaps(row.starts_at, row.ends_at, interval))).slice(0, 25)) {
    let cancelled = false;
    try { cancelled = (await getCalendarClient().events.get({ calendarId: row.calendar_id, eventId: row.event_id })).data.status === 'cancelled'; }
    catch (error) { if (isMissing(error)) cancelled = true; }
    if (cancelled) {
      const db = getSupabaseAdmin();
      const result = await db.from('website_bookings').update({ status: 'released', updated_at: new Date().toISOString() }).eq('id', row.id).eq('status', 'confirmed');
      if (!result.error) {
        released.add(row.id);
        await db.from('appointments').update({ status: 'cancelled' }).eq('gcal_event_id', row.event_id).eq('gcal_calendar_id', row.calendar_id).eq('status', 'scheduled');
      }
    }
  }
  return freeSlots(clinic, candidates, [...busy, ...(held.data ?? []).filter(row => !released.has(row.id)).map(row => ({ start: row.starts_at, end: row.ends_at }))]);
}

export async function checkIntake(token: string, retryEventId?: string) {
  if (!z.string().uuid().safeParse(token).success) throw new BookingError('invalid_intake', 403);
  const db = getSupabaseAdmin();
  const { data: session, error } = await db.from('intake_sessions')
    .select('id,patient_id,parent_token_expires_at,patients(first_name,last_name)')
    .eq('parent_token', token).maybeSingle();
  if (error) throw new BookingError('unavailable');
  if (!session || !session.parent_token_expires_at || Date.parse(session.parent_token_expires_at) <= Date.now() || !Number.isFinite(Date.parse(session.parent_token_expires_at))) throw new BookingError('invalid_intake', 403);
  const { data: forms, error: formError } = await db.from('questionnaires').select('type,is_complete,submitted_at,responses').eq('session_id', session.id);
  if (formError || !forms) throw new BookingError('unavailable');
  if (!intakeProgress(forms).bothComplete) throw new BookingError('intake_incomplete', 409);
  const { data: existing, error: appointmentError } = await db.from('appointments').select('id,gcal_event_id')
    .eq('session_id', session.id).eq('status', 'scheduled').gte('scheduled_at', new Date().toISOString()).limit(1);
  if (appointmentError) throw new BookingError('unavailable');
  if (existing?.some(row => row.gcal_event_id !== retryEventId)) throw new BookingError('already_booked', 409);
  const patient = Array.isArray(session.patients) ? session.patients[0] : session.patients;
  return { id: session.id, patientId: session.patient_id, childName: `${patient?.first_name ?? ''} ${patient?.last_name ?? ''}`.trim() };
}
function isMissing(error: unknown) {
  return [404, 410].includes(Number((error as { code?: number })?.code));
}
function confirmed(clinic: Clinic, start: string, reference: string) {
  return { confirmed: true, clinic, start, durationMinutes: durationFor(clinic), reference };
}

export async function book(clinic: Clinic, body: BookingBody, clientIp: string) {
  const ids = bookingSettings();
  const phoneDigits = body.phone.replace(/\D/g, '');
  let phone = body.phone.startsWith('+') ? `+${phoneDigits}` : phoneDigits.startsWith('0') ? `+972${phoneDigits.slice(1)}` : `+${phoneDigits}`;
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) throw new BookingError('invalid_body', 400);
  const start = new Date(body.start).toISOString();
  const end = new Date(Date.parse(start) + durationFor(clinic) * 60000).toISOString();
  const fingerprint = digest(JSON.stringify([clinic, start, body.childName, body.parentName, phone, body.parentToken ?? '']));
  const db = getSupabaseAdmin();
  const { data: prior, error: priorError } = await db.from('website_bookings').select('*').eq('id', body.requestId).maybeSingle();
  if (priorError) throw new BookingError('unavailable');
  if (prior && prior.fingerprint !== fingerprint) throw new BookingError('invalid_retry', 409);
  if (prior?.status === 'confirmed') return confirmed(clinic, prior.starts_at, prior.id);
  if (prior?.status === 'released') throw new BookingError('slot_taken', 409);
  await ensureWritable(Object.values(ids));
  if (!prior && !candidateSlots(clinic).includes(start)) throw new BookingError('invalid_slot', 400);
  const eventId = `mk${body.requestId.replaceAll('-', '')}`; // Calendar-compatible, stable across retries.
  const intake = clinic === 'adhd' ? await checkIntake(body.parentToken ?? '', prior ? eventId : undefined) : null;
  const attemptId = randomUUID();
  const { data: reservation, error: reservationError } = await db.rpc('reserve_website_booking', {
    p_id: body.requestId, p_clinic: clinic, p_start: start, p_end: end,
    p_fingerprint: fingerprint, p_phone_hash: digest(`phone:${phone}`), p_ip_hash: digest(`ip:${clientIp}`),
    p_session_id: intake?.id ?? null, p_calendar_id: ids[clinic], p_event_id: eventId, p_attempt_id: attemptId,
  });
  if (reservationError) throw new BookingError('unavailable');
  if (reservation === 'confirmed') return confirmed(clinic, start, body.requestId);
  if (reservation === 'processing') throw new BookingError('processing', 503);
  if (reservation !== 'pending') throw new BookingError(reservation === 'released' ? 'slot_taken' : String(reservation), reservation === 'rate_limited' ? 429 : 409);

  const calendar = getCalendarClient();
  const calendarId = prior?.calendar_id ?? ids[clinic];
  // Resolve an uncertain earlier write before attempting another insert.
  let event;
  try { event = (await calendar.events.get({ calendarId, eventId })).data; }
  catch (error) { if (!isMissing(error)) throw new BookingError('processing', 503); }
  if (event?.status === 'cancelled') {
    await db.from('website_bookings').update({ status: 'released', updated_at: new Date().toISOString() }).eq('id', body.requestId).eq('attempt_id', attemptId);
    throw new BookingError('slot_taken', 409);
  }
  if (!event) {
    let available;
    try {
      const busy = await busyFromGoogle(start, end, Object.values(ids));
      available = freeSlots(clinic, [start], busy).length === 1;
    } catch { throw new BookingError('processing', 503); }
    if (!available) {
      await db.from('website_bookings').update({ status: 'released', updated_at: new Date().toISOString() }).eq('id', body.requestId).eq('attempt_id', attemptId);
      throw new BookingError('slot_taken', 409);
    }
    try {
      event = (await calendar.events.insert({ calendarId, sendUpdates: 'none', requestBody: {
        id: eventId,
        summary: `${clinic === 'adhd' ? 'אבחון קשב וריכוז' : 'מרפאת ילדים'} — ${intake?.childName || body.childName}`,
        description: `הורה: ${body.parentName}\nטלפון: ${phone}\nנקבע באתר המכון\nאסמכתא: ${body.requestId}`,
        location: 'תופיק זיאד 21, שפרעם',
        start: { dateTime: start, timeZone: TIME_ZONE }, end: { dateTime: end, timeZone: TIME_ZONE },
        visibility: 'private', transparency: 'opaque',
        extendedProperties: { private: { websiteBooking: body.requestId, clinic } },
      } })).data;
    } catch {
      // Timeout/409 may mean the insert already succeeded. Never release the
      // reservation or create another ID until the result has been reconciled.
      try { event = (await calendar.events.get({ calendarId, eventId })).data; }
      catch { throw new BookingError('processing', 503); }
    }
  }
  if (!event?.id || event.status === 'cancelled' || event.extendedProperties?.private?.websiteBooking !== body.requestId || event.extendedProperties?.private?.clinic !== clinic
    || Date.parse(event.start?.dateTime ?? '') !== Date.parse(start) || Date.parse(event.end?.dateTime ?? '') !== Date.parse(end)) throw new BookingError('processing', 503);
  if (intake) {
    const existing = await db.from('appointments').select('id').eq('gcal_event_id', eventId).maybeSingle();
    if (existing.error) throw new BookingError('processing', 503);
    if (!existing.data) {
      const saved = await db.from('appointments').upsert({ id: body.requestId, session_id: intake.id, patient_id: intake.patientId, appointment_type: 'assessment', scheduled_at: start, duration_minutes: durationFor(clinic), status: 'scheduled', gcal_event_id: eventId, gcal_calendar_id: calendarId, location: 'תופיק זיאד 21, שפרעם', notes: 'נקבע באתר המכון' }, { onConflict: 'id', ignoreDuplicates: true });
      if (saved.error) throw new BookingError('processing', 503);
    }
  }
  const saved = await db.from('website_bookings').update({ status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', body.requestId).eq('attempt_id', attemptId).neq('status', 'released').select('id').single();
  if (saved.error || !saved.data) throw new BookingError('processing', 503);
  return confirmed(clinic, start, body.requestId);
}
