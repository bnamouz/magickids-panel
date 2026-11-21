/**
 * Ready-made WhatsApp messages for a single clinic patient. The doctor picks one in the message dialog and can edit it before sending.
 * {שם} is replaced by the child's first name. The wording is gender-neutral because the clinic list holds no gender.
 */
export const CLINIC_GREETING = 'שלום, כאן מרפאת הילדים של ד״ר בסים נמוז.';
export type ClinicTemplate = { id: string; label: string; body: string };
export const CLINIC_TEMPLATE_GROUPS: { label: string; items: ClinicTemplate[] }[] = [
  { label: 'תוצאות בדיקות', items: [
    { id: 'throat_positive', label: 'משטח גרון חיובי', body: 'משטח הגרון של {שם} יצא חיובי, ולכן יש לקחת אנטיביוטיקה למשך 10 ימים שלמים.' },
    { id: 'throat_negative', label: 'משטח גרון שלילי', body: 'משטח הגרון של {שם} יצא שלילי, ואין צורך באנטיביוטיקה. אם החום נמשך או שיש החמרה, נא לחזור לבדיקה.' },
    { id: 'urine_positive', label: 'תרבית שתן חיובית', body: 'תרבית השתן של {שם} יצאה חיובית ויש צורך בטיפול אנטיביוטי. נא ליצור קשר עם המרפאה עוד היום.' },
    { id: 'urine_negative', label: 'תרבית שתן תקינה', body: 'תרבית השתן של {שם} יצאה תקינה, ואין צורך בטיפול.' },
    { id: 'blood_normal', label: 'בדיקות דם תקינות', body: 'תוצאות בדיקות הדם של {שם} תקינות, ואין צורך בהמשך בירור.' },
    { id: 'results_visit', label: 'תוצאות שדורשות ביקור', body: 'התקבלו תוצאות הבדיקות של {שם}. נא לקבוע תור למרפאה כדי לעבור עליהן יחד.' },
  ] },
  { label: 'מרשמים ומסמכים', items: [
    { id: 'prescription_ready', label: 'מרשם מוכן', body: 'המרשם של {שם} מוכן, ואפשר לקבל את התרופה בבית המרקחת.' },
    { id: 'referral_ready', label: 'הפניה מוכנה', body: 'ההפניה של {שם} מוכנה, ואפשר לקבוע תור לפיה.' },
    { id: 'certificate_ready', label: 'אישור רפואי מוכן', body: 'האישור הרפואי של {שם} מוכן, ואפשר לאסוף אותו מהמרפאה.' },
  ] },
  { label: 'מעקב וביקורים', items: [
    { id: 'follow_up', label: 'הזמנה לביקורת', body: 'נא לקבוע תור לביקורת במרפאה עבור {שם}.' },
    { id: 'height_weight', label: 'חסרים גובה ומשקל', body: 'חסרות לנו מדידות עדכניות של גובה ומשקל עבור {שם}. נא להגיע למרפאה למדידה קצרה.' },
    { id: 'check_in', label: 'מה שלום הילד', body: 'רצינו לשאול מה שלום {שם} היום. אם אין שיפור או שיש החמרה, נא ליצור קשר עם המרפאה.' },
    { id: 'call_clinic', label: 'בקשה ליצור קשר', body: 'נא ליצור קשר עם המרפאה בנוגע ל{שם}.' },
  ] },
];
export const CLINIC_TEMPLATES = CLINIC_TEMPLATE_GROUPS.flatMap(g => g.items);

/** Opening text of the dialog when no ready-made message is chosen. */
export const freeText = (firstName: string) => `שלום, כאן מרפאת הילדים של ד״ר בסים נמוז לגבי ${firstName}. `;
/** Full message for a ready-made template; an unknown id falls back to free text. */
export function templateText(id: string, firstName: string) {
  const t = CLINIC_TEMPLATES.find(x => x.id === id);
  return t ? `${CLINIC_GREETING}\n${t.body.replace(/\{שם\}/g, firstName.trim())}` : freeText(firstName);
}
