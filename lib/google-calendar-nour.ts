import { google, calendar_v3 } from 'googleapis';

/**
 * Google Calendar integration for Nour (personal secretary).
 *
 * Uses the SAME Service Account as the clinic (Sarah), but impersonates
 * a DIFFERENT user (Dr. Baseem's personal Workspace account) so Nour writes
 * to his personal calendar rather than the clinic's shared MAGICKIDS calendar.
 *
 * Environment variables required:
 * - GOOGLE_SERVICE_ACCOUNT_JSON: reused from Sarah's setup
 * - NOUR_GOOGLE_IMPERSONATE_USER: Workspace user email to impersonate (e.g. bnamouz@magickidsinstitute.com)
 * - NOUR_GOOGLE_CALENDAR_ID: (optional) The calendar ID to write to. Defaults to "primary" of impersonated user.
 */

function getCalendarClient(): calendar_v3.Calendar {
  const jsonStr = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!jsonStr) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured');
  }

  let credentials;
  try {
    credentials = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
  }

  const impersonate = process.env.NOUR_GOOGLE_IMPERSONATE_USER?.trim();
  if (!impersonate) {
    throw new Error('NOUR_GOOGLE_IMPERSONATE_USER not configured');
  }

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
    subject: impersonate,
  });

  return google.calendar({ version: 'v3', auth });
}

function getCalendarId(): string {
  return (process.env.NOUR_GOOGLE_CALENDAR_ID?.trim() || 'primary');
}

export interface NourEventInput {
  startIso: string;
  endIso?: string;
  durationMinutes?: number;
  title: string;
  description?: string;
  callerPhone?: string;
  callerName?: string;
}

export async function createNourEvent(input: NourEventInput): Promise<{
  eventId: string;
  htmlLink: string;
  start: string;
  end: string;
}> {
  const calendar = getCalendarClient();
  const calendarId = getCalendarId();

  const start = new Date(input.startIso);
  const duration = input.durationMinutes ?? 30;
  const end = input.endIso
    ? new Date(input.endIso)
    : new Date(start.getTime() + duration * 60 * 1000);

  const descriptionParts = [
    input.description,
    input.callerName ? `📞 מתקשר: ${input.callerName}` : undefined,
    input.callerPhone ? `☎️ טלפון: ${input.callerPhone}` : undefined,
    '',
    '📝 נוצר על ידי נור (מזכירה AI)',
  ].filter(Boolean);

  const res = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: input.title,
      description: descriptionParts.join('\n'),
      start: { dateTime: start.toISOString(), timeZone: 'Asia/Jerusalem' },
      end: { dateTime: end.toISOString(), timeZone: 'Asia/Jerusalem' },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 60 },
          { method: 'popup', minutes: 10 },
        ],
      },
    },
  });

  return {
    eventId: res.data.id!,
    htmlLink: res.data.htmlLink!,
    start: res.data.start?.dateTime || start.toISOString(),
    end: res.data.end?.dateTime || end.toISOString(),
  };
}

export interface NourEventSummary {
  id: string;
  title: string;
  start: string;
  end: string;
  location?: string;
}

export async function listNourEvents(
  timeMin: string,
  timeMax: string
): Promise<NourEventSummary[]> {
  const calendar = getCalendarClient();
  const calendarId = getCalendarId();

  const res = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 30,
  });

  return (res.data.items || [])
    .filter((e) => e.status !== 'cancelled')
    .map((e) => ({
      id: e.id!,
      title: e.summary || '(ללא כותרת)',
      start: e.start?.dateTime || e.start?.date || '',
      end: e.end?.dateTime || e.end?.date || '',
      location: e.location || undefined,
    }));
}
