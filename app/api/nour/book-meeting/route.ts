import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertNourAuth, normalisePhone } from '@/lib/nour-auth';
import { createNourEvent } from '@/lib/google-calendar-nour';

/**
 * POST /api/nour/book-meeting
 *
 * Books a meeting on Dr. Baseem's personal Google Calendar
 * (bnamouz@magickidsinstitute.com) via Service Account with DWD.
 *
 * Body: { start_iso, end_iso?, duration_minutes?, title, description?,
 *         caller_phone?, caller_name? }
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
    return NextResponse.json(
      { success: false, error: 'invalid_body', details: e?.errors },
      { status: 400 }
    );
  }

  const phone = body.caller_phone ? (normalisePhone(body.caller_phone) ?? undefined) : undefined;

  try {
    const result = await createNourEvent({
      startIso: body.start_iso,
      endIso: body.end_iso,
      durationMinutes: body.duration_minutes,
      title: body.title,
      description: body.description,
      callerPhone: phone,
      callerName: body.caller_name,
    });

    return NextResponse.json({
      success: true,
      event_id: result.eventId,
      event_link: result.htmlLink,
      start: result.start,
      end: result.end,
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: 'gcal_error',
      details: err?.message || String(err),
    });
  }
}
