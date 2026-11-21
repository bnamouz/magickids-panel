import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CLOSED_INTAKE_STATUSES } from '@/lib/intake/progress';
import { asciiDigits } from '@/lib/phone-digits';
import { sessionTracks, type IntakeTrack } from '@/lib/intake/adult';

/**
 * Finds the file a child already has, so the public intake form continues it instead of opening a second one.
 *
 * A child is recognised by national ID. Files opened before the ID became mandatory have none, so those are
 * recognised only when the parent phone, the birth date and the first name all agree (twins share the first two).
 * Ignored: archived patients, cancelled files and files the staff archived on the dashboard.
 */
export type ExistingFile = {
  sessionId: string; status: string; ended: boolean; token: string | null; tokenExpiresAt: string | null;
  /** The phone typed in the form belongs to a parent on the file. Only then is the personal link handed back. */
  phoneMatch: boolean; birthMatch: boolean; via: 'national_id' | 'phone_birth_name';
};
/** `track` defaults to the child track. The two tracks never continue each other's files. */
export type ExistingFileInput = { nationalId: string; birthDate: string; firstName: string; parentPhone: string; track?: IntakeTrack };

/** The same outcomes, worded for an adult who registers for their own assessment. */
export const ADULT_EXISTING_MESSAGES = {
  existing_file: 'כבר קיים עבורך תיק אבחון במכון, ולכן לא נפתח תיק נוסף. מספר הטלפון שהוזן שונה מזה שרשום בתיק. פנו למכון ונעזור לכם להמשיך.',
  existing_file_ended: 'כבר קיים עבורך תיק אבחון במכון, והתהליך בו הסתיים. לתיאום המשך או הערכה חוזרת פנו למכון.',
  details_mismatch: 'לא ניתן לפתוח תיק עם הפרטים שהוזנו. בדקו את מספר תעודת הזהות ואת תאריך הלידה, או פנו למכון.',
  link_unavailable: 'כבר קיים עבורך תיק אבחון במכון, אך לא ניתן לפתוח אותו כרגע. נסו שוב בעוד מספר דקות או פנו למכון.',
} as const;

/** What a parent is told (Hebrew; the public form translates by code) when no file is opened. */
export const EXISTING_MESSAGES = {
  existing_file: 'לילד/ה כבר קיים תיק במכון, ולכן לא נפתח תיק נוסף. מספר הטלפון שהוזן שונה מזה שרשום בתיק. פנו למכון ונעזור לכם להמשיך.',
  existing_file_ended: 'לילד/ה כבר קיים תיק במכון, והתהליך בו הסתיים. לתיאום המשך או הערכה חוזרת פנו למכון.',
  details_mismatch: 'לא ניתן לפתוח תיק עם הפרטים שהוזנו. בדקו את מספר תעודת הזהות ואת תאריך הלידה, או פנו למכון.',
  link_unavailable: 'לילד/ה כבר קיים תיק במכון, אך לא ניתן לפתוח אותו כרגע. נסו שוב בעוד מספר דקות או פנו למכון.',
} as const;

const STATUS_ORDER = ['stuck', 'created', 'parent_form_started', 'parent_form_done', 'teacher_link_sent', 'teacher_form_started', 'teacher_form_done', 'profile_ready', 'booked', 'attended', 'moxo_pending', 'reported', 'closed'];

/** Last nine digits: the same line whether stored as 05x…, +9725x… or with spaces and dashes. */
export function phoneKey(raw: unknown): string | null {
  const digits = asciiDigits(raw).replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : null;
}
/** First name without vowel marks, punctuation, spacing or the Arabic letter variants people type interchangeably. */
export function nameKey(raw: unknown): string {
  return String(raw ?? '').normalize('NFKC').replace(/[\u0591-\u05c7\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
}

type PatientRow = { id: string; first_name: string | null; birth_date: string | null };
type SessionRow = { id: string; patient_id: string; status: string; parent_token: string | null; parent_token_expires_at: string | null; created_at: string };

/** Returns the file to continue, `null` when the child is new, or throws when the lookup itself failed. */
export async function findExistingFile(db: SupabaseClient, input: ExistingFileInput): Promise<ExistingFile | null> {
  const phone = phoneKey(input.parentPhone), track: IntakeTrack = input.track ?? 'child';
  const load = async (patients: PatientRow[]) => {
    const ids = patients.map(p => p.id);
    if (!ids.length) return { sessions: [] as SessionRow[], phones: new Map<string, Set<string>>() };
    const [sessions, parents] = await Promise.all([
      db.from('intake_sessions').select('id,patient_id,status,parent_token,parent_token_expires_at,created_at').in('patient_id', ids),
      db.from('parents').select('patient_id,phone').in('patient_id', ids),
    ]);
    if (sessions.error || parents.error) throw new Error('existing_file_lookup_failed');
    const live = ((sessions.data ?? []) as SessionRow[]).filter(s => s.status !== 'cancelled');
    const archived = live.length ? await db.from('dashboard_case_archive').select('session_id').in('session_id', live.map(s => s.id)) : { data: [], error: null };
    if (archived.error) throw new Error('existing_file_lookup_failed');
    const hidden = new Set((archived.data ?? []).map((row: any) => row.session_id));
    const tracks = await sessionTracks(db, live.map(s => s.id));
    if (!tracks && track === 'adult') throw new Error('existing_file_lookup_failed');
    const sameTrack = (s: SessionRow) => (tracks?.get(s.id) ?? 'child') === track;
    const phones = new Map<string, Set<string>>();
    for (const row of (parents.data ?? []) as { patient_id: string; phone: string | null }[]) {
      const key = phoneKey(row.phone);
      if (key) phones.set(row.patient_id, (phones.get(row.patient_id) ?? new Set()).add(key));
    }
    return { sessions: live.filter(s => !hidden.has(s.id) && sameTrack(s)), phones };
  };
  const pick = (patients: PatientRow[], sessions: SessionRow[], phones: Map<string, Set<string>>, via: ExistingFile['via']): ExistingFile | null => {
    const byId = new Map(patients.map(p => [p.id, p]));
    const rows = sessions.map(s => ({
      s, ended: CLOSED_INTAKE_STATUSES.includes(s.status),
      phoneMatch: !!phone && !!phones.get(s.patient_id)?.has(phone),
      birthMatch: byId.get(s.patient_id)?.birth_date === input.birthDate,
    }));
    // The parent's own file first, then one still in progress, then the furthest along, then the newest.
    rows.sort((a, b) => Number(b.phoneMatch) - Number(a.phoneMatch) || Number(a.ended) - Number(b.ended)
      || STATUS_ORDER.indexOf(b.s.status) - STATUS_ORDER.indexOf(a.s.status) || Date.parse(b.s.created_at) - Date.parse(a.s.created_at));
    const best = rows[0];
    return best ? { sessionId: best.s.id, status: best.s.status, ended: best.ended, token: best.s.parent_token, tokenExpiresAt: best.s.parent_token_expires_at, phoneMatch: best.phoneMatch, birthMatch: best.birthMatch, via } : null;
  };

  const byNationalId = await db.from('patients').select('id,first_name,birth_date').eq('national_id', input.nationalId).is('archived_at', null);
  if (byNationalId.error) throw new Error('existing_file_lookup_failed');
  const known = (byNationalId.data ?? []) as PatientRow[];
  if (known.length) {
    const { sessions, phones } = await load(known);
    const file = pick(known, sessions, phones, 'national_id');
    if (file) return file;
  }

  // Older files carry no national ID. Adult files always have one.
  const first = nameKey(input.firstName);
  if (track === 'adult' || !phone || !first) return null;
  const undated = await db.from('patients').select('id,first_name,birth_date').eq('birth_date', input.birthDate).is('national_id', null).is('archived_at', null);
  if (undated.error) throw new Error('existing_file_lookup_failed');
  const sameName = ((undated.data ?? []) as PatientRow[]).filter(p => nameKey(p.first_name) === first);
  if (!sameName.length) return null;
  const { sessions, phones } = await load(sameName);
  const file = pick(sameName, sessions.filter(s => phones.get(s.patient_id)?.has(phone)), phones, 'phone_birth_name');
  return file;
}

/** The file's personal link, renewed for 30 days when it has lapsed (the link itself does not change). */
export async function usableParentToken(db: SupabaseClient, file: ExistingFile): Promise<string | null> {
  const expires = file.tokenExpiresAt ? Date.parse(file.tokenExpiresAt) : NaN;
  if (file.token && Number.isFinite(expires) && expires > Date.now()) return file.token;
  const token = file.token || randomUUID();
  let update = db.from('intake_sessions').update({ parent_token: token, parent_token_expires_at: new Date(Date.now() + 30 * 86400000).toISOString() }).eq('id', file.sessionId);
  update = file.token ? update.eq('parent_token', file.token) : update.is('parent_token', null);
  const { data, error } = await update.select('id').maybeSingle();
  return error || !data ? null : token;
}
