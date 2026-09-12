export type Clinic = 'pediatrics' | 'adhd';
export const TIME_ZONE = 'Asia/Jerusalem';
export const HORIZON_DAYS = 28;
export const LEAD_MINUTES = 120;
export const durationFor = (clinic: Clinic) => clinic === 'adhd' ? 60 : 10;
export const isClinic = (value: string): value is Clinic => value === 'pediatrics' || value === 'adhd';

// Existing published clinic hours; ADHD assessments follow the existing
// Wednesday 16:00–20:00 intake workflow. All times are Israeli local time.
const HOURS: Record<Clinic, Record<number, [number, number]>> = {
  pediatrics: { 1: [540, 960], 2: [1020, 1200], 3: [960, 1200], 4: [1020, 1200], 5: [570, 750], 6: [570, 750] },
  adhd: { 3: [960, 1200] },
};
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
export function localParts(date: Date) {
  const p = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute), seconds: Number(p.second) };
}
export function localToUTC(day: string, minutes: number): Date {
  const target = Date.parse(`${day}T00:00:00Z`) + minutes * 60000;
  let value = target;
  for (let i = 0; i < 3; i++) {
    const local = localParts(new Date(value));
    const represented = Date.parse(`${local.date}T00:00:00Z`) + local.minutes * 60000;
    value += target - represented;
  }
  return new Date(value);
}
export function candidateSlots(clinic: Clinic, now = new Date()): string[] {
  const today = Date.parse(`${localParts(now).date}T00:00:00Z`);
  const slots: string[] = [];
  for (let offset = 0; offset < HORIZON_DAYS; offset++) {
    const day = new Date(today + offset * 86400000);
    const hours = HOURS[clinic][day.getUTCDay()];
    if (!hours) continue;
    for (let minute = hours[0]; minute + durationFor(clinic) <= hours[1]; minute += durationFor(clinic)) {
      const at = localToUTC(day.toISOString().slice(0, 10), minute);
      if (at.getTime() >= now.getTime() + LEAD_MINUTES * 60000) slots.push(at.toISOString());
    }
  }
  return slots;
}
export type Busy = { start: string; end: string };
export function overlaps(start: string, end: string, busy: Busy) {
  return Date.parse(start) < Date.parse(busy.end) && Date.parse(end) > Date.parse(busy.start);
}
export function freeSlots(clinic: Clinic, candidates: string[], busy: Busy[]) {
  return candidates.filter(start => {
    const end = new Date(Date.parse(start) + durationFor(clinic) * 60000).toISOString();
    return !busy.some(interval => overlaps(start, end, interval));
  });
}
export function parseFreeBusy(calendars: Record<string, { busy?: Array<{ start?: string | null; end?: string | null }>; errors?: unknown[] }> | undefined | null, ids: string[]): Busy[] {
  return ids.flatMap(id => {
    const calendar = calendars?.[id];
    if (!calendar || calendar.errors?.length || !Array.isArray(calendar.busy)) throw new Error('calendar_unavailable');
    return calendar.busy.map(interval => {
      if (!interval.start || !interval.end || !Number.isFinite(Date.parse(interval.start)) || !Number.isFinite(Date.parse(interval.end)) || Date.parse(interval.end) <= Date.parse(interval.start)) throw new Error('calendar_unavailable');
      return { start: interval.start, end: interval.end };
    });
  });
}

export function isAssessmentSlot(iso: string, now = new Date()) {
 const value = new Date(iso);
 if (!Number.isFinite(value.getTime()) || value <= now) return false;
 const local = localParts(value);
 return new Date(`${local.date}T12:00:00Z`).getUTCDay() === 3 && [960,1020,1080,1140].includes(local.minutes) && local.seconds === 0 && value.getUTCMilliseconds() === 0;
}
