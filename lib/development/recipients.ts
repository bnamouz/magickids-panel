import { DESTINATION } from './schema';
import { MACCABI_CHILDREN_CENTER_EMAIL } from '@/lib/maccabi/send-files';

/** Where a reviewed child-development packet may be emailed. */
export const RECIPIENTS = {
 institute: { email: DESTINATION, label: 'תיבת המכון (ד״ר נמוז)' },
 maccabi: { email: MACCABI_CHILDREN_CENTER_EMAIL, label: 'מכבי – מוקד מחוזי ילדים' },
} as const;
export type Recipient = keyof typeof RECIPIENTS;
export const isRecipient = (v: unknown): v is Recipient => v === 'institute' || v === 'maccabi';

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
