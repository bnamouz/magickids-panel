import type { SupabaseClient } from '@supabase/supabase-js';
import { nameKey, phoneKey } from '@/lib/intake/existing-file';

/**
 * What the system knows about the patient a renewal request names.
 *  - diagnosed : a file with a documented assessment at the institute. No summary is needed.
 *  - file_only : a file exists, but no assessment is documented in it.
 *  - unknown   : no file fits the details.
 * A file counts only when the national ID fits together with the birth date or a phone on the file, so typing an ID
 * alone never confirms that somebody is a patient. Files opened before the ID became mandatory are found by
 * birth date, first name and phone together.
 */
export type Recognition = { recognition: 'diagnosed' | 'file_only' | 'unknown'; patientId: string | null; sessionId: string | null };
export type RecognitionInput = { nationalId: string; birthDate: string; patientName: string; phone: string };
type Patient = { id: string; first_name: string | null; birth_date: string | null };
type Session = { id: string; patient_id: string; status: string; created_at: string };

const ASSESSED_STATUSES = ['attended', 'moxo_pending', 'reported'];
const MISSED = ['cancelled', 'no_show', 'rescheduled'];
const fail = () => new Error('recognition_failed');

export async function recognisePatient(db: SupabaseClient, input: RecognitionInput, now = Date.now()): Promise<Recognition> {
  const phone = phoneKey(input.phone);
  const phonesOf = async (ids: string[]) => {
    const map = new Map<string, Set<string>>();
    if (!ids.length) return map;
    const r = await db.from('parents').select('patient_id,phone').in('patient_id', ids);
    if (r.error) throw fail();
    for (const row of (r.data ?? []) as { patient_id: string; phone: string | null }[]) {
      const key = phoneKey(row.phone);
      if (key) map.set(row.patient_id, (map.get(row.patient_id) ?? new Set()).add(key));
    }
    return map;
  };

  const byId = await db.from('patients').select('id,first_name,birth_date').eq('national_id', input.nationalId).is('archived_at', null);
  if (byId.error) throw fail();
  let patients = (byId.data ?? []) as Patient[];
  if (patients.length) {
    const phones = await phonesOf(patients.map(p => p.id));
    patients = patients.filter(p => p.birth_date === input.birthDate || (!!phone && !!phones.get(p.id)?.has(phone)));
  }
  if (!patients.length && phone) {
    const older = await db.from('patients').select('id,first_name,birth_date').eq('birth_date', input.birthDate).is('national_id', null).is('archived_at', null);
    if (older.error) throw fail();
    const typed = nameKey(input.patientName);
    const named = ((older.data ?? []) as Patient[]).filter(p => { const first = nameKey(p.first_name); return !!first && typed.startsWith(first); });
    const phones = await phonesOf(named.map(p => p.id));
    patients = named.filter(p => phones.get(p.id)?.has(phone));
  }
  if (!patients.length) return { recognition: 'unknown', patientId: null, sessionId: null };

  const ids = patients.map(p => p.id);
  const s = await db.from('intake_sessions').select('id,patient_id,status,created_at').in('patient_id', ids);
  if (s.error) throw fail();
  const sessions = ((s.data ?? []) as Session[]).filter(x => x.status !== 'cancelled').sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const sessionIds = sessions.map(x => x.id);
  const [appointments, reports, assessments] = await Promise.all([
    db.from('appointments').select('session_id,patient_id,appointment_type,status,scheduled_at,cancelled_at').in('patient_id', ids),
    sessionIds.length ? db.from('reports').select('session_id').in('session_id', sessionIds) : Promise.resolve({ data: [], error: null }),
    sessionIds.length ? db.from('adhd_clinical_assessments').select('session_id').in('session_id', sessionIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (appointments.error || reports.error || assessments.error) throw fail();
  const visit = ((appointments.data ?? []) as any[]).find(a => a.appointment_type !== 'moxo' && !a.cancelled_at && !MISSED.includes(a.status) && Date.parse(a.scheduled_at) < now);
  const documented = sessions.find(x => ASSESSED_STATUSES.includes(x.status))?.id
    ?? ((reports.data ?? []) as any[])[0]?.session_id ?? ((assessments.data ?? []) as any[])[0]?.session_id ?? visit?.session_id ?? null;
  const assessed = !!documented || !!visit;
  const session = sessions.find(x => x.id === documented) ?? sessions[0] ?? null;
  return { recognition: assessed ? 'diagnosed' : 'file_only', patientId: session?.patient_id ?? ids[0], sessionId: session?.id ?? null };
}
