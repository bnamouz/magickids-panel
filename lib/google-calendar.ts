import { google, calendar_v3 } from 'googleapis';

/**
 * Google Calendar integration using Service Account
 *
 * Environment variables required:
 * - GOOGLE_SERVICE_ACCOUNT_JSON: The full JSON key file content as a string
 * - GOOGLE_CALENDAR_ID: The ID of the calendar to write to (e.g. "primary" or full email)
 */

const APPOINTMENT_TYPE_HE: Record<string, string> = {
  assessment: 'אבחון ADHD',
  followup: 'מעקב',
  moxo: 'בדיקת Moxo',
};

const APPOINTMENT_DURATION: Record<string, number> = {
  assessment: 60,
  followup: 30,
  moxo: 30,
};

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

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  return google.calendar({ version: 'v3', auth });
}

function getCalendarId(): string {
  const id = process.env.GOOGLE_CALENDAR_ID;
  if (!id) throw new Error('GOOGLE_CALENDAR_ID not configured');
  return id;
}

export interface CreateEventArgs {
  appointmentType: 'assessment' | 'followup' | 'moxo';
  childName: string;
  parentName: string;
  parentPhone: string;
  parentEmail?: string;
  scheduledAt: string; // ISO
  durationMinutes?: number;
  location?: string;
  notes?: string;
}

export async function createCalendarEvent(args: CreateEventArgs): Promise<{
  eventId: string;
  htmlLink: string;
  calendarId: string;
}> {
  const calendar = getCalendarClient();
  const calendarId = getCalendarId();

  const typeLabel = APPOINTMENT_TYPE_HE[args.appointmentType] || args.appointmentType;
  const duration = args.durationMinutes ?? APPOINTMENT_DURATION[args.appointmentType] ?? 60;

  const start = new Date(args.scheduledAt);
  const end = new Date(start.getTime() + duration * 60 * 1000);

  const description = [
    `סוג פגישה: ${typeLabel}`,
    `ילד: ${args.childName}`,
    `הורה: ${args.parentName}`,
    `טלפון הורה: ${args.parentPhone}`,
    args.parentEmail ? `מייל הורה: ${args.parentEmail}` : null,
    args.notes ? `\nהערות:\n${args.notes}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const attendees: calendar_v3.Schema$EventAttendee[] = [];
  if (args.parentEmail) {
    attendees.push({ email: args.parentEmail, displayName: args.parentName });
  }

  const res = await calendar.events.insert({
    calendarId,
    sendUpdates: attendees.length > 0 ? 'all' : 'none',
    requestBody: {
      summary: `${typeLabel} — ${args.childName}`,
      description,
      location: args.location,
      start: { dateTime: start.toISOString(), timeZone: 'Asia/Jerusalem' },
      end: { dateTime: end.toISOString(), timeZone: 'Asia/Jerusalem' },
      attendees,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 24 * 60 },
          { method: 'popup', minutes: 60 },
          ...(attendees.length > 0
            ? [{ method: 'email' as const, minutes: 24 * 60 }]
            : []),
        ],
      },
    },
  });

  return {
    eventId: res.data.id!,
    htmlLink: res.data.htmlLink!,
    calendarId,
  };
}

export async function updateCalendarEvent(
  eventId: string,
  updates: Partial<CreateEventArgs>
): Promise<void> {
  const calendar = getCalendarClient();
  const calendarId = getCalendarId();

  const patch: calendar_v3.Schema$Event = {};

  if (updates.scheduledAt) {
    const duration = updates.durationMinutes ?? 60;
    const start = new Date(updates.scheduledAt);
    const end = new Date(start.getTime() + duration * 60 * 1000);
    patch.start = { dateTime: start.toISOString(), timeZone: 'Asia/Jerusalem' };
    patch.end = { dateTime: end.toISOString(), timeZone: 'Asia/Jerusalem' };
  }

  if (updates.notes !== undefined || updates.childName || updates.parentName) {
    // Rebuild description if any content changed - fetch first
    const existing = await calendar.events.get({ calendarId, eventId });
    patch.description = existing.data.description;
  }

  if (updates.location !== undefined) patch.location = updates.location;

  await calendar.events.patch({
    calendarId,
    eventId,
    sendUpdates: 'all',
    requestBody: patch,
  });
}

export async function cancelCalendarEvent(eventId: string): Promise<void> {
  const calendar = getCalendarClient();
  const calendarId = getCalendarId();

  await calendar.events.delete({
    calendarId,
    eventId,
    sendUpdates: 'all',
  });
}

export async function checkAvailability(
  scheduledAt: string,
  durationMinutes: number
): Promise<{ available: boolean; conflicts: calendar_v3.Schema$Event[] }> {
  const calendar = getCalendarClient();
  const calendarId = getCalendarId();

  const start = new Date(scheduledAt);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const res = await calendar.events.list({
    calendarId,
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 10,
  });

  const conflicts = (res.data.items || []).filter(
    (e) => e.status !== 'cancelled'
  );

  return { available: conflicts.length === 0, conflicts };
}

export async function testConnection(): Promise<{
  ok: boolean;
  calendarSummary?: string;
  error?: string;
}> {
  try {
    const calendar = getCalendarClient();
    const calendarId = getCalendarId();
    const res = await calendar.calendars.get({ calendarId });
    return { ok: true, calendarSummary: res.data.summary || undefined };
  } catch (e: any) {
    return { ok: false, error: e.message || String(e) };
  }
}
