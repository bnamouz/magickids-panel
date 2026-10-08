// Opt-in request/approval scheduling. Existing therapist and clinic rules are unchanged.
import { localParts, localToUTC, overlaps, type Busy } from '../booking/schedule';

export type RequestWindow = { day: number; start: number; end: number; duration: number };
export type RequestAvailability = { windows: RequestWindow[]; closedDates: string[] };
export type RequestSlot = { start: string; end: string; day: string; duration: number };
export const RANA_REQUEST_AVAILABILITY: RequestAvailability = {
  windows: [
    { day: 5, start: 510, end: 810, duration: 60 },
    { day: 5, start: 810, end: 900, duration: 45 },
  ],
  closedDates: [],
};
export const RANA_CALENDAR_ID = 'c_00c78f49814f6b6aace3c0798289964c531c12d5f253f2c452b1d395048fb4a5@group.calendar.google.com';
const realDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
  && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;

export function validateRequestAvailability(value: unknown): RequestAvailability {
  const v = value as RequestAvailability;
  if (!v || !Array.isArray(v.windows) || !Array.isArray(v.closedDates)
    || v.windows.length > 28 || v.closedDates.length > 100) throw new Error('invalid_availability');
  for (const w of v.windows) {
    if (!w || ![w.day, w.start, w.end, w.duration].every(Number.isInteger)
      || w.day < 0 || w.day > 6 || w.start < 0 || w.end > 1440 || w.end <= w.start
      || ![30, 45, 60, 90].includes(w.duration)
      || (w.end - w.start) % w.duration !== 0) throw new Error('invalid_availability');
  }
  if (v.windows.some((a, i) => v.windows.some((b, j) =>
    i < j && a.day === b.day && a.start < b.end && a.end > b.start))) throw new Error('overlapping_windows');
  if (!v.closedDates.every(realDate)) throw new Error('invalid_availability');
  return { windows: v.windows.map(w => ({ day: w.day, start: w.start, end: w.end, duration: w.duration })),
    closedDates: [...new Set(v.closedDates)] };
}

export function requestSlots(
  availability: RequestAvailability,
  busy: Busy[] = [],
  now = new Date(),
  leadMinutes = 60,
): RequestSlot[] {
  const today = Date.parse(`${localParts(now).date}T00:00:00Z`);
  const result: RequestSlot[] = [];
  for (let offset = 0; offset < 28; offset++) {
    const date = new Date(today + offset * 86400000);
    const day = date.toISOString().slice(0, 10);
    if (availability.closedDates.includes(day)) continue;
    for (const w of availability.windows.filter(w => w.day === date.getUTCDay())) {
      for (let m = w.start; m + w.duration <= w.end; m += w.duration) {
        const start = localToUTC(day, m).toISOString();
        const end = localToUTC(day, m + w.duration).toISOString();
        // Skip nonexistent clock times and DST-crossing sessions rather than
        // silently displaying a different hour or duration.
        const represented = localParts(new Date(start));
        if (represented.date !== day || represented.minutes !== m
          || Date.parse(end) - Date.parse(start) !== w.duration * 60000) continue;
        if (Date.parse(start) <= now.getTime() + leadMinutes * 60000) continue;
        if (busy.some(b => overlaps(start, end, b))) continue;
        result.push({ start, end, day, duration: w.duration });
      }
    }
  }
  return result.sort((a, b) => a.start.localeCompare(b.start));
}
