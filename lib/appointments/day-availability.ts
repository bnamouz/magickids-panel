import type { calendar_v3 } from 'googleapis';
import { getCalendarClient, getCalendarId } from '@/lib/google-calendar';
import { getPediatricsCalendarId } from '@/lib/pediatrics-calendar';
import { getSupabaseAdmin } from '@/lib/supabase';
import { FOLLOWUP_QUARTERS, localToUTC } from '@/lib/booking/schedule';

/** ADHD clinic hours offered in the staff booking dialog (Wednesday 16:00–20:00). */
export const ADHD_HOURS = [16, 17, 18, 19];
export type Busy = { start: number; end: number; label: string };
export type HourAvailability = {
  hour: number; time: string;
  assessmentAvailable: boolean; takenBy: string | null;
  quarters: { minute: number; time: string; available: boolean; takenBy: string | null }[];
};
const SOURCE_HE: Record<string, string> = { website_bookings: 'תור מהאתר', appointments: 'פגישה במכון', moxo_requests: 'מבדק MOXO', treatment_requests: 'טיפול', therapist_booking_requests: 'טיפול' };
const hhmm = (h: number, m = 0) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

/** Pure: which hours/quarters of the day are free for the doctor given the busy intervals. */
export function hourAvailability(date: string, busy: Busy[]): HourAvailability[] {
  const overlap = (s: number, e: number) => busy.filter(b => b.start < e && b.end > s);
  return ADHD_HOURS.map(hour => {
    const start = localToUTC(date, hour * 60).getTime(), end = localToUTC(date, hour * 60 + 60).getTime();
    const hits = overlap(start, end);
    return {
      hour, time: hhmm(hour),
      assessmentAvailable: hits.length === 0,
      takenBy: hits.length ? [...new Set(hits.map(h => h.label))].join(', ') : null,
      quarters: FOLLOWUP_QUARTERS.map(minute => {
        const qs = localToUTC(date, hour * 60 + minute).getTime(), qe = qs + 15 * 60000;
        const q = overlap(qs, qe);
        return { minute, time: hhmm(hour, minute), available: q.length === 0, takenBy: q.length ? [...new Set(q.map(h => h.label))].join(', ') : null };
      }),
    };
  });
}

/** Everything that occupies the doctor on that day: database reservations (all booking tables) plus
 *  non-transparent Google events in the ADHD and pediatrics calendars (covers events added by hand). */
export async function dayBusy(date: string): Promise<{ busy: Busy[]; calendarFailed: boolean }> {
  const dayStart = localToUTC(date, 0), dayEnd = localToUTC(date, 24 * 60);
  const busy: Busy[] = [];
  const db = getSupabaseAdmin();
  const adhd = getCalendarId(), peds = getPediatricsCalendarId();
  const rows = await db.from('v_calendar_reservations').select('source,starts_at,ends_at,calendar_id,event_id,staff_resource')
    .lt('starts_at', dayEnd.toISOString()).gt('ends_at', dayStart.toISOString());
  if (rows.error) throw new Error('unavailable');
  const seenEvents = new Set<string>();
  for (const r of rows.data ?? []) {
    if (r.staff_resource !== 'doctor' && r.calendar_id !== adhd && r.calendar_id !== peds) continue; // therapists elsewhere do not block the doctor
    if (r.event_id) seenEvents.add(r.event_id);
    busy.push({ start: Date.parse(r.starts_at), end: Date.parse(r.ends_at), label: SOURCE_HE[r.source] ?? 'תפוס' });
  }
  let calendarFailed = false;
  try {
    const client = getCalendarClient();
    for (const calendarId of [...new Set([adhd, peds])]) {
      let pageToken: string | undefined;
      do {
        const r = await client.events.list({ calendarId, timeMin: dayStart.toISOString(), timeMax: dayEnd.toISOString(), singleEvents: true, showDeleted: false, maxResults: 250, pageToken, fields: 'nextPageToken,items(id,summary,start,end,status,transparency)' }, { timeout: 10000, retry: false });
        for (const e of (r.data.items ?? []) as calendar_v3.Schema$Event[]) {
          if (e.status === 'cancelled' || e.transparency === 'transparent' || !e.start?.dateTime || !e.end?.dateTime) continue;
          const start = Date.parse(e.start.dateTime), end = Date.parse(e.end.dateTime);
          const label = (e.summary ?? '').trim() || 'אירוע ביומן';
          // Prefer the calendar title (name first) over the generic database label for the same reservation.
          const mirrored = e.id && seenEvents.has(e.id) ? busy.find(b => b.start === start && b.end === end && !b.label.includes('·')) : undefined;
          if (mirrored) mirrored.label = label; else busy.push({ start, end, label });
        }
        pageToken = r.data.nextPageToken ?? undefined;
      } while (pageToken);
    }
  } catch { calendarFailed = true; }
  return { busy, calendarFailed };
}
