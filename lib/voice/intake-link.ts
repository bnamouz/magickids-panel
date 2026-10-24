import { getSupabaseAdmin } from '@/lib/supabase';
import { sendInstituteWhatsAppText } from '@/lib/whatsapp-ultramsg';
import { instituteWebsiteLines } from '@/lib/voice/links';

export const INTAKE_LINK_TEMPLATE = 'voice_intake_link';
export type IntakeLinkInput = { phone: string; language: 'he' | 'ar'; parentName?: string | null; childName?: string | null; reason?: string | null; source: 'voice' | 'retry'; retryOf?: string | null; callId?: string | null };

export function intakeLink(language: 'he' | 'ar') {
  const baseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://app.magickidsinstitute.com';
  return `${baseUrl}/onboarding/public?utm_source=voice&utm_medium=whatsapp&lang=${language}`;
}
export function intakeMessage(i: Pick<IntakeLinkInput, 'language' | 'parentName' | 'childName'>) {
  const link = intakeLink(i.language);
  const greetingName = i.parentName ? ` ${i.parentName}` : '';
  const he = [`שלום${greetingName}, זו שרה ממכון Magic Kids.`, i.childName ? `בהמשך לשיחה שלנו לגבי ${i.childName}, שולחת לך את הקישור להרשמה ולשאלונים:` : `בהמשך לשיחה שלנו, שולחת לך את הקישור להרשמה ולשאלונים:`, link, ``, `שאלון ההורה לוקח 10-15 דקות.`, `אחרי שסיימת – תקבל/י קישור נפרד למורה של הילד/ה.`, `לאחר ששני השאלונים מולאו – מוזמנים להתקשר ונקבע תור לאבחון.`, ``, ...instituteWebsiteLines('he')].join('\n').trimEnd();
  const ar = [`مرحبًا${greetingName}, هاي سارة من معهد ماجيك كيدز.`, i.childName ? `بعد الحكي عن ${i.childName}، هاد الرابط للتسجيل والاستمارات:` : `متابعة لحكينا، هاد الرابط للتسجيل والاستمارات:`, link, ``, `استمارة الأهل بتاخد 10-15 دقيقة.`, `بعد ما تخلصو، بتوصلكم استمارة تانية لمعلم/ة الولد.`, `لما تخلصوا التنتين — رنّونا ومنحدد موعد للفحص.`, ``, ...instituteWebsiteLines('ar')].join('\n').trimEnd();
  return { link, message: i.language === 'ar' ? ar : he };
}

/** Sends the registration link from the institute WhatsApp and records the attempt (sent/failed) in `notifications`, so the nightly check can resend what failed. */
export async function sendIntakeLink(i: IntakeLinkInput): Promise<{ ok: true; id: string; link: string } | { ok: false; error: string; link: string }> {
  const { link, message } = intakeMessage(i);
  const db = getSupabaseAdmin();
  const payload = { language: i.language, parent_name: i.parentName ?? null, child_name: i.childName ?? null, reason: i.reason ?? null, source: i.source, retry_of: i.retryOf ?? null, call_id: i.callId ?? null, link };
  const wa = await sendInstituteWhatsAppText({ toPhone: i.phone, body: message });
  const row = { recipient_type: 'parent', recipient_phone: i.phone, channel: 'whatsapp', template: INTAKE_LINK_TEMPLATE, payload, scheduled_for: new Date().toISOString(),
    sent_at: wa.ok ? new Date().toISOString() : null, status: wa.ok ? 'sent' : 'failed', delivery_id: wa.ok ? wa.id ?? null : null, error_message: wa.ok ? null : wa.error ?? 'unknown', retry_count: i.source === 'retry' ? 1 : 0 };
  await db.from('notifications').insert(row).then(() => null, () => null); // logging must never block the agent
  return wa.ok ? { ok: true, id: wa.id ?? '', link } : { ok: false, error: wa.error ?? 'unknown', link };
}
