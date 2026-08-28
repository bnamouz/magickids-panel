import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';
import { createCalendarEvent, checkAvailability } from '@/lib/google-calendar';
import { assertVoiceAuth, normalisePhone } from '@/lib/voice-auth';
import { sendWhatsAppText } from '@/lib/whatsapp-ultramsg';

/**
 * POST /api/voice/book-maccabi
 *
 * Books a 60-minute Maccabi ADHD assessment on the requested Wednesday slot,
 * but only when:
 *   1. The requested time is a Wednesday 16:00-20:00 Asia/Jerusalem
 *   2. The intake questionnaires are marked completed for the case
 *   3. The slot is still free in the Google Calendar
 *
 * On success it creates the Google Calendar event, upserts the row in the
 * appointments table, and sends a WhatsApp confirmation to the parent.
 */
export const runtime = 'nodejs';

const BodySchema = z.object({
  case_id: z.string().uuid(),
  parent_name: z.string().min(2),
  parent_phone: z.string().min(6),
  parent_email: z.string().email().optional(),
  child_name: z.string().min(1),
  child_age: z.number().int().min(2).max(80).optional(),
  slot_iso: z.string(),
  language: z.enum(['he', 'ar']).default('he'),
  notes: z.string().optional(),
});

function isWednesdayEveningJerusalem(iso: string): boolean {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const wd = parts.find((p) => p.type === 'weekday')?.value;
  const hour = parseInt(parts.find((p) => p.type === 'hour')!.value, 10);
  return wd === 'Wed' && hour >= 16 && hour < 20;
}

export async function POST(req: NextRequest) {
  const unauth = assertVoiceAuth(req);
  if (unauth) return unauth;

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: 'invalid_body', details: e?.errors || String(e) },
      { status: 400 },
    );
  }

  const phone = normalisePhone(body.parent_phone);
  if (!phone) {
    return NextResponse.json(
      { success: false, error: 'invalid_phone' },
      { status: 400 },
    );
  }

  // Gate 1: Wednesday 16-20 only
  if (!isWednesdayEveningJerusalem(body.slot_iso)) {
    return NextResponse.json(
      {
        success: false,
        error: 'slot_outside_maccabi_window',
        message:
          'Maccabi ADHD assessments are only booked on Wednesdays 16:00-20:00 (Asia/Jerusalem).',
      },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();

  // Gate 2: intake must be complete
  const { data: session, error: sessionErr } = await supabase
    .from('intake_sessions')
    .select('id, patient_id, parent_completed_at, teacher_completed_at')
    .eq('id', body.case_id)
    .maybeSingle();
  if (sessionErr || !session) {
    return NextResponse.json(
      { success: false, error: 'case_not_found' },
      { status: 404 },
    );
  }
  if (!session.parent_completed_at || !session.teacher_completed_at) {
    return NextResponse.json(
      {
        success: false,
        error: 'intake_incomplete',
        parent_completed: !!session.parent_completed_at,
        teacher_completed: !!session.teacher_completed_at,
        message:
          'Both parent and teacher questionnaires must be completed before booking.',
      },
      { status: 409 },
    );
  }

  // Gate 3: slot still free
  const availability = await checkAvailability(body.slot_iso, 60);
  if (!availability.available) {
    return NextResponse.json(
      { success: false, error: 'slot_taken' },
      { status: 409 },
    );
  }

  // Create the Google Calendar event using the shared helper.
  let calendarEvent;
  try {
    calendarEvent = await createCalendarEvent({
      appointmentType: 'assessment',
      childName: body.child_name,
      parentName: body.parent_name,
      parentPhone: phone,
      parentEmail: body.parent_email,
      scheduledAt: body.slot_iso,
      durationMinutes: 60,
      location: 'רחוב תופיק זיאד 21, שפרעם',
      notes: [
        'קופת חולים: מכבי',
        body.child_age ? `גיל ילד/ה: ${body.child_age}` : null,
        'נקבע דרך המזכירה הקולית (רנא).',
        body.notes ? `\nהערות מהשיחה:\n${body.notes}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: 'calendar_create_failed', details: e?.message },
      { status: 500 },
    );
  }

  // Persist in appointments table. Schema is best-effort; the important part
  // is that the row exists and can be joined back to the case.
  const { data: appt, error: apptErr } = await supabase
    .from('appointments')
    .insert({
      patient_id: session.patient_id,
      intake_session_id: session.id,
      appointment_type: 'assessment',
      scheduled_at: body.slot_iso,
      duration_minutes: 60,
      status: 'scheduled',
      google_event_id: calendarEvent.eventId,
      google_calendar_id: calendarEvent.calendarId,
      google_html_link: calendarEvent.htmlLink,
      notes: 'נקבע דרך המזכירה הקולית (רנא) עבור מטופל מכבי.',
    })
    .select('id')
    .maybeSingle();
  // If the appointments schema differs, we still consider the booking a success
  // because the calendar event was created - the row can be reconciled later.
  const appointmentId = appt?.id || null;

  // Confirmation WhatsApp to the parent
  const displayDate = new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(body.slot_iso));
  const whatsappMessageHe = [
    `שלום ${body.parent_name},`,
    `זו רנא ממכון Magic Kids.`,
    `אישרתי את התור לאבחון ADHD עבור ${body.child_name}:`,
    `📅 ${displayDate}`,
    `📍 רחוב תופיק זיאד 21, שפרעם`,
    `אם צריך לבטל או לשנות – בבקשה עד 24 שעות מראש.`,
  ].join('\n');
  const whatsappMessageAr = [
    `مرحبًا ${body.parent_name},`,
    `هاي رنا من معهد ماجيك كيدز.`,
    `تم تأكيد موعد فحص ADHD لـ ${body.child_name}:`,
    `📅 ${displayDate}`,
    `📍 شارع توفيق زياد 21، شفاعمرو`,
    `إذا بدك تغيّر أو تلغي، لطفًا قبل 24 ساعة.`,
  ].join('\n');
  const message = body.language === 'ar' ? whatsappMessageAr : whatsappMessageHe;

  const waResult = await sendWhatsAppText({ toPhone: phone, body: message });

  return NextResponse.json({
    success: true,
    appointment_id: appointmentId,
    google_event_id: calendarEvent.eventId,
    google_html_link: calendarEvent.htmlLink,
    whatsapp_confirmation_sent: waResult.ok,
    whatsapp_error: waResult.ok ? undefined : waResult.error,
    appt_persisted: !apptErr,
    appt_persist_error: apptErr?.message,
  });
}
