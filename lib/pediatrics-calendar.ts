import { google, calendar_v3 } from 'googleapis';

/**
 * Pediatrics Clinic Calendar integration
 *
 * Writes general (non-Maccabi) appointments to a dedicated calendar so that
 * clinic staff can see everything Nour books via voice.
 *
 * Environment variables required:
 * - GOOGLE_SERVICE_ACCOUNT_JSON: Service Account JSON key
 * - GOOGLE_IMPERSONATE_USER: Workspace user email to impersonate
 * - PEDIATRICS_CALENDAR_ID: The ID of the Pediatrics Clinic Appointments calendar
 */

const PEDIATRICS_CALENDAR_ID =
  'c_7d5c47bbaf7bb4e937f9e4ff4ed46b55dd68bd33e78af94753e222ce2a818b58@group.calendar.google.com';

function getCalendarClient(): calendar_v3.Calendar {
  const jsonStr = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!jsonStr) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured');

  let credentials;
  try {
    credentials = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
  }

  const impersonate = process.env.GOOGLE_IMPERSONATE_USER?.trim();
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
    subject: impersonate || undefined,
  });

  return google.calendar({ version: 'v3', auth });
}

function getPediatricsCalendarId(): string {
  return process.env.PEDIATRICS_CALENDAR_ID || PEDIATRICS_CALENDAR_ID;
}

export interface PediatricsAppointmentArgs {
  patientName: string;
  parentName?: string;
  parentPhone: string;
  scheduledAt: string; // ISO datetime, e.g. "2026-09-05T09:30:00+03:00"
  durationMinutes?: number;
  reason?: string; // תאור קצר של סיבת הביקור
  bookedVia?: string; // e.g. "Nour voice agent"
  notes?: string;
}

export async function createPediatricsAppointment(
  args: PediatricsAppointmentArgs,
): Promise<{ eventId: string; htmlLink: string; calendarId: string }> {
  const calendar = getCalendarClient();
  const calendarId = getPediatricsCalendarId();

  const duration = args.durationMinutes ?? 30;
  const start = new Date(args.scheduledAt);
  const end = new Date(start.getTime() + duration * 60 * 1000);

  const summary = `${args.patientName} - תור אצל ד"ר בסים`;

  const descLines = [
    `מטופל: ${args.patientName}`,
    args.parentName ? `הזמין: ${args.parentName}` : null,
    `טלפון: ${args.parentPhone}`,
    args.reason ? `סיבה: ${args.reason}` : null,
    args.bookedVia ? `נקבע דרך: ${args.bookedVia}` : null,
    args.notes ? `\nהערות: ${args.notes}` : null,
    '',
    '---',
    'مريض: ' + args.patientName,
    args.parentName ? 'حجز الموعد: ' + args.parentName : null,
    'رقم التلفون: ' + args.parentPhone,
  ].filter(Boolean).join('\n');

  const event: calendar_v3.Schema$Event = {
    summary,
    description: descLines,
    start: { dateTime: start.toISOString(), timeZone: 'Asia/Jerusalem' },
    end: { dateTime: end.toISOString(), timeZone: 'Asia/Jerusalem' },
    location: 'מרפאת ד"ר בסים נמור',
  };

  const created = await calendar.events.insert({
    calendarId,
    requestBody: event,
  });

  return {
    eventId: created.data.id!,
    htmlLink: created.data.htmlLink!,
    calendarId,
  };
}

/**
 * Check availability for a given time slot.
 * Returns list of conflicting events (empty = free).
 */
export async function checkPediatricsAvailability(
  scheduledAt: string,
  durationMinutes: number = 30,
): Promise<Array<{ summary: string; start: string; end: string }>> {
  const calendar = getCalendarClient();
  const calendarId = getPediatricsCalendarId();

  const start = new Date(scheduledAt);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const res = await calendar.events.list({
    calendarId,
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  return (res.data.items || []).map((e) => ({
    summary: e.summary || '(ללא כותרת)',
    start: e.start?.dateTime || e.start?.date || '',
    end: e.end?.dateTime || e.end?.date || '',
  }));
}
