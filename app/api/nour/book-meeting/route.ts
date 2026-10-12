import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertNourAuth, normalisePhone } from '@/lib/nour-auth';
import {
  createNourEvent,
  checkCrossCalendarAvailability,
} from '@/lib/google-calendar-nour';
import {
  CLINIC_SLOT_MINUTES,
  isSlotAligned,
} from '@/lib/clinic-hours';

/**
 * POST /api/nour/book-meeting
 *
 * Books a 10-minute pediatric-clinic appointment on Dr. Baseem's PERSONAL
 * Google Calendar via Service Account + Domain-Wide Delegation.
 *
 * Guard rails enforced server-side (so the voice agent cannot bypass them):
 *   1. Duration is always 10 minutes (CLINIC_SLOT_MINUTES).
 *   2. The [start, end) window must land exactly on a bookable clinic slot
 *      per lib/clinic-hours.ts (Sun off, Mon 10–15, Tue 17–20, Wed 10–13,
 *      Thu 17–20, Fri 09:30–12:30, Sat 09:30–12:30).
 *   3. Availability is verified in BOTH calendars — Dr. Baseem's personal
 *      calendar AND the clinic calendar — to avoid double-booking against
 *      Sarah's ADHD-assessment flow.
 *
 * Body: { start_iso, end_iso?, title, description?, caller_phone?,
 *         caller_name?, allow_override? }
 *  - allow_override=true skips the clinic-hours guard (for personal, non-
 *    clinic meetings that Dr. Baseem wants Nour to schedule anyway).
 */
export const runtime = 'nodejs';

const BodySchema = z.object({
  start_iso: z.string(),
  end_iso: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  caller_phone: z.string().optional(),
  caller_name: z.string().optional(),
  // Escape hatch for personal (non-clinic) meetings.
  allow_override: z.boolean().optional().default(false),
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

  const start = new Date(body.start_iso);
  if (Number.isNaN(start.getTime())) {
    return NextResponse.json(
      { success: false, error: 'invalid_start_iso' },
      { status: 400 }
    );
  }

  // Always force a 10-minute slot for clinic bookings, regardless of what
  // the caller passed in end_iso. If allow_override is set, respect the
  // caller-provided end_iso (or default to 30m) instead.
  let endIso: string;
  if (body.allow_override) {
    endIso = body.end_iso
      ? new Date(body.end_iso).toISOString()
      : new Date(start.getTime() + 30 * 60 * 1000).toISOString();
  } else {
    endIso = new Date(start.getTime() + CLINIC_SLOT_MINUTES * 60 * 1000).toISOString();
  }
  const startIso = start.toISOString();

  // 1. Enforce clinic-hours grid unless explicitly overridden.
  if (!body.allow_override) {
    const alignment = isSlotAligned(startIso, endIso);
    if (!alignment.ok) {
      return NextResponse.json(
        {
          success: false,
          error: 'slot_not_bookable',
          reason: alignment.reason,
          message:
            alignment.reason === 'outside_clinic_hours'
              ? 'הזמן שהוצע אינו בשעות פעילות מרפאת הילדים.'
              : 'התור חייב להיות באורך של 10 דקות.',
        },
        { status: 409 }
      );
    }
  }

  // 2. Cross-calendar availability check to avoid double-booking.
  try {
    const { available, conflicts } = await checkCrossCalendarAvailability(
      startIso,
      endIso
    );
    if (!available) {
      return NextResponse.json(
        {
          success: false,
          error: 'slot_taken',
          message: 'התור הזה כבר תפוס. אנא הצע/י זמן אחר.',
          conflicts: conflicts.map((c) => ({
            calendar: c.calendar,
            title: c.title,
            start: c.start,
            end: c.end,
          })),
        },
        { status: 409 }
      );
    }
  } catch (err: any) {
    // Availability check must not silently fail — surface the error.
    return NextResponse.json(
      {
        success: false,
        error: 'availability_check_failed',
        details: err?.message || String(err),
      },
      { status: 502 }
    );
  }

  const phone = body.caller_phone ? (normalisePhone(body.caller_phone) ?? undefined) : undefined;

  try {
    const durationMinutes = Math.round(
      (new Date(endIso).getTime() - start.getTime()) / 60000
    );
    const result = await createNourEvent({
      startIso,
      endIso,
      durationMinutes,
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
      duration_minutes: durationMinutes,
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: 'gcal_error',
      details: err?.message || String(err),
    });
  }
}
