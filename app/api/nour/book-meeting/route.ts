import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertNourAuth, normalisePhone } from '@/lib/nour-auth';

/**
 * POST /api/nour/book-meeting
 *
 * Books a meeting on the user's Google Calendar based on Nour's conversation.
 * Body: { start_iso, end_iso, title, description, caller_phone, caller_name }
 */
export const runtime = 'nodejs';

const BodySchema = z.object({
  start_iso: z.string(),
  end_iso: z.string().optional(),
  duration_minutes: z.number().int().min(15).max(240).optional().default(30),
  title: z.string().min(1),
  description: z.string().optional(),
  caller_phone: z.string().optional(),
  caller_name: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const unauth = assertNourAuth(req);
  if (unauth) return unauth;

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e: any) {
    return NextResponse.json({ success: false, error: 'invalid_body', details: e?.errors }, { status: 400 });
  }

  const pipedreamToken = process.env.PIPEDREAM_GOOGLE_CAL_TOKEN;
  if (!pipedreamToken) {
    return NextResponse.json({
      success: false,
      error: 'calendar_not_configured',
      message: 'Google Calendar is not connected. Please contact Dr. Baseem directly.',
    });
  }

  const startDate = new Date(body.start_iso);
  const endIso =
    body.end_iso ||
    new Date(startDate.getTime() + (body.duration_minutes || 30) * 60000).toISOString();

  const phone = body.caller_phone ? normalisePhone(body.caller_phone) : undefined;
  const description = [
    body.description,
    body.caller_name ? `📞 מתקשר: ${body.caller_name}` : undefined,
    phone ? `☎️ טלפון: ${phone}` : undefined,
    '',
    '📝 נוצר על ידי נור (מזכירה AI)',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${pipedreamToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: body.title,
          description,
          start: { dateTime: body.start_iso, timeZone: 'Asia/Jerusalem' },
          end: { dateTime: endIso, timeZone: 'Asia/Jerusalem' },
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json({
        success: false,
        error: 'gcal_create_failed',
        status: response.status,
        details: text.slice(0, 200),
      });
    }

    const event = await response.json();
    return NextResponse.json({
      success: true,
      event_id: event.id,
      event_link: event.htmlLink,
      start: event.start?.dateTime,
      end: event.end?.dateTime,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'gcal_error', details: err.message });
  }
}
