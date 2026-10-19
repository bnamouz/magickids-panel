import { getSupabaseAdmin } from '@/lib/supabase';
import { notifyOnce } from '@/lib/moxo/notification';
import { clinicWhatsAppIdentity } from '@/lib/whatsapp-clinic';
import { cancellationToken } from './server';
import { TIME_ZONE, type Clinic, type VisitType } from './schedule';

export type Lang = 'he' | 'ar' | 'en';
const BASE = 'https://app.magickidsinstitute.com';

export function cancelLink(clinic: Clinic, reference: string, lang: Lang) {
  return `${BASE}/book/cancel?lang=${lang}#id=${reference}&token=${cancellationToken(reference, clinic)}${clinic === 'adhd' ? '&clinic=adhd' : ''}`;
}
function when(iso: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-IL-u-nu-latn' : lang === 'he' ? 'he-IL' : 'en-GB', { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

/** Confirmation sent right after a parent books on the website: time, place, and the personal cancellation link that frees the slot for others. */
export function bookingConfirmationMessage(o: { clinic: Clinic; visitType: VisitType; start: string; durationMinutes: number; childName: string; parentName: string; reference: string; lang: Lang }) {
  const lang = o.lang, first = o.parentName.trim().split(/\s+/)[0] || '';
  const link = cancelLink(o.clinic, o.reference, lang);
  const time = when(o.start, lang);
  const peds = o.clinic === 'pediatrics';
  const place = peds ? { he: 'מרפאת הילדים של ד״ר בסים נמוז, תופיק זיאד 21, שפרעם', ar: 'عيادة الأطفال عند د. بسيم نموز، توفيق زياد 21، شفاعمرو', en: "Dr. Baseem Namouz's pediatric clinic, 21 Tawfiq Ziad St., Shefa-Amr" }
    : { he: 'מכון Magic Kids, תופיק זיאד 21, שפרעם', ar: 'معهد Magic Kids، توفيق زياد 21، شفاعمرو', en: 'Magic Kids institute, 21 Tawfiq Ziad St., Shefa-Amr' };
  const kind = peds ? { he: 'ביקור במרפאת הילדים', ar: 'زيارة في عيادة الأطفال', en: 'pediatric visit' }
    : o.visitType === 'followup' ? { he: 'ביקור מעקב קשב וריכוז', ar: 'زيارة متابعة للانتباه والتركيز', en: 'ADHD follow-up visit' } : { he: 'אבחון קשב וריכוז', ar: 'تشخيص الانتباه والتركيز', en: 'ADHD assessment' };
  const rebook = peds ? '' : { he: '\nאחרי ביטול אפשר לקבוע מועד חדש דרך הקישור האישי שקיבלתם.', ar: '\nبعد الإلغاء بتقدروا تحجزوا موعد جديد من الرابط الشخصي اللي وصلكم.', en: '\nAfter cancelling you can pick a new time with the personal link you received.' }[lang];
  if (lang === 'ar') return `مرحبًا${first ? ` ${first}` : ''}، تم تثبيت موعد ${o.childName} لـ${kind.ar}.\nالموعد: ${time} (${o.durationMinutes} دقيقة، توقيت إسرائيل)\nالمكان: ${place.ar}\n\nإذا ما بتقدروا تيجوا، الرجاء إلغاء الموعد من هون حتى تستفيد منه عيلة ثانية:\n${link}${rebook}\n\nهاد الرابط شخصي، لا تشاركوه مع غيركم.\nشكرًا، ${peds ? 'طاقم العيادة' : 'طاقم Magic Kids'}.`;
  if (lang === 'en') return `Hello${first ? ` ${first}` : ''}, ${o.childName}'s ${kind.en} is confirmed.\nWhen: ${time} (${o.durationMinutes} min, Israel time)\nWhere: ${place.en}\n\nIf you cannot come, please cancel here so another family can use the slot:\n${link}${rebook}\n\nThis link is personal; do not share it.\nThank you, ${peds ? 'the clinic team' : 'the Magic Kids team'}.`;
  return `שלום${first ? ` ${first}` : ''}, התור של ${o.childName} ל${kind.he} נקבע.\nמועד: ${time} (${o.durationMinutes} דקות, שעון ישראל)\nמקום: ${place.he}\n\nאם לא תוכלו להגיע, בטלו בבקשה כאן כדי שמשפחה אחרת תוכל להשתמש בתור:\n${link}${rebook}\n\nהקישור אישי, אין להעביר אותו לאחרים.\nתודה, ${peds ? 'צוות המרפאה' : 'צוות Magic Kids'}.`;
}

/** Sends the confirmation once per booking (clinic_notifications key) and logs it in `notifications`.
 *  Pediatrics: Dr. Namouz's number 050-995-5137 when its connection is verified, otherwise the institute number. ADHD: institute number. */
export async function sendBookingConfirmation(o: { clinic: Clinic; visitType: VisitType; start: string; durationMinutes: number; childName: string; parentName: string; phone: string; reference: string; lang: Lang }) {
  let sender: 'clinic' | 'institute' = 'institute';
  if (o.clinic === 'pediatrics' && (await clinicWhatsAppIdentity().catch(() => 'identity_unavailable')) === 'verified') sender = 'clinic';
  const digits = o.phone.replace(/\D/g, '');
  const phone = o.phone.startsWith('+') ? `+${digits}` : digits.startsWith('0') ? `+972${digits.slice(1)}` : `+${digits}`;
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) return { state: 'invalid_phone', sender };
  const message = bookingConfirmationMessage(o);
  let state = 'unknown';
  try { state = await notifyOnce(`website-booking:${o.reference}`, phone, message, { sender }); } catch { state = 'unknown'; }
  const now = new Date().toISOString();
  const fresh = state === 'accepted' || state === 'failed' || state === 'not_configured';
  if (fresh) await getSupabaseAdmin().from('notifications').insert({
    recipient_type: 'parent', recipient_phone: phone, channel: 'whatsapp', template: 'booking_confirmation',
    payload: { clinic: o.clinic, visit_type: o.visitType, booking_id: o.reference, start: o.start, language: o.lang, sender },
    scheduled_for: now, sent_at: state === 'accepted' ? now : null, status: state === 'accepted' ? 'sent' : 'failed', error_message: state === 'accepted' ? null : state, retry_count: 0,
  }).then(() => null, () => null);
  return { state, sender };
}
