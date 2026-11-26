// Pure constants shared by the therapist pages (client) and the server.
// No server-only imports here.

/** Why a scheduled treatment was moved or cancelled. One must be chosen. */
export const CHANGE_REASONS = [
  { key: 'therapist_personal', label: 'סיבה אישית של המטפלת' },
  { key: 'therapist_absence', label: 'מחלה או היעדרות של המטפלת' },
  { key: 'parent_request', label: 'בקשת ההורים' },
  { key: 'child_sick', label: 'מחלה של הילד/ה' },
  { key: 'no_show', label: 'המטופל/ת לא הגיע/ה' },
  { key: 'holiday', label: 'חג, חופשה או סגירת המכון' },
  { key: 'other', label: 'אחר (יש לפרט בהודעה)' },
] as const;

/** Why a patient was taken off the therapist's list. One must be chosen. */
export const REMOVAL_REASONS = [
  { key: 'not_interested', label: 'ההורים אינם מעוניינים עוד בטיפול' },
  { key: 'no_response', label: 'אין מענה מההורים' },
  { key: 'moved_elsewhere', label: 'עברו למטפל/ת או למסגרת אחרת' },
  { key: 'completed', label: 'הטיפול הסתיים' },
  { key: 'not_suitable', label: 'אי־התאמה לסוג הטיפול' },
  { key: 'duplicate', label: 'רישום כפול או בטעות' },
  { key: 'other', label: 'אחר (יש לפרט בהערה)' },
] as const;

export type ChangeReason = typeof CHANGE_REASONS[number]['key'];
export type RemovalReason = typeof REMOVAL_REASONS[number]['key'];
export type ChangeKind = 'rescheduled' | 'cancelled' | 'removed';

/** Free text written by the therapist (sent to the parents on reschedule/cancel, internal on removal). */
export const NOTE_MAX = 300;

export const changeReasonLabel = (key: string) => CHANGE_REASONS.find(r => r.key === key)?.label ?? key;
export const removalReasonLabel = (key: string) => REMOVAL_REASONS.find(r => r.key === key)?.label ?? key;

/** One recorded change, as returned to the therapist page and the admin page. */
export type TreatmentChange = {
  id: string;
  kind: ChangeKind;
  reason: string;
  reason_label: string;
  previous_at: string | null; // appointment time before the change (ISO)
  new_at: string | null;      // new appointment time (ISO), only for 'rescheduled'
  note: string | null;        // therapist's message / remark
  whatsapp: string | null;    // 'accepted' | 'skipped' | 'failed' | 'unknown' | 'not_configured' | null
  by: 'therapist' | 'staff';
  created_at: string;
};
