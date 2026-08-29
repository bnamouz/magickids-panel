import { NextRequest, NextResponse } from 'next/server';
import { assertNourAuth } from '@/lib/nour-auth';

/**
 * GET /api/nour/list-events?date=YYYY-MM-DD
 *
 * Lists user's Google Calendar events for the given date (or next 7 days
 * if no date given). Used by Nour to answer "האם ד"ר בסים פנוי מחר?".
 *
 * Delegates to Pipedream Google Calendar connector.
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

  const pipedreamToken = process.env.PIPEDREAM_GOOGLE_CAL_TOKEN;
  if (!pipedreamToken) {
    // Return empty schedule as fallback — Nour will fall back to
    // "בדוק ידני עם ד"ר בסים" flow
    return NextResponse.json({
      success: true,
      events: [],
      warning: 'calendar_not_configured',
    });
  }

  try {
    const gcalUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=20`;

    const response = await fetch(gcalUrl, {
      headers: { Authorization: `Bearer ${pipedreamToken}` },
    });

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: 'gcal_fetch_failed',
        status: response.status,
      });
    }

    const data = await response.json();
    const events = (data.items || []).map((e: any) => ({
      id: e.id,
      title: e.summary,
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      location: e.location,
    }));

    return NextResponse.json({ success: true, events, count: events.length });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'gcal_error', details: err.message });
  }
}
