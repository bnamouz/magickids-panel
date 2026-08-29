import { NextRequest, NextResponse } from 'next/server';
import { assertNourAuth } from '@/lib/nour-auth';
import { listNourEvents } from '@/lib/google-calendar-nour';

/**
 * GET /api/nour/list-events?date=YYYY-MM-DD
 *
 * Lists Dr. Baseem's personal Google Calendar events for the given date
 * (or next 7 days if no date given). Used by Nour to check availability
 * before offering appointment slots.
 */
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const unauth = assertNourAuth(req);
  if (unauth) return unauth;

  const url = new URL(req.url);
  const dateParam = url.searchParams.get('date');

  let timeMin: string;
  let timeMax: string;

  if (dateParam) {
    const day = new Date(dateParam + 'T00:00:00+03:00');
    timeMin = day.toISOString();
    const endDay = new Date(day);
    endDay.setDate(endDay.getDate() + 1);
    timeMax = endDay.toISOString();
  } else {
    timeMin = new Date().toISOString();
    const week = new Date();
    week.setDate(week.getDate() + 7);
    timeMax = week.toISOString();
  }

  try {
    const events = await listNourEvents(timeMin, timeMax);
    return NextResponse.json({ success: true, events, count: events.length });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: 'gcal_error',
      details: err?.message || String(err),
    });
  }
}
