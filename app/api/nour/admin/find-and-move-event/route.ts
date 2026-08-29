import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { assertNourAuth } from '@/lib/nour-auth';

/**
 * POST /api/nour/admin/find-and-move-event
 *
 * Admin: find events on a given date, optionally move a specific event
 * to a new start time.
 *
 * Body: { date_iso: "YYYY-MM-DD", event_id?: string, new_start_iso?: string, new_duration_minutes?: number }
 */
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const unauth = assertNourAuth(req);
  if (unauth) return unauth;

  const body = await req.json();
  const { date_iso, event_id, new_start_iso, new_duration_minutes } = body;

  const jsonStr = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!jsonStr) return NextResponse.json({ error: 'sa_missing' });
  const credentials = JSON.parse(jsonStr);
  const impersonate = 'bnamouz@magickidsinstitute.com';

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
    subject: impersonate,
  });
  const calendar = google.calendar({ version: 'v3', auth });

  // If event_id provided, get its details
  if (event_id) {
    try {
      const ev = await calendar.events.get({ calendarId: 'primary', eventId: event_id });

      // If new_start_iso provided, patch it
      if (new_start_iso) {
        const startMs = new Date(new_start_iso).getTime();
        const durMin = new_duration_minutes || 30;
        const endIso = new Date(startMs + durMin * 60_000).toISOString();

        const updated = await calendar.events.patch({
          calendarId: 'primary',
          eventId: event_id,
          requestBody: {
            start: { dateTime: new_start_iso, timeZone: 'Asia/Jerusalem' },
            end: { dateTime: endIso, timeZone: 'Asia/Jerusalem' },
          },
        });
        return NextResponse.json({
          action: 'moved',
          before: { start: ev.data.start, end: ev.data.end },
          after: { start: updated.data.start, end: updated.data.end },
          event_id: updated.data.id,
          event_link: updated.data.htmlLink,
        });
      }

      return NextResponse.json({
        action: 'found',
        event: {
          id: ev.data.id,
          summary: ev.data.summary,
          description: ev.data.description,
          start: ev.data.start,
          end: ev.data.end,
          link: ev.data.htmlLink,
          status: ev.data.status,
        },
      });
    } catch (err: any) {
      return NextResponse.json({ error: 'event_error', details: err?.message });
    }
  }

  // Otherwise list events on the date
  if (!date_iso) return NextResponse.json({ error: 'date_iso_required' });

  const dayStart = new Date(`${date_iso}T00:00:00+03:00`).toISOString();
  const dayEnd = new Date(`${date_iso}T23:59:59+03:00`).toISOString();

  const list = await calendar.events.list({
    calendarId: 'primary',
    timeMin: dayStart,
    timeMax: dayEnd,
    singleEvents: true,
    orderBy: 'startTime',
  });

  return NextResponse.json({
    date_iso,
    count: list.data.items?.length || 0,
    events: (list.data.items || []).map((e) => ({
      id: e.id,
      summary: e.summary,
      description: e.description,
      start: e.start,
      end: e.end,
      link: e.htmlLink,
    })),
  });
}
