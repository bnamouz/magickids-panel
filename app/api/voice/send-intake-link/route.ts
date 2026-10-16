import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertVoiceAuth, normalisePhone } from '@/lib/voice-auth';
import { sendInstituteWhatsAppText } from '@/lib/whatsapp-ultramsg';

/**
 * POST /api/voice/send-intake-link
 *
 * Sends the family a WhatsApp with the public registration link so they can
 * fill the parent + teacher Vanderbilt questionnaires. Called by the agent
 * when either the family has no intake session yet, or the questionnaires
 * are still incomplete.
 */
export const runtime = 'nodejs';

const BodySchema = z.object({
  // Number the caller dictated. Optional: when missing or malformed we fall
  // back to the caller ID that ElevenLabs passes in `caller_id`.
  phone: z.string().optional(),
  caller_id: z.string().optional(),
  parent_name: z.string().optional(),
  child_name: z.string().optional(),
  language: z.enum(['he', 'ar']).default('he'),
  reason: z.enum(['new_family', 'incomplete_intake', 'maccabi_gate']).optional(),
});

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

  // Voice transcription and the model's own E.164 conversion sometimes add or
  // drop a digit (e.g. 0548800600 -> +9725448800600). Prefer the dictated
  // number when it is valid; otherwise use the verified caller ID, so the
  // family still gets the link. Never guess beyond these two sources.
  const dictated = normalisePhone(body.phone);
  const callerId = normalisePhone(body.caller_id);
  const phone = dictated || callerId;
  const usedCallerId = !dictated && !!callerId;
  if (!phone) {
    return NextResponse.json(
      {
        success: false,
        error: 'invalid_phone',
        instruction:
          'The number is not a valid Israeli mobile number (05X followed by 7 digits). Read the number back digit by digit and ask the caller to repeat it. If it still fails, use escalate_to_human.',
      },
      { status: 400 },
    );
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://app.magickidsinstitute.com';
  const link = `${baseUrl}/onboarding/public?utm_source=voice&utm_medium=whatsapp&lang=${body.language}`;

  const greetingName = body.parent_name ? ` ${body.parent_name}` : '';
  const childRef = body.child_name;

  const heMsg = [
    `שלום${greetingName}, זו שרה ממכון Magic Kids.`,
    childRef
      ? `בהמשך לשיחה שלנו לגבי ${childRef}, שולחת לך את הקישור להרשמה ולשאלונים:`
      : `בהמשך לשיחה שלנו, שולחת לך את הקישור להרשמה ולשאלונים:`,
    link,
    ``,
    `שאלון ההורה לוקח 10-15 דקות.`,
    `אחרי שסיימת – תקבל/י קישור נפרד למורה של הילד/ה.`,
    `לאחר ששני השאלונים מולאו – מוזמנים להתקשר ונקבע תור לאבחון.`,
  ].join('\n');

  const arMsg = [
    `مرحبًا${greetingName}, هاي سارة من معهد ماجيك كيدز.`,
    childRef
      ? `بعد الحكي عن ${childRef}، هاد الرابط للتسجيل والاستمارات:`
      : `متابعة لحكينا، هاد الرابط للتسجيل والاستمارات:`,
    link,
    ``,
    `استمارة الأهل بتاخد 10-15 دقيقة.`,
    `بعد ما تخلصو، بتوصلكم استمارة تانية لمعلم/ة الولد.`,
    `لما تخلصوا التنتين — رنّونا ومنحدد موعد للفحص.`,
  ].join('\n');

  const message = body.language === 'ar' ? arMsg : heMsg;

  // Sent from the institute WhatsApp (0544020043), not the shared Nour/Marhaba instance.
  const waResult = await sendInstituteWhatsAppText({ toPhone: phone, body: message });
  if (!waResult.ok) {
    return NextResponse.json(
      {
        success: false,
        error: 'whatsapp_send_failed',
        details: waResult.error,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    link,
    whatsapp_message_id: waResult.id,
    sent_to: phone,
    used_caller_id: usedCallerId,
    // Local format so the agent can read it back to the caller.
    sent_to_local: '0' + phone.slice(4),
  });
}
