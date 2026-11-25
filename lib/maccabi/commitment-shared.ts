/** Client-safe constants for the Maccabi commitment desk (no server-only imports). */
export const MACCABI_BRANCH_EMAIL = 'shfaram@mac.org.il';
/** Maccabi national imaging center + imaging consult mailbox (owner request, 25.11.2026). One mail, both addresses. */
export const MACCABI_IMAGING_EMAILS = ['DimutRequest@mac.org.il', 'ImageConsult@mac.org.il'] as const;
export type RequestKind = 'commitment' | 'imaging';
export const REMINDER_AFTER_BUSINESS_DAYS = 3;
/** Maccabi states up to 5 working days for the imaging center, so the first automatic reminder goes out on the 6th. */
export const IMAGING_REMINDER_AFTER_BUSINESS_DAYS = 6;
export const reminderAfter = (kind: RequestKind | null | undefined) => (kind === 'imaging' ? IMAGING_REMINDER_AFTER_BUSINESS_DAYS : REMINDER_AFTER_BUSINESS_DAYS);
export const SERVICES = ['ביקור רופא ילדים', 'בדיקת רופא מומחה', 'אבחון קשב וריכוז (ADHD)', 'מבדק MOXO', 'הערכת התפתחות הילד', 'ריפוי בעיסוק', 'קלינאות תקשורת', 'טיפול רגשי', 'אחר'] as const;
export const IMAGING_TYPES = ['MRI', 'CT', 'PET-CT', 'מיפוי', 'אולטרסאונד', 'צילום רנטגן', 'אחר'] as const;
export type CommitmentStatus = 'sent' | 'reminded' | 'reply_received' | 'ready' | 'rejected' | 'cancelled';
export const STATUS_LABEL: Record<CommitmentStatus, string> = { sent: 'נשלח למכבי', reminded: 'נשלחה תזכורת', reply_received: 'התקבלה תשובה – לבדיקה', ready: 'ההתחייבות מוכנה', rejected: 'נדחה / חסר', cancelled: 'בוטל' };
export const IMAGING_STATUS_LABEL: Record<CommitmentStatus, string> = { ...STATUS_LABEL, sent: 'נשלח למרכז הדימות', ready: 'הבדיקה אושרה' };
export const statusLabel = (kind: RequestKind | null | undefined, status: CommitmentStatus) => (kind === 'imaging' ? IMAGING_STATUS_LABEL : STATUS_LABEL)[status];
/** Where a request of this kind is e-mailed (comma-separated when there is more than one mailbox). */
export const recipientFor = (kind: RequestKind | null | undefined) => (kind === 'imaging' ? MACCABI_IMAGING_EMAILS.join(', ') : MACCABI_BRANCH_EMAIL);
/** Imaging request text shown to Maccabi: the test type plus the examined area / details. */
export const imagingService = (type: string, detail: string) => (type === 'אחר' ? detail.trim() : `${type} – ${detail.trim()}`);
export const OPEN_STATUSES: CommitmentStatus[] = ['sent', 'reminded', 'reply_received'];
