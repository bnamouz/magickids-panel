/**
 * Clinic operating hours for Dr. Baseem Namouz (pediatrics).
 *
 * These are the hours Nour is allowed to offer for booking on
 * Dr. Baseem's PERSONAL calendar (pediatric clinic visits, 10 minutes each).
 *
 * Weekdays follow JS convention: 0=Sunday, 1=Monday, ... 6=Saturday.
 *
 * Notes:
 *  - Sunday (0) is closed — clinic is off.
 *  - Wednesday (3) has two segments; the morning is for blood-draws
 *    and the mid-morning is the pediatric-clinic window Nour may book.
 *    ADHD assessments handled by Sarah on Wed 16:00–20:00 are NOT
 *    booked by Nour and are excluded here.
 *
 * Timezone is Asia/Jerusalem for all wall-clock hours.
 */

export const CLINIC_TIMEZONE = 'Asia/Jerusalem';
export const CLINIC_SLOT_MINUTES = 10;

export type ClinicWindow = {
  /** Human-readable label, in Hebrew (for logs / UI). */
  label: string;
  /** Wall-clock start "HH:MM" (24h). */
  start: string;
  /** Wall-clock end "HH:MM" (24h). Exclusive of the last slot start = end - slotMinutes. */
  end: string;
  /** Whether Nour may book this window for regular pediatric visits. */
  bookable: boolean;
};

export type ClinicDay = {
  weekday: number; // 0..6
  windows: ClinicWindow[];
};

/**
 * Weekly schedule as agreed with Dr. Baseem (2026-08-30):
 *  Sunday    — closed
 *  Monday    10:00–15:00 pediatric clinic
 *  Tuesday   17:00–20:00 pediatric clinic
 *  Wednesday 07:30–09:00 blood draws (not bookable by Nour)
 *            10:00–13:00 pediatric clinic
 *            16:00–20:00 ADHD assessments — handled by Sarah (not Nour)
 *  Thursday  17:00–20:00 pediatric clinic
 *  Friday    09:30–12:30 pediatric clinic
 *  Saturday  09:30–12:30 pediatric clinic
 */
export const CLINIC_SCHEDULE: ClinicDay[] = [
  { weekday: 0, windows: [] }, // Sunday closed
  {
    weekday: 1,
    windows: [
      { label: 'מרפאת ילדים', start: '10:00', end: '15:00', bookable: true },
    ],
  },
  {
    weekday: 2,
    windows: [
      { label: 'מרפאת ילדים', start: '17:00', end: '20:00', bookable: true },
    ],
  },
  {
    weekday: 3,
    windows: [
      { label: 'בדיקות דם', start: '07:30', end: '09:00', bookable: false },
      { label: 'מרפאת ילדים', start: '10:00', end: '13:00', bookable: true },
      // 16:00–20:00 ADHD assessments — Sarah's flow, NOT bookable by Nour.
    ],
  },
  {
    weekday: 4,
    windows: [
      { label: 'מרפאת ילדים', start: '17:00', end: '20:00', bookable: true },
    ],
  },
  {
    weekday: 5,
    windows: [
      { label: 'מרפאת ילדים', start: '09:30', end: '12:30', bookable: true },
    ],
  },
  {
    weekday: 6,
    windows: [
      { label: 'מרפאת ילדים', start: '09:30', end: '12:30', bookable: true },
    ],
  },
];

/**
 * Parses "HH:MM" into total minutes past midnight (local wall time).
 */
function parseHm(hm: string): number {
  const [h, m] = hm.split(':').map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) {
    throw new Error(`Invalid HH:MM value: ${hm}`);
  }
  return h * 60 + m;
}

/**
 * Returns the wall-clock offset (in minutes) from UTC for Asia/Jerusalem
 * at a given UTC instant. Positive = ahead of UTC (e.g. IDT = +180).
 *
 * Uses Intl.DateTimeFormat rather than a fixed offset so DST changes are
 * respected automatically without extra dependencies.
 */
function jerusalemOffsetMinutes(utcInstant: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TIMEZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(utcInstant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const year = parseInt(get('year'), 10);
  const month = parseInt(get('month'), 10);
  const day = parseInt(get('day'), 10);
  const hour = parseInt(get('hour'), 10) % 24;
  const minute = parseInt(get('minute'), 10);
  const second = parseInt(get('second'), 10);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return Math.round((asUtc - utcInstant.getTime()) / 60000);
}

/**
 * Builds a Date representing YYYY-MM-DD HH:MM in Asia/Jerusalem, correctly
 * accounting for DST. Returns the resulting UTC instant.
 */
export function jerusalemDateTime(
  year: number,
  month1to12: number,
  day: number,
  hour: number,
  minute: number
): Date {
  const naiveUtc = Date.UTC(year, month1to12 - 1, day, hour, minute, 0);
  // First approximation with a temporary Date near the target
  const approx = new Date(naiveUtc);
  const offset = jerusalemOffsetMinutes(approx);
  return new Date(naiveUtc - offset * 60000);
}

/**
 * Returns the Jerusalem-local weekday (0..6) for a UTC instant.
 */
export function jerusalemWeekday(utcInstant: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TIMEZONE,
    weekday: 'short',
  });
  const wk = dtf.format(utcInstant);
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[wk] ?? 0;
}

/**
 * Returns Jerusalem-local Y/M/D for a UTC instant.
 */
export function jerusalemYmd(utcInstant: Date): { y: number; m: number; d: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = dtf.formatToParts(utcInstant);
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? '0', 10);
  return { y: get('year'), m: get('month'), d: get('day') };
}

export type Slot = {
  /** ISO string in UTC. */
  startIso: string;
  /** ISO string in UTC (start + 10 minutes). */
  endIso: string;
  /** Wall-clock "HH:MM" in Jerusalem for the start. */
  startLocal: string;
  /** Weekday of the slot (Jerusalem-local). */
  weekday: number;
  /** Window label from the schedule. */
  windowLabel: string;
};

/**
 * Generates every 10-minute clinic slot on a given Jerusalem-local date
 * that belongs to a bookable window.
 */
export function slotsForDate(dateYmd: { y: number; m: number; d: number }): Slot[] {
  // Determine weekday from midday to avoid DST edge on the day boundary.
  const midday = jerusalemDateTime(dateYmd.y, dateYmd.m, dateYmd.d, 12, 0);
  const weekday = jerusalemWeekday(midday);
  const day = CLINIC_SCHEDULE.find((d) => d.weekday === weekday);
  if (!day) return [];

  const slots: Slot[] = [];
  for (const win of day.windows) {
    if (!win.bookable) continue;
    const startMin = parseHm(win.start);
    const endMin = parseHm(win.end);
    for (let t = startMin; t + CLINIC_SLOT_MINUTES <= endMin; t += CLINIC_SLOT_MINUTES) {
      const h = Math.floor(t / 60);
      const m = t % 60;
      const startUtc = jerusalemDateTime(dateYmd.y, dateYmd.m, dateYmd.d, h, m);
      const endUtc = new Date(startUtc.getTime() + CLINIC_SLOT_MINUTES * 60000);
      slots.push({
        startIso: startUtc.toISOString(),
        endIso: endUtc.toISOString(),
        startLocal: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        weekday,
        windowLabel: win.label,
      });
    }
  }
  return slots;
}

/**
 * Returns the next `days` days of slots starting from `fromUtc`, skipping
 * slots whose start is already in the past.
 */
export function upcomingSlots(fromUtc: Date, days: number): Slot[] {
  const out: Slot[] = [];
  const startYmd = jerusalemYmd(fromUtc);
  for (let i = 0; i < days; i++) {
    // Advance by 24h and re-derive Jerusalem Y/M/D to survive DST.
    const dayUtc = new Date(fromUtc.getTime() + i * 24 * 60 * 60 * 1000);
    const ymd = jerusalemYmd(dayUtc);
    // Use ymd from the advancing date, but on day 0 keep the caller's Y/M/D.
    const use = i === 0 ? startYmd : ymd;
    for (const s of slotsForDate(use)) {
      if (new Date(s.startIso).getTime() > fromUtc.getTime()) out.push(s);
    }
  }
  return out;
}

/**
 * Checks whether a proposed [startIso, endIso) matches EXACTLY one of the
 * scheduled 10-minute clinic slots. This is the guard rail Nour cannot bypass.
 */
export function isSlotAligned(startIso: string, endIso: string): {
  ok: boolean;
  reason?: string;
  slot?: Slot;
} {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const diffMin = Math.round((end.getTime() - start.getTime()) / 60000);
  if (diffMin !== CLINIC_SLOT_MINUTES) {
    return { ok: false, reason: `slot_must_be_${CLINIC_SLOT_MINUTES}_minutes` };
  }
  const ymd = jerusalemYmd(start);
  const daySlots = slotsForDate(ymd);
  const hit = daySlots.find((s) => s.startIso === start.toISOString());
  if (!hit) {
    return { ok: false, reason: 'outside_clinic_hours' };
  }
  return { ok: true, slot: hit };
}
