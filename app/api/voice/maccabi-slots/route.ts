import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { assertVoiceAuth } from '@/lib/voice-auth';

/**
 * GET /api/voice/maccabi-slots?weeks_ahead=4&max=3
 *
 * Returns up to `max` available 60-minute assessment slots on Wednesdays
 * between 16:00 and 20:00 Asia/Jerusalem, within the next `weeks_ahead`
 * Wednesdays. Uses the MAGIC KIDS Google Calendar via the shared service
 * account (same one used elsewhere in the app).
 */
export const runtime = 'nodejs';

const HE_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];
const AR_MONTHS = [
  'كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
  'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول',
];
const HE_DAY_WED = 'רביעי';
const AR_DAY_WED = 'الأربعاء';

function getCalendarClient() {
  const jsonStr = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!jsonStr) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured');
  const credentials = JSON.parse(jsonStr);
  const impersonate = process.env.GOOGLE_IMPERSONATE_USER?.trim();
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
    subject: impersonate || undefined,
  });
  return google.calendar({ version: 'v3', auth });
}

// Build a Date in Asia/Jerusalem for a given Y-M-D H:M by first computing the
// current UTC offset for Jerusalem at that instant.
function jerusalemDate(y: number, m: number, d: number, h: number, min: number): Date {
  // Construct a UTC date and then correct for the offset.
  const utc = new Date(Date.UTC(y, m, d, h, min));
  const tzStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    timeZoneName: 'shortOffset',
  })
    .formatToParts(utc)
    .find((p) => p.type === 'timeZoneName')?.value || 'GMT+2';
  // tzStr looks like "GMT+3" or "GMT+2"
  const match = tzStr.match(/GMT([+-])(\d+)/);
  const sign = match?.[1] === '-' ? -1 : 1;
  const offHours = match ? parseInt(match[2], 10) : 2;
  // Wall time (y,m,d,h,min) in Jerusalem == UTC time - offset hours
  return new Date(Date.UTC(y, m, d, h - sign * offHours, min));
}

function nextWednesdays(count: number, fromDate: Date = new Date()): Date[] {
  const list: Date[] = [];
  const cursor = new Date(fromDate);
  // Move to next (or current if it's still Wednesday early) Wednesday in Jerusalem.
  while (list.length < count) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jerusalem',
      weekday: 'short',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(cursor);
    const wd = parts.find((p) => p.type === 'weekday')?.value;
    const y = parseInt(parts.find((p) => p.type === 'year')!.value, 10);
    const m = parseInt(parts.find((p) => p.type === 'month')!.value, 10) - 1;
    const d = parseInt(parts.find((p) => p.type === 'day')!.value, 10);
    if (wd === 'Wed') {
      // Take 16:00 Jerusalem on that Wednesday as the day marker.
      const start = jerusalemDate(y, m, d, 16, 0);
      if (start.getTime() > Date.now()) {
        list.push(start);
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return list;
}

export async function GET(req: NextRequest) {
  const unauth = assertVoiceAuth(req);
  if (unauth) return unauth;

  const url = new URL(req.url);
  const weeksAhead = Math.min(
    parseInt(url.searchParams.get('weeks_ahead') || '4', 10),
    12,
  );
  const maxSlots = Math.min(parseInt(url.searchParams.get('max') || '3', 10), 6);

  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
    return NextResponse.json(
      { error: 'GOOGLE_CALENDAR_ID not configured' },
      { status: 500 },
    );
  }
  const calendar = getCalendarClient();

  // Candidate slot starts: for each of the next N Wednesdays, offer 16:00, 17:00, 18:00, 19:00.
  const wednesdays = nextWednesdays(weeksAhead);
  const candidates: Date[] = [];
  for (const wed of wednesdays) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(wed);
    const y = parseInt(parts.find((p) => p.type === 'year')!.value, 10);
    const m = parseInt(parts.find((p) => p.type === 'month')!.value, 10) - 1;
    const d = parseInt(parts.find((p) => p.type === 'day')!.value, 10);
    for (const hour of [16, 17, 18, 19]) {
      candidates.push(jerusalemDate(y, m, d, hour, 0));
    }
  }
  if (candidates.length === 0) {
    return NextResponse.json({ slots: [] });
  }

  const timeMin = candidates[0].toISOString();
  const timeMax = new Date(
    candidates[candidates.length - 1].getTime() + 60 * 60 * 1000,
  ).toISOString();

  const busy = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      items: [{ id: calendarId }],
      timeZone: 'Asia/Jerusalem',
    },
  });

  const busyRanges = (busy.data.calendars?.[calendarId]?.busy || []).map((b) => ({
    start: new Date(b.start!),
    end: new Date(b.end!),
  }));

  const free: Array<{
    iso: string;
    display_he: string;
    display_ar: string;
  }> = [];

  for (const start of candidates) {
    if (free.length >= maxSlots) break;
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const collides = busyRanges.some((b) => start < b.end && end > b.start);
    if (collides) continue;

    const jerusalemParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(start);
    const y = parseInt(jerusalemParts.find((p) => p.type === 'year')!.value, 10);
    const mo = parseInt(jerusalemParts.find((p) => p.type === 'month')!.value, 10);
    const d = parseInt(jerusalemParts.find((p) => p.type === 'day')!.value, 10);
    const h = parseInt(jerusalemParts.find((p) => p.type === 'hour')!.value, 10);
    const mi = parseInt(jerusalemParts.find((p) => p.type === 'minute')!.value, 10);
    const hh = String(h).padStart(2, '0');
    const mm = String(mi).padStart(2, '0');

    free.push({
      iso: start.toISOString(),
      display_he: `יום ${HE_DAY_WED} ${d} ב${HE_MONTHS[mo - 1]} ${y}, ${hh}:${mm}`,
      display_ar: `يوم ${AR_DAY_WED} ${d} ${AR_MONTHS[mo - 1]} ${y}، ${hh}:${mm}`,
    });
  }

  return NextResponse.json({ slots: free });
}
