import { getSupabaseAdmin } from '@/lib/supabase';
import { firstRelated, intakeProgress, type QuestionnaireProgress, type IntakeAppointment } from './progress';
type Person = { full_name?: string; phone?: string };
type Patient = { first_name?: string; last_name?: string };
type Session = { id: string; status: string; created_at: string; patients: Patient | Patient[]; parents: Person | Person[]; questionnaires: QuestionnaireProgress[]; appointments: IntakeAppointment[] };
export async function loadIntakeQueue() {
  const db = getSupabaseAdmin(), sessions: Session[] = [];
  for (let offset = 0; ; offset += 200) {
    const { data, error } = await db.from('intake_sessions')
      .select('id,status,created_at,patients(first_name,last_name),parents(full_name,phone),questionnaires(type,is_complete,submitted_at,responses),appointments(id,status,scheduled_at,appointment_type)')
      .not('status', 'in', '(closed,cancelled,reported,completed)').order('created_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 199);
    if (error || !data) throw new Error('intake_queue_unavailable');
    sessions.push(...data as unknown as Session[]);
    if (data.length < 200) break;
  }
  return sessions.map(session => {
    const patient = firstRelated(session.patients), parent = firstRelated(session.parents);
    return { id: session.id, status: session.status, createdAt: session.created_at,
      childName: [patient?.first_name, patient?.last_name].filter(Boolean).join(' ') || '—',
      parentName: parent?.full_name ?? '—', parentPhone: parent?.phone ?? '',
      ...intakeProgress(session.questionnaires ?? [], session.appointments ?? [], session.status) };
  }).sort((a, b) => (a.readyAt ?? a.createdAt).localeCompare(b.readyAt ?? b.createdAt));
}
