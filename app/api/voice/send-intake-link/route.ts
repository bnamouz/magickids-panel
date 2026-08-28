import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertVoiceAuth, normalisePhone } from '@/lib/voice-auth';
import { sendWhatsAppText } from '@/lib/whatsapp-ultramsg';

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
  phone: z.string().min(6),
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

  const phone = normalisePhone(body.phone);
  if (!phone) {
    return NextResponse.json(
      { success: false, error: 'invalid_phone' },
      { status: 400 },
    );
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://app.magickidsinstitute.com';
  const link = `${baseUrl}/register?utm_source=voice&utm_medium=whatsapp&lang=${body.language}`;

  const greetingName = body.parent_name ? ` ${body.parent_name}` : '';
  const childRef = body.child_name;

  const heMsg = [
    `שלום${greetingName}, זו רנא ממכון Magic Kids.`,
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
    `مرحبًا${greetingName}, هاي رنا من معهد ماجيك كيدز.`,
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

  const waResult = await sendWhatsAppText({ toPhone: phone, body: message });
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
  });
}
