import { mapLineFor } from '@/lib/addresses';
export type ConfirmationLanguage = 'he' | 'ar';
export type ConfirmationResult = { email: string; whatsapp: string };
export const confirmationLabels: Record<string, string> = {
  accepted: 'הספק קיבל את בקשת השליחה; קבלה אצל הנמען לא אומתה',
  disabled: 'השליחה טרם הופעלה',
  not_requested: 'לא התבקשה שליחה',
  blocked: 'לא נשלח: יש לאמת אישור, סנכרון ומועד עתידי',
  missing_contact: 'כתובת או מספר חסרים / לא תקינים',
  contact_changed: 'פרטי הנמען השתנו; יש לרענן ולאמת אותם',
  test_blocked: 'מצב בדיקה: הנמען אינו נמען הבדיקה המאושר',
  not_configured: 'הערוץ אינו מוגדר',
  identity_mismatch: 'חיבור הוואטסאפ אינו תואם למספר המכון; לא נשלח',
  identity_unavailable: 'לא ניתן לאמת את מספר המכון; לא נשלח',
  sending: 'שליחה בטיפול; אין לשלוח שוב',
  pending: 'טרם נשלח',
  unknown: 'תוצאת השליחה אינה ודאית; נדרשת בדיקה ללא שליחה חוזרת',
  failed: 'נדרשת בדיקה לפני ניסיון נוסף',
  unavailable: 'בדיקת מצב השליחה נכשלה; אין להסיק שההודעה לא נשלחה',
};

export function confirmationMessage(start: string, location: string | null, language: ConfirmationLanguage) {
  const when = new Intl.DateTimeFormat(`${language}-IL-u-nu-latn`, {
    timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short',
  }).format(new Date(start));
  // No names, diagnosis, visit type, notes, or public case/cancellation links.
  const place = (location ?? '').replace(/[\r\n\x00-\x1f]/g, ' ').trim().slice(0, 200);
  // Institute appointments carry the public map pin; a custom location (home visit, another site) does not.
  const map = /magic kids|מכון|ילדי הקסם|אלזידאני/i.test(place) ? mapLineFor('adhd', language) : '';
  return language === 'ar'
    ? `مرحبًا، تم تأكيد موعدكم في Magic Kids بتاريخ ${when} (توقيت إسرائيل).${place ? `\nالعنوان: ${place}.` : ''}${map}\nللتغيير أو الإلغاء، يرجى التواصل عبر magickids@magickidsinstitute.com.\nشكرًا، فريق Magic Kids.`
    : `שלום, התור שלכם במכון ילדי הקסם אושר ל־${when} (שעון ישראל).${place ? `\nמיקום: ${place}.` : ''}${map}\nלשינוי או לביטול, פנו למייל magickids@magickidsinstitute.com.\nתודה, צוות Magic Kids.`;
}
