/** Ready-made WhatsApp replies for doctor requests. Sent from the staff member's own phone (wa.me), never from the API. */
export type Lang = 'he' | 'ar';
export type Clinic = 'pediatrics' | 'adhd';
export type Template = { id: string; title: string; text: Record<Lang, string> };
type Vars = { parent: string; child: string };

const PEDS_BOOK = 'https://app.magickidsinstitute.com/book/pediatrics';
const ADHD_FOLLOWUP = 'https://app.magickidsinstitute.com/book/adhd?visitType=followup';
const PHONE = '054-349-6656';

const open = { he: (v: Vars) => `שלום ${v.parent}, זו המזכירות של ד״ר בסים נמוז.`, ar: (v: Vars) => `مرحبًا ${v.parent}، معك سكرتارية د. باسم نموز.` };
const regards = { he: 'בברכה, צוות המרפאה', ar: 'مع التحية، طاقم العيادة' };

export const TEMPLATES: Record<Clinic, Template[]> = {
  pediatrics: [
    { id: 'received', title: 'הבקשה התקבלה', text: { he: `הבקשה שלך לגבי ${'{child}'} התקבלה ותטופל היום. נעדכן כשתסתיים.`, ar: `طلبكم بخصوص ${'{child}'} وصلنا ورح يتعالج اليوم. منحدّثكم لما يخلص.` } },
    { id: 'done_pharmacy', title: 'טופל — המרשם נשלח', text: { he: `הבקשה לגבי ${'{child}'} טופלה. המרשם הועבר ואפשר לממש אותו בבית המרקחת.`, ar: `طلبكم بخصوص ${'{child}'} انعالج. الوصفة انبعتت وبتقدروا تستلموها من الصيدلية.` } },
    { id: 'done_pickup', title: 'טופל — מוכן לאיסוף במרפאה', text: { he: `הבקשה לגבי ${'{child}'} טופלה. המסמך מוכן לאיסוף במרפאה בשעות הקבלה.`, ar: `طلبكم بخصوص ${'{child}'} انعالج. الورقة جاهزة للاستلام من العيادة بساعات الاستقبال.` } },
    { id: 'needs_visit', title: 'נדרש ביקור במרפאה', text: { he: `הרופא עבר על הבקשה לגבי ${'{child}'} ומבקש להגיע לביקור במרפאה כדי לטפל בה. לקביעת תור: ${PEDS_BOOK}`, ar: `الدكتور شاف الطلب بخصوص ${'{child}'} وبيطلب تيجوا للعيادة لفحص. لحجز موعد: ${PEDS_BOOK}` } },
    { id: 'needs_card', title: 'חסר אישור ביקור / כרטיס קופה', text: { he: `כדי לטפל בבקשה לגבי ${'{child}'} נדרש אישור ביקור מהקופה (העברת כרטיס או אישור ביקור ללא כרטיס). ברגע שיתקבל, נמשיך בטיפול.`, ar: `لمعالجة الطلب بخصوص ${'{child}'} لازم تصديق زيارة من الصندوق (تمرير البطاقة أو تصديق زيارة بدون بطاقة). أول ما يوصل، منكمل.` } },
    { id: 'needs_info', title: 'חסרים פרטים', text: { he: `כדי להשלים את הטיפול בבקשה לגבי ${'{child}'} נצטרך עוד פרט: ______. אפשר להשיב כאן בהודעה.`, ar: `لإكمال الطلب بخصوص ${'{child}'} منحتاج معلومة إضافية: ______. بتقدروا تردّوا هون.` } },
    { id: 'declined', title: 'לא ניתן לטפל ללא בדיקה', text: { he: `לצערנו לא ניתן לאשר את הבקשה לגבי ${'{child}'} ללא בדיקה של הרופא. מוזמנים לקבוע תור: ${PEDS_BOOK} או להתקשר ${PHONE}.`, ar: `للأسف ما بنقدر نوافق على الطلب بخصوص ${'{child}'} بدون فحص عند الدكتور. بتقدروا تحجزوا موعد: ${PEDS_BOOK} أو تتصلوا ${PHONE}.` } },
  ],
  adhd: [
    { id: 'received', title: 'הבקשה התקבלה', text: { he: `הבקשה שלך לגבי ${'{child}'} התקבלה ותטופל ביום הפעילות הקרוב של מרפאת הקשב (יום רביעי). נעדכן כשתסתיים.`, ar: `طلبكم بخصوص ${'{child}'} وصلنا ورح يتعالج بأقرب يوم عمل لعيادة الانتباه (الأربعاء). منحدّثكم لما يخلص.` } },
    { id: 'done_pharmacy', title: 'טופל — המרשם נשלח', text: { he: `הבקשה לגבי ${'{child}'} טופלה. המרשם הועבר ואפשר לממש אותו בבית המרקחת.`, ar: `طلبكم بخصوص ${'{child}'} انعالج. الوصفة انبعتت وبتقدروا تستلموها من الصيدلية.` } },
    { id: 'done_pickup', title: 'טופל — מוכן לאיסוף', text: { he: `הבקשה לגבי ${'{child}'} טופלה. המסמך מוכן לאיסוף במכון בשעות הפעילות.`, ar: `طلبكم بخصوص ${'{child}'} انعالج. الورقة جاهزة للاستلام من المعهد بساعات العمل.` } },
    { id: 'needs_followup', title: 'נדרש ביקור מעקב', text: { he: `הרופא עבר על הבקשה לגבי ${'{child}'} ומבקש ביקור מעקב לפני חידוש הטיפול. לקביעת תור מעקב: ${ADHD_FOLLOWUP}`, ar: `الدكتور شاف الطلب بخصوص ${'{child}'} وبيطلب زيارة متابعة قبل تجديد العلاج. لحجز موعد متابعة: ${ADHD_FOLLOWUP}` } },
    { id: 'needs_card', title: 'חסר אישור ביקור / כרטיס קופה', text: { he: `כדי לטפל בבקשה לגבי ${'{child}'} נדרש אישור ביקור מהקופה (העברת כרטיס או אישור ביקור ללא כרטיס). ברגע שיתקבל, נמשיך בטיפול.`, ar: `لمعالجة الطلب بخصوص ${'{child}'} لازم تصديق زيارة من الصندوق (تمرير البطاقة أو تصديق زيارة بدون بطاقة). أول ما يوصل، منكمل.` } },
    { id: 'needs_payment', title: 'נדרש תשלום (קופה שאינה מכבי)', text: { he: `הבקשה לגבי ${'{child}'} דורשת ביקור בתשלום, כי הטיפול במכון אינו מכוסה דרך הקופה שלכם. פרטי התשלום וקביעת התור: ${ADHD_FOLLOWUP}`, ar: `الطلب بخصوص ${'{child}'} بيحتاج زيارة مدفوعة، لأن العلاج بالمعهد مش مغطّى عن طريق صندوقكم. تفاصيل الدفع وحجز الموعد: ${ADHD_FOLLOWUP}` } },
    { id: 'needs_info', title: 'חסרים פרטים', text: { he: `כדי להשלים את הטיפול בבקשה לגבי ${'{child}'} נצטרך עוד פרט: ______. אפשר להשיב כאן בהודעה.`, ar: `لإكمال الطلب بخصوص ${'{child}'} منحتاج معلومة إضافية: ______. بتقدروا تردّوا هون.` } },
    { id: 'declined', title: 'לא ניתן לטפל ללא ביקור', text: { he: `לצערנו לא ניתן לאשר את הבקשה לגבי ${'{child}'} ללא ביקור אצל הרופא. לקביעת תור מעקב: ${ADHD_FOLLOWUP}`, ar: `للأسف ما بنقدر نوافق على الطلب بخصوص ${'{child}'} بدون زيارة عند الدكتور. لحجز موعد متابعة: ${ADHD_FOLLOWUP}` } },
  ],
};

export function renderTemplate(t: Template, lang: Lang, v: Vars) {
  const body = t.text[lang].replaceAll('{child}', v.child || (lang === 'he' ? 'הילד/ה' : 'الولد/البنت'));
  return `${open[lang](v)}\n${body}\n${regards[lang]}`;
}
/** Pulls parent, phone and language hints out of the request text stored in the calendar event. */
export function parseRequest(description: string | null | undefined, summary: string | null | undefined) {
  const d = description ?? '';
  const phone = d.match(/טלפון:\s*(\+?[\d\s()-]{7,20})/)?.[1]?.replace(/\D/g, '') ?? '';
  const parent = d.match(/הורה:\s*(.+)/)?.[1]?.trim() ?? '';
  const child = d.match(/ילד\/ה:\s*(.+)/)?.[1]?.trim() ?? (summary ?? '').split(' · ')[0].trim();
  const lang: Lang = /[\u0600-\u06FF]/.test(d.split('\n\n').slice(1).join(' ')) ? 'ar' : 'he';
  return { phone, parent, child, lang };
}
