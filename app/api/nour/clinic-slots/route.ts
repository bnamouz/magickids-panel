import { NextRequest, NextResponse } from 'next/server';
import { assertNourAuth } from '@/lib/nour-auth';
import {
  listNourEvents,
  listClinicEvents,
  type NourEventSummary,
} from '@/lib/google-calendar-nour';
import {
  CLINIC_SLOT_MINUTES,
  jerusalemYmd,
  slotsForDate,
  upcomingSlots,
  type Slot,
} from '@/lib/clinic-hours';

/**
 * GET /api/nour/clinic-slots
 *
 * Returns the list of AVAILABLE 10-minute pediatric-clinic slots that Nour
 * is allowed to offer callers.
 *
 * Query params:
 *   - date=YYYY-MM-DD  → return every free slot on that Jerusalem-local date.
 *   - days=N (default 7, max 14) → when no date is passed, return every free
 *     slot in the next N days starting now.
 *
 * A slot is included only when:
 *   1. It falls inside a bookable window from lib/clinic-hours.ts, AND
 *   2. There is no overlapping event on Dr. Baseem's personal calendar, AND
 *   3. There is no overlapping event on the clinic (Sarah) calendar.
 *
 * This mirrors the guard rails in POST /api/nour/book-meeting so the voice
 * agent's offers stay consistent with what the booking endpoint will accept.
 */
export const runtime = 'nodejs';

const MAX_DAYS = 14;
const DEFAULT_DAYS = 7;

export async function GET(req: NextRequest) {
  const unauth = assertNourAuth(req);
  if (unauth) return unauth;

  const url = new URL(req.url);
  const dateParam = url.searchParams.get('date');
  const daysParam = url.searchParams.get('days');

  const now = new Date();

  let candidateSlots: Slot[];
  let rangeStartIso: string;
  let rangeEndIso: string;

  if (dateParam) {
    // Parse YYYY-MM-DD as Jerusalem-local
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateParam);
    if (!m) {
      return NextResponse.json(
        { success: false, error: 'invalid_date', message: 'expected YYYY-MM-DD' },
        { status: 400 }
      );
    }
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    candidateSlots = slotsForDate({ y, m: mo, d }).filter(
      (s) => new Date(s.startIso).getTime() > now.getTime()
    );
    if (candidateSlots.length === 0) {
      return NextResponse.json({
        success: true,
        slot_minutes: CLINIC_SLOT_MINUTES,
        date: dateParam,
        slots: [],
      });
    }
    rangeStartIso = candidateSlots[0].startIso;
    rangeEndIso = candidateSlots[candidateSlots.length - 1].endIso;
  } else {
    const days = Math.min(
      MAX_DAYS,
      Math.max(1, parseInt(daysParam || String(DEFAULT_DAYS), 10) || DEFAULT_DAYS)
    );
    candidateSlots = upcomingSlots(now, days);
    if (candidateSlots.length === 0) {
      return NextResponse.json({
        success: true,
        slot_minutes: CLINIC_SLOT_MINUTES,
        days,
        slots: [],
      });
    }
    rangeStartIso = candidateSlots[0].startIso;
    rangeEndIso = candidateSlots[candidateSlots.length - 1].endIso;
  }

  // Fetch busy events across the full range from both calendars in parallel,
  // then filter candidate slots in memory. One list call per calendar instead
  // of one per slot keeps this cheap even for 14-day windows.
  let personal: NourEventSummary[] = [];
  let clinic: NourEventSummary[] = [];
  try {
    [personal, clinic] = await Promise.all([
      listNourEvents(rangeStartIso, rangeEndIso).catch(() => []),
      listClinicEvents(rangeStartIso, rangeEndIso).catch(() => []),
    ]);
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: 'availability_check_failed',
        details: err?.message || String(err),
      },
      { status: 502 }
    );
  }

  const busy = [...personal, ...clinic].map((e) => ({
    start: new Date(e.start).getTime(),
    end: new Date(e.end).getTime(),
    title: e.title,
    calendar: e.calendar,
  }));

  const freeSlots = candidateSlots.filter((s) => {
    const ss = new Date(s.startIso).getTime();
    const se = new Date(s.endIso).getTime();
    return !busy.some((b) => b.start < se && b.end > ss);
  });

  return NextResponse.json({
    success: true,
    slot_minutes: CLINIC_SLOT_MINUTES,
    ...(dateParam ? { date: dateParam } : { days: Math.min(MAX_DAYS, parseInt(daysParam || String(DEFAULT_DAYS), 10) || DEFAULT_DAYS) }),
    total_available: freeSlots.length,
    slots: freeSlots.map((s) => ({
      start_iso: s.startIso,
      end_iso: s.endIso,
      start_local: s.startLocal,
      weekday: s.weekday,
      window: s.windowLabel,
    })),
  });
}
