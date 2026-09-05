import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertVoiceAuth, normalisePhone } from '@/lib/voice-auth';
import { createPediatricsAppointment, checkPediatricsAvailability } from '@/lib/pediatrics-calendar';
import { sendWhatsAppText } from '@/lib/whatsapp-ultramsg';

/**
 * POST /api/voice/book-appointment
 *
 * Books a general (non-Maccabi) appointment for Dr. Basim's clinic
 * on the "Pediatrics Clinic Appointments" calendar.
 *
 * Called by Nour (personal secretary voice agent) when a caller
 * requests to book with Dr. Basim.
 *
 * Body:
 *   {
 *     patient_name: string,           // full name of the patient
 *     parent_name?: string,           // caller's name if different from patient
 *     parent_phone: string,           // callback phone number
 *     scheduled_at: string,           // ISO datetime, e.g. "2026-09-05T09:30:00+03:00"
 *     duration_minutes?: number,      // default 30
 *     reason?: string,                // brief reason
 *     language?: 'ar' | 'he' | 'en',  // for WhatsApp confirmation
 *     send_confirmation?: boolean,    // default true
 *   }
 */

const BodySchema = z.object({
  patient_name: z.string().min(1),
  parent_name: z.string().optional(),
  parent_phone: z.string().min(1),
  scheduled_at: z.string().min(1),
  duration_minutes: z.number().int().positive().max(240).optional(),
  reason: z.string().optional(),
  language: z.enum(['ar', 'he', 'en']).optional(),
  send_confirmation: z.boolean().optional(),
});

function formatDateForMessage(iso: string, lang: 'ar' | 'he' | 'en'): string {
  const d = new Date(iso);
  const locale = lang === 'ar' ? 'ar-IL' : lang === 'he' ? 'he-IL' : 'en-IL';
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Jerusalem',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export async function POST(req: NextRequest) {
  const unauth = assertVoiceAuth(req);
  if (unauth) return unauth;

  let body: z.infer<typeof BodySchema>;
  try {
    const raw = await req.json();
    body = BodySchema.parse(raw);
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: 'invalid_body', details: e?.message || String(e) },
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

  // Validate scheduled_at
  const when = new Date(body.scheduled_at);
  if (isNaN(when.getTime())) {
    return NextResponse.json(
      { success: false, error: 'invalid_scheduled_at' },
      { status: 400 },
    );
  }

  const duration = body.duration_minutes ?? 30;

  // Check availability
  try {
    const conflicts = await checkPediatricsAvailability(body.scheduled_at, duration);
    if (conflicts.length > 0) {
      return NextResponse.json({
        success: false,
        error: 'slot_taken',
        conflicts: conflicts.map((c) => ({
          summary: c.summary,
          start: c.start,
        })),
      }, { status: 409 });
    }
  } catch (e: any) {
    console.error('[book-appointment] availability check failed:', e);
    // Continue anyway — better to double-book than to fail booking
  }

  // Create calendar event
  let eventInfo;
  try {
    eventInfo = await createPediatricsAppointment({
      patientName: body.patient_name,
      parentName: body.parent_name,
      parentPhone: phone,
      scheduledAt: body.scheduled_at,
      durationMinutes: duration,
      reason: body.reason,
      bookedVia: 'Nour voice agent',
    });
  } catch (e: any) {
    console.error('[book-appointment] calendar create failed:', e);
    return NextResponse.json(
      { success: false, error: 'calendar_error', details: e?.message || String(e) },
      { status: 500 },
    );
  }

  // Send WhatsApp confirmation (default: yes)
  const shouldConfirm = body.send_confirmation !== false;
  let whatsappId: string | undefined;
  if (shouldConfirm) {
    const lang = body.language || 'ar';
    const when_str = formatDateForMessage(body.scheduled_at, lang);

    const patient = body.patient_name;
    const msgAr = `أهلاً، هذا تأكيد لموعد ${patient} عند الدكتور باسم نمّور:\n\n📅 ${when_str}\n📍 عيادة د. باسم نمّور\n\nلأي تعديل أو استفسار، تواصلوا معنا. يعطيكم العافية 🙏`;
    const msgHe = `שלום, זהו אישור לתור של ${patient} אצל ד"ר בסים נמור:\n\n📅 ${when_str}\n📍 מרפאת ד"ר בסים\n\nלכל שינוי או שאלה, ניתן ליצור קשר. תודה 🙏`;
    const msgEn = `Hello, this confirms the appointment for ${patient} with Dr. Basim Namour:\n\n📅 ${when_str}\n📍 Dr. Basim's Clinic\n\nFor any changes or questions, please contact us. Thank you 🙏`;

    const msg = lang === 'he' ? msgHe : lang === 'en' ? msgEn : msgAr;

    try {
      const result = await sendWhatsAppText({ toPhone: phone, body: msg });
      whatsappId = result.id;
    } catch (e: any) {
      console.error('[book-appointment] WhatsApp send failed:', e);
      // Don't fail the booking if WhatsApp fails
    }
  }

  return NextResponse.json({
    success: true,
    event_id: eventInfo.eventId,
    calendar_link: eventInfo.htmlLink,
    whatsapp_message_id: whatsappId,
  });
}
