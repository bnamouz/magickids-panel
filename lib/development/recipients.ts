import { DESTINATION } from './schema';
import { MACCABI_CHILDREN_CENTER_EMAIL } from '@/lib/maccabi/send-files';

/** Where a reviewed child-development packet may be emailed. */
/** Maccabi Shfaram child-development institute (Kamal Jumblatt) – address printed on the clinic referral form (1.11.2026). */
export const MACCABI_SHFARAM_CHILD_EMAIL = 'zfn_shraam_child@mac.org.il';
export type RecipientSpec = { to: string[]; cc?: string[]; label: string; /** shown in the UI */ email: string };
export const RECIPIENTS: Record<'all' | 'maccabi' | 'shfaram' | 'institute', RecipientSpec> = {
 all: { to: [MACCABI_CHILDREN_CENTER_EMAIL, MACCABI_SHFARAM_CHILD_EMAIL], cc: [DESTINATION], label: 'לכולם – מוקד מחוזי ילדים + מכון שפרעם, העתק לתיבת המכון', email: `${MACCABI_CHILDREN_CENTER_EMAIL}, ${MACCABI_SHFARAM_CHILD_EMAIL}` },
 maccabi: { to: [MACCABI_CHILDREN_CENTER_EMAIL], label: 'מכבי – מוקד מחוזי ילדים', email: MACCABI_CHILDREN_CENTER_EMAIL },
 shfaram: { to: [MACCABI_SHFARAM_CHILD_EMAIL], label: 'מכבי – מכון להתפתחות הילד שפרעם', email: MACCABI_SHFARAM_CHILD_EMAIL },
 institute: { to: [DESTINATION], label: 'תיבת המכון בלבד (ד״ר נמוז)', email: DESTINATION },
};
export type Recipient = keyof typeof RECIPIENTS;
export const isRecipient = (v: unknown): v is Recipient => typeof v === 'string' && v in RECIPIENTS;
/** Anything that leaves the institute requires an explicit confirmation flag from the UI. */
export const isExternal = (r: Recipient) => r !== 'institute';

const FILE_LABELS: Record<string, string> = {
 'reviewed-summary.pdf': 'ריכוז הדיווחים שנבדק במכון',
 'parent-original-completed.pdf': 'שאלון מכבי להורים – מלא',
 'education-original-completed.pdf': 'שאלון מכבי למסגרת החינוכית – מלא',
 'parent_original.pdf': 'שאלון מכבי להורים – מקור',
 'education_original.pdf': 'שאלון מכבי למסגרת – מקור',
 'referral.pdf': 'הפניית רופא',
 'consent.pdf': 'הסכמת הורים חתומה',
};

/** National ID as typed by the parent in the official Maccabi form (field f5), digits only. */
export function childNationalId(row: any): string | null {
 const v = String(row?.parent_answers?.f5 ?? '').replace(/\D/g, '');
 return /^\d{9}$/.test(v) ? v : null;
}

export function packetSubject(recipient: Recipient, row: any) {
 if (recipient === 'institute') return 'פנייה להתפתחות הילד — מסמכים לעיון';
 const id = childNationalId(row);
 return `מכון ילדי הקסם – ${row.child_name}${id ? ` ת.ז. ${id}` : ''} – שאלוני התפתחות הילד (ערכת מכבי) והפניה`;
}

export function packetBody(recipient: Recipient, row: any, files: string[]) {
 if (recipient === 'institute') return 'שלום, מצורפים שאלוני ההורים והמסגרת, הפניית רופא, הסכמה וסיכום שנבדק במכון ילדי הקסם. נא לאשר קבלה. תודה.';
 const id = childNationalId(row);
 return [
  'שלום רב,',
  '',
  `מצורפים מסמכי התפתחות הילד עבור ${row.child_name}${id ? `, ת.ז. ${id}` : ''}${row.birth_date ? `, תאריך לידה ${row.birth_date}` : ''}, בהמשך להפניית הרופא/ה המטפל/ת.`,
  'השאלונים מולאו על גבי ערכת מכבי המקורית על ידי ההורים והמסגרת החינוכית, ונבדקו במכון ילדי הקסם.',
  '',
  'קבצים מצורפים:',
  ...files.map((f, i) => `${i + 1}. ${FILE_LABELS[f] ?? f} (${f})`),
  '',
  'נודה לאישור קבלה.',
  '',
  'בברכה,',
  'ד״ר בסים נמוז · מכון ילדי הקסם',
  'דאהר עומר אלזידאני 9, שפרעם',
  'טלפון 054-402-0043 · magickids@magickidsinstitute.com',
 ].join('\n');
}
