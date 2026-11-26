// Pure helpers for therapist appointment changes (no server imports, unit-tested
// offline by scripts/test-appointment-changes.mjs). Re-exported from
// lib/therapists/appointment-changes.ts.
import { CHANGE_REASONS, REMOVAL_REASONS, NOTE_MAX, type ChangeReason, type RemovalReason } from './change-reasons';

export const INSTITUTE_PHONE = '054-402-0043';
export type Lang = 'he' | 'ar' | 'en';
export class ChangeError extends Error {
  constructor(message: 'invalid_reason' | 'note_required' | 'note_invalid' | 'slot_taken' | 'invalid_state' | 'busy' | 'not_assigned' | 'invalid_request' | 'unavailable', public status = 400) { super(message); }
}

export const isChangeReason = (v: unknown): v is ChangeReason => typeof v === 'string' && CHANGE_REASONS.some(r => r.key === v);
export const isRemovalReason = (v: unknown): v is RemovalReason => typeof v === 'string' && REMOVAL_REASONS.some(r => r.key === v);

// Sent from the institute's WhatsApp number: no links of any kind.
const LINK = [/https?:/i, /\b(?:ftp|mailto|tel|whatsapp|javascript|sms):/i, /\bwww\./i, /wa\.me/i, /[a-z0-9-]+\.[a-z]{2,}/i, /[a-z0-9-]+\s*\[\s*dot\s*\]\s*[a-z]{2,}/i];
// Control characters, bidi overrides/isolates and zero-width characters.
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200d\u2028\u2029\u202a-\u202e\u2060-\u2069\ufeff]/;

/** Returns the cleaned note (null when empty) or throws ChangeError. Line
 *  breaks and tabs become spaces (the note is shown as one line). */
export function validateNote(value: unknown, required: boolean): string | null {
  if (value !== undefined && value !== null && typeof value !== 'string') throw new ChangeError('note_invalid');
  const note = String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[\u200e\u200f]/g, '').replace(/ {2,}/g, ' ').trim();
  if (!note) { if (required) throw new ChangeError('note_required'); return null; }
  if (note.length > NOTE_MAX || UNSAFE.test(note) || LINK.some(p => p.test(note))) throw new ChangeError('note_invalid');
  return note;
}
export function validateChange(reason: unknown, note: unknown) {
  if (!isChangeReason(reason)) throw new ChangeError('invalid_reason');
  return { reason, note: validateNote(note, reason === 'other') };
}
export function validateRemoval(reason: unknown, note: unknown) {
  if (!isRemovalReason(reason)) throw new ChangeError('invalid_reason');
  return { reason, note: validateNote(note, reason === 'other') };
}

// Dates/times in Israel time, Western digits (same style as therapist-time.ts).
const TZ = 'Asia/Jerusalem';
const numeric = (s: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(new Date(s)).map(x => [x.type, x.value]));
  return `${Number(p.day)}.${Number(p.month)}.${p.year}`;
};
const weekday = (s: string, locale: string) => new Intl.DateTimeFormat(locale, { timeZone: TZ, weekday: 'long' }).format(new Date(s));
export function formatChangeDate(s: string, lang: Lang) {
  if (lang === 'he') return `${weekday(s, 'he-IL').replace(/^יום\s+/, '')}, ${numeric(s)}`; // used after "ליום"
  if (lang === 'ar') return `${weekday(s, 'ar')} ${numeric(s)}`;
  return `${weekday(s, 'en-GB')} ${new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(s))}`;
}
export const formatChangeTime = (s: string) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(s));

/** Phrase shown to parents. Never reveals health details of the therapist. */
const PHRASES: Record<Lang, Partial<Record<ChangeReason, string>>> = {
  he: { therapist_personal: ' מסיבות אישיות של המטפלת', therapist_absence: ' עקב היעדרות המטפלת', parent_request: ' לבקשתכם', child_sick: ' לבקשתכם', holiday: ' עקב חג או חופשה במכון' },
  ar: { therapist_personal: ' لأسباب شخصية لدى المعالِجة', therapist_absence: ' بسبب غياب المعالِجة', parent_request: ' بناءً على طلبكم', child_sick: ' بناءً على طلبكم', holiday: ' بسبب عطلة أو إجازة في المعهد' },
  en: { therapist_personal: ' due to the therapist\'s personal reasons', therapist_absence: ' due to the therapist\'s absence', parent_request: ' at your request', child_sick: ' at your request', holiday: ' due to a holiday or break at the institute' },
};
export const reasonPhrase = (reason: ChangeReason, lang: Lang) => PHRASES[lang][reason] ?? '';
/** No apology when the parents asked for it or did not come. */
const apologize = (reason: ChangeReason) => !['parent_request', 'child_sick', 'no_show'].includes(reason);

export type ChangeMessageInput = {
  kind: 'reschedule' | 'cancel';
  language: string | null | undefined;
  contactName: string;
  patientName: string;
  therapistName: string; // full name; only the first name is used
  previousAt: string;
  newAt?: string | null; // required for reschedule
  reason: ChangeReason;
  note?: string | null;
};

/** Exact WhatsApp text the parents receive. Pure. */
export function buildChangeMessage(i: ChangeMessageInput): string {
  const lang: Lang = i.language === 'ar' || i.language === 'en' ? i.language : 'he';
  if (i.kind === 'reschedule' && !i.newAt) throw new ChangeError('invalid_request');
  const first = i.therapistName.trim().split(/\s+/)[0] ?? '';
  const oldD = formatChangeDate(i.previousAt, lang), oldT = formatChangeTime(i.previousAt);
  const newD = i.newAt ? formatChangeDate(i.newAt, lang) : '', newT = i.newAt ? formatChangeTime(i.newAt) : '';
  const phrase = reasonPhrase(i.reason, lang), sorry = apologize(i.reason), note = i.note?.trim() || null;
  let lines: (string | null)[];
  if (lang === 'he') {
    lines = i.kind === 'reschedule' ? [
      `שלום ${i.contactName},`,
      `הטיפול של ${i.patientName} עם ${first} במכון ילדי הקסם, שנקבע ליום ${oldD} בשעה ${oldT}, הועבר ליום ${newD} בשעה ${newT}${phrase}.`,
      note && `הודעה מהמטפלת: ${note}`,
      `לשאלות או לשינוי נוסף השיבו להודעה זו או התקשרו ${INSTITUTE_PHONE}.`,
    ] : [
      `שלום ${i.contactName},`,
      `הטיפול של ${i.patientName} עם ${first} במכון ילדי הקסם, שנקבע ליום ${oldD} בשעה ${oldT}, בוטל${phrase}.${sorry ? ' עמכם הסליחה.' : ''}`,
      note && `הודעה מהמטפלת: ${note}`,
      `נתאם איתכם מועד חדש. לשאלות השיבו להודעה זו או התקשרו ${INSTITUTE_PHONE}.`,
    ];
  } else if (lang === 'ar') {
    lines = i.kind === 'reschedule' ? [
      `مرحبًا ${i.contactName}،`,
      `تم نقل جلسة ${i.patientName} مع ${first} في معهد أطفال السحر، التي كانت محددة يوم ${oldD} الساعة ${oldT}، إلى يوم ${newD} الساعة ${newT}${phrase}.`,
      note && `رسالة من المعالِجة: ${note}`,
      `للاستفسار أو لأي تغيير آخر يمكنكم الرد على هذه الرسالة أو الاتصال على ${INSTITUTE_PHONE}.`,
    ] : [
      `مرحبًا ${i.contactName}،`,
      `تم إلغاء جلسة ${i.patientName} مع ${first} في معهد أطفال السحر، التي كانت محددة يوم ${oldD} الساعة ${oldT}${phrase}.${sorry ? ' نعتذر لكم عن الإزعاج.' : ''}`,
      note && `رسالة من المعالِجة: ${note}`,
      `سننسّق معكم موعدًا جديدًا. للاستفسار يمكنكم الرد على هذه الرسالة أو الاتصال على ${INSTITUTE_PHONE}.`,
    ];
  } else {
    lines = i.kind === 'reschedule' ? [
      `Hello ${i.contactName},`,
      `${i.patientName}'s session with ${first} at the Magic Kids Institute, scheduled for ${oldD} at ${oldT}, has been moved to ${newD} at ${newT}${phrase}.`,
      note && `Message from the therapist: ${note}`,
      `For questions or another change, reply to this message or call ${INSTITUTE_PHONE}.`,
    ] : [
      `Hello ${i.contactName},`,
      `${i.patientName}'s session with ${first} at the Magic Kids Institute, scheduled for ${oldD} at ${oldT}, has been cancelled${phrase}.${sorry ? ' We apologise for the inconvenience.' : ''}`,
      note && `Message from the therapist: ${note}`,
      `We will arrange a new time with you. For questions, reply to this message or call ${INSTITUTE_PHONE}.`,
    ];
  }
  return lines.filter(Boolean).join('\n');
}
