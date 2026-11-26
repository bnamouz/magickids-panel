// Therapist edits of assigned treatment requests: reschedule, cancel the
// appointment (patient stays, waits for a new time), remove the patient.
// Every change is recorded in treatment_request_changes (atomic SQL functions
// in supabase/migrations/20261127090000_treatment_request_changes.sql).
// Parents are told by WhatsApp from the institute number only after the
// database change succeeded, and never when `notify` is false.
import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase';
import { notifyOnce } from '@/lib/moxo/notification';
import { syncTreatment } from './calendar';
import { publicBookingSlots } from './parent-booking';
import { changeReasonLabel, removalReasonLabel, type ChangeKind, type TreatmentChange } from './change-reasons';
import { ChangeError, buildChangeMessage, validateChange, validateRemoval } from './change-message';

export { ChangeError, buildChangeMessage, validateChange, validateRemoval, validateNote, formatChangeDate, formatChangeTime, reasonPhrase } from './change-message';

/** Who acts and from which page. `slug` = personal diary (booking-profile slots). */
export type ChangeActor = { therapistId: string; staffId: string | null; slug?: string | null };

const COLUMNS = 'id,therapist_id,therapist,status,scheduled_at,duration_minutes,contact_name,patient_name,phone,language,calendar_sync,calendar_event_id';
type Row = { id: string; therapist_id: string | null; therapist: string | null; status: string; scheduled_at: string | null; duration_minutes: number | null;
  contact_name: string; patient_name: string; phone: string; language: string; calendar_sync: string; calendar_event_id: string | null };

async function load(requestId: string, a: ChangeActor): Promise<Row> {
  const r = await getSupabaseAdmin().from('treatment_requests').select(COLUMNS).eq('id', requestId).eq('therapist_id', a.therapistId).maybeSingle();
  if (r.error) throw new ChangeError('unavailable', 409);
  if (!r.data) throw new ChangeError('not_assigned', 403);
  return r.data as Row;
}
async function therapistName(a: ChangeActor, row: Row) {
  const t = await getSupabaseAdmin().from('therapists').select('name').eq('id', a.therapistId).maybeSingle();
  return (t.data?.name as string | undefined) ?? row.therapist ?? '';
}
const iso = (s: unknown) => {
  if (typeof s !== 'string' || !Number.isFinite(Date.parse(s))) throw new ChangeError('invalid_request');
  return new Date(s).toISOString();
};
function rpcResult(r: { data: unknown; error: { message?: string } | null }, ok: string) {
  if (r.error) throw new ChangeError(String(r.error.message ?? '').includes('slot_taken') ? 'slot_taken' : 'unavailable', 409);
  if (r.data === ok) return;
  if (r.data === 'not_found' || r.data === 'not_assigned') throw new ChangeError('not_assigned', 403);
  if (r.data === 'slot_taken' || r.data === 'invalid_state' || r.data === 'busy') throw new ChangeError(r.data, 409);
  if (r.data === 'invalid_request') throw new ChangeError('invalid_request', 400);
  throw new ChangeError('unavailable', 409);
}
function requireScheduled(row: Row) {
  if (row.calendar_sync === 'syncing') throw new ChangeError('busy', 409);
  if (row.status !== 'scheduled' || !row.scheduled_at) throw new ChangeError('invalid_state', 409);
}
async function sendToParents(changeId: string, row: Row, text: string) {
  const state = await notifyOnce(`treatment-change:${changeId}`, row.phone, text, { sender: 'institute' }).catch(() => 'unknown');
  await getSupabaseAdmin().from('treatment_request_changes').update({ whatsapp: String(state).slice(0, 40) }).eq('id', changeId);
  return state;
}

/** Exact text the parents would get. No side effects. */
export async function previewChange(requestId: string, a: ChangeActor, b: { kind: unknown; reason: unknown; start?: unknown; note?: unknown }) {
  if (b.kind !== 'reschedule' && b.kind !== 'cancel') throw new ChangeError('invalid_request');
  const { reason, note } = validateChange(b.reason, b.note);
  const newAt = b.kind === 'reschedule' ? iso(b.start) : null;
  const row = await load(requestId, a);
  requireScheduled(row);
  const text = buildChangeMessage({ kind: b.kind, language: row.language, contactName: row.contact_name, patientName: row.patient_name,
    therapistName: await therapistName(a, row), previousAt: row.scheduled_at!, newAt, reason, note });
  return { text };
}

export async function rescheduleTreatment(requestId: string, a: ChangeActor, b: { start: unknown; reason: unknown; note?: unknown; notify: unknown }) {
  const { reason, note } = validateChange(b.reason, b.note);
  if (typeof b.notify !== 'boolean') throw new ChangeError('invalid_request');
  const start = iso(b.start);
  const row = await load(requestId, a);
  requireScheduled(row);
  if (Date.parse(row.scheduled_at!) === Date.parse(start)) throw new ChangeError('invalid_state', 409);
  if (a.slug) {
    // Personal diary: the new time must be one of the profile's free slots
    // (own current appointment excluded) with the appointment's duration.
    let slots;
    try { slots = (await publicBookingSlots(a.slug, row.duration_minutes, row.id)).slots; } catch { throw new ChangeError('unavailable', 409); }
    if (!slots.some(s => s.start === start && s.duration === row.duration_minutes)) throw new ChangeError('slot_taken', 409);
  }
  const changeId = randomUUID();
  rpcResult(await getSupabaseAdmin().rpc('reschedule_treatment_request', { p_id: requestId, p_therapist: a.therapistId, p_start: start,
    p_mode: a.slug ? 'profile' : 'hours', p_change: changeId, p_reason: reason, p_note: note, p_actor: a.staffId ? 'staff' : 'therapist',
    p_staff: a.staffId, p_whatsapp: b.notify ? 'pending' : 'skipped' }), 'rescheduled');
  const calendar = await syncTreatment(requestId).catch(() => 'failed');
  let whatsapp: string = 'skipped';
  if (b.notify) {
    const text = buildChangeMessage({ kind: 'reschedule', language: row.language, contactName: row.contact_name, patientName: row.patient_name,
      therapistName: await therapistName(a, row), previousAt: row.scheduled_at!, newAt: start, reason, note });
    whatsapp = await sendToParents(changeId, row, text);
  }
  return { status: 'rescheduled' as const, calendar, whatsapp };
}

async function calendarAfter(requestId: string) {
  const calendar = await syncTreatment(requestId).catch(() => 'failed');
  if (calendar !== 'unchanged') return calendar;
  const r = await getSupabaseAdmin().from('treatment_requests').select('calendar_sync').eq('id', requestId).maybeSingle();
  return r.data?.calendar_sync === 'none' ? 'none' : calendar;
}

export async function cancelAppointment(requestId: string, a: ChangeActor, b: { reason: unknown; note?: unknown; notify: unknown }) {
  const { reason, note } = validateChange(b.reason, b.note);
  if (typeof b.notify !== 'boolean') throw new ChangeError('invalid_request');
  const row = await load(requestId, a);
  requireScheduled(row);
  const changeId = randomUUID();
  rpcResult(await getSupabaseAdmin().rpc('cancel_treatment_appointment', { p_id: requestId, p_therapist: a.therapistId, p_change: changeId,
    p_reason: reason, p_note: note, p_actor: a.staffId ? 'staff' : 'therapist', p_staff: a.staffId, p_whatsapp: b.notify ? 'pending' : 'skipped' }), 'cancelled');
  const calendar = await calendarAfter(requestId);
  let whatsapp: string = 'skipped';
  if (b.notify) {
    const text = buildChangeMessage({ kind: 'cancel', language: row.language, contactName: row.contact_name, patientName: row.patient_name,
      therapistName: await therapistName(a, row), previousAt: row.scheduled_at!, reason, note });
    whatsapp = await sendToParents(changeId, row, text);
  }
  return { status: 'cancelled' as const, calendar, whatsapp };
}

/** Takes the patient off the therapist's list. No message to the parents. */
export async function removePatient(requestId: string, a: ChangeActor, b: { reason: unknown; note?: unknown }) {
  const { reason, note } = validateRemoval(b.reason, b.note);
  const row = await load(requestId, a);
  if (row.calendar_sync === 'syncing') throw new ChangeError('busy', 409);
  if (!['pending', 'contacted', 'scheduled'].includes(row.status)) throw new ChangeError('invalid_state', 409);
  rpcResult(await getSupabaseAdmin().rpc('remove_treatment_patient', { p_id: requestId, p_therapist: a.therapistId, p_change: randomUUID(),
    p_reason: reason, p_note: note, p_actor: a.staffId ? 'staff' : 'therapist', p_staff: a.staffId }), 'removed');
  return { status: 'removed' as const, calendar: await calendarAfter(requestId) };
}

/** Newest first, at most 5 per request. Read-only and fail-soft: an error
 *  (e.g. table not yet created) yields empty lists rather than breaking pages. */
export async function listTreatmentChanges(requestIds: string[]): Promise<Record<string, TreatmentChange[]>> {
  const ids = [...new Set(requestIds.filter(id => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)))];
  const out: Record<string, TreatmentChange[]> = Object.fromEntries(ids.map(id => [id, [] as TreatmentChange[]]));
  if (!ids.length) return out;
  const r = await getSupabaseAdmin().from('treatment_request_changes').select('id,request_id,kind,reason,previous_at,new_at,note,whatsapp,actor,created_at')
    .in('request_id', ids).order('created_at', { ascending: false }).limit(Math.min(ids.length * 20, 2000));
  if (r.error) return out;
  for (const c of (r.data ?? []) as { id: string; request_id: string; kind: ChangeKind; reason: string; previous_at: string | null; new_at: string | null; note: string | null; whatsapp: string | null; actor: 'therapist' | 'staff'; created_at: string }[]) {
    const list = out[c.request_id];
    if (!list || list.length >= 5) continue;
    list.push({ id: c.id, kind: c.kind, reason: c.reason, reason_label: c.kind === 'removed' ? removalReasonLabel(c.reason) : changeReasonLabel(c.reason),
      previous_at: c.previous_at, new_at: c.new_at, note: c.note, whatsapp: c.whatsapp, by: c.actor, created_at: c.created_at });
  }
  return out;
}
