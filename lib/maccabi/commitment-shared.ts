/** Client-safe constants for the Maccabi commitment desk (no server-only imports). */
export const MACCABI_BRANCH_EMAIL = 'shfaram@mac.org.il';
export const REMINDER_AFTER_BUSINESS_DAYS = 3;
export const SERVICES = ['ביקור רופא ילדים', 'בדיקת רופא מומחה', 'אבחון קשב וריכוז (ADHD)', 'מבדק MOXO', 'הערכת התפתחות הילד', 'ריפוי בעיסוק', 'קלינאות תקשורת', 'טיפול רגשי', 'אחר'] as const;
export type CommitmentStatus = 'sent' | 'reminded' | 'reply_received' | 'ready' | 'rejected' | 'cancelled';
export const STATUS_LABEL: Record<CommitmentStatus, string> = { sent: 'נשלח למכבי', reminded: 'נשלחה תזכורת', reply_received: 'התקבלה תשובה – לבדיקה', ready: 'ההתחייבות מוכנה', rejected: 'נדחה / חסר', cancelled: 'בוטל' };
export const OPEN_STATUSES: CommitmentStatus[] = ['sent', 'reminded', 'reply_received'];
