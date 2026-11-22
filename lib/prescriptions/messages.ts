import type { RenewalMonths } from './pricing';

/** WhatsApp texts sent to the family from the institute's number when the doctor decides on a renewal request. */
export function issuedText(lang: string, name: string, months: RenewalMonths, note?: string | null) {
  const extra = note?.trim() ? ` ${note.trim()}` : '';
  if (lang === 'ar') return `مرحبًا، تمت الموافقة على طلبكم لتجديد الوصفة الطبية لـ${name}، وصدرت الوصفة لمدة ${months === 1 ? 'شهر واحد' : 'ثلاثة أشهر'}.${extra} للاستفسار: واتساب 054-402-0043.`;
  if (lang === 'en') return `Hello, your prescription renewal request for ${name} was approved and a prescription for ${months === 1 ? 'one month' : 'three months'} was issued.${extra} Questions: WhatsApp 054-402-0043.`;
  return `שלום, בקשתכם לחידוש מרשם עבור ${name} אושרה, והמרשם ל${months === 1 ? 'חודש אחד' : 'שלושה חודשים'} הופק.${extra} לשאלות: וואטסאפ 054-402-0043.`;
}
export function rejectedText(lang: string, name: string, note?: string | null) {
  const extra = note?.trim() ? ` ${note.trim()}` : '';
  if (lang === 'ar') return `مرحبًا، لم نتمكن من الموافقة على طلبكم لتجديد الوصفة الطبية لـ${name}.${extra} للاستفسار: واتساب 054-402-0043.`;
  if (lang === 'en') return `Hello, we could not approve your prescription renewal request for ${name}.${extra} Questions: WhatsApp 054-402-0043.`;
  return `שלום, לא ניתן לאשר את בקשתכם לחידוש מרשם עבור ${name}.${extra} לבירור: וואטסאפ 054-402-0043.`;
}
