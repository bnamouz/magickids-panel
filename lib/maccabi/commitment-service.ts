import { getSupabaseAdmin } from '@/lib/supabase';
import { sendClinicPreferred } from '@/lib/whatsapp-clinic';
import { sender } from '@/lib/therapists/mail';
import type { MailAttachment } from '@/lib/maccabi/send-files';
import { readAccess, sendRaw, threadMessages } from '@/lib/maccabi/gmail';
import {
  MACCABI_BRANCH_EMAIL, OPEN_STATUSES, REMINDER_AFTER_BUSINESS_DAYS, buildReminderRaw, buildRequestRaw, businessDaysBetween, classifyReply,
  isBusinessDay, newReference, readyWhatsApp, rfcId, type CommitmentInput, type CommitmentStatus,
} from '@/lib/maccabi/commitments';

export type CommitmentRow = {
  id: string; reference: string; clinic_patient_id: string | null; patient_name: string; national_id: string; birth_date: string | null; phone: string;
  service: string; note: string | null; attachments: { filename: string }[]; status: CommitmentStatus; gmail_thread_id: string | null; gmail_message_id: string | null;
  rfc_message_id: string | null; sent_at: string; last_reminder_at: string | null; reminders_count: number; last_checked_at: string | null; last_reply_at: string | null;
  last_reply_snippet: string | null; reply_count: number; ready_at: string | null; ready_source: 'email' | 'manual' | null; patient_notified_at: string | null;
  notify_provider_id: string | null; notify_error: string | null; created_by: string | null; created_at: string; updated_at: string;
};
const TABLE = 'maccabi_commitments';
const touch = () => ({ updated_at: new Date().toISOString() });

async function audit(action: string, entityId: string, metadata: Record<string, unknown>, actorId: string | null) {
  await getSupabaseAdmin().from('audit_log').insert({ actor_id: actorId, actor_type: actorId ? 'user' : 'system', action, entity_type: 'maccabi_commitment', entity_id: entityId, metadata });
}

/** Sends the request e-mail to the Maccabi branch (or to our own mailbox in test mode) and stores the tracking row. */
export async function createCommitment(input: Omit<CommitmentInput, 'reference' | 'attachments'> & { clinicPatientId?: string | null; createdBy: string | null; files?: MailAttachment[]; testToSelf?: boolean }) {
  const reference = newReference();
  const to = input.testToSelf ? sender : MACCABI_BRANCH_EMAIL;
  const files = input.files ?? [];
  const raw = buildRequestRaw({ ...input, reference, attachments: files.map((f) => f.filename) }, files, to);
  const sent = await sendRaw(raw);
  const db = getSupabaseAdmin();
  const { data, error } = await db.from(TABLE).insert({
    reference, clinic_patient_id: input.clinicPatientId ?? null, patient_name: input.patientName, national_id: input.nationalId, birth_date: input.birthDate || null,
    phone: input.phone, service: input.service, note: input.note?.trim() || null, attachments: files.map((f) => ({ filename: f.filename })),
    status: 'sent', gmail_thread_id: sent.threadId, gmail_message_id: sent.id, rfc_message_id: rfcId(reference), created_by: input.createdBy,
  }).select('*').single();
  if (error || !data) throw new Error('db_insert_failed');
  await audit('maccabi_commitment_requested', data.id, { reference, to, test: Boolean(input.testToSelf), service: input.service, files: files.map((f) => f.filename) }, input.createdBy);
  return data as CommitmentRow;
}

export async function sendReminder(row: CommitmentRow, actorId: string | null, testToSelf = false) {
  const nth = row.reminders_count + 1;
  const raw = buildReminderRaw({ reference: row.reference, patientName: row.patient_name, nationalId: row.national_id, service: row.service, sentAt: new Date(row.sent_at), nth, to: testToSelf ? sender : undefined });
  const sent = await sendRaw(raw, row.gmail_thread_id);
  const db = getSupabaseAdmin();
  const patch = { reminders_count: nth, last_reminder_at: new Date().toISOString(), status: row.status === 'sent' ? 'reminded' : row.status, gmail_thread_id: row.gmail_thread_id ?? sent.threadId, ...touch() };
  await db.from(TABLE).update(patch).eq('id', row.id);
  await audit('maccabi_commitment_reminder_sent', row.id, { reference: row.reference, nth, gmail_message_id: sent.id }, actorId);
  return { ...row, ...patch } as CommitmentRow;
}

/** Marks the commitment ready and tells the family on WhatsApp from the clinic number (falls back to the doctor's / institute's number). */
export async function markReady(row: CommitmentRow, source: 'email' | 'manual', actorId: string | null, lang: 'he' | 'ar' = 'he') {
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();
  const wa = await sendClinicPreferred({ toPhone: row.phone, body: readyWhatsApp({ patientName: row.patient_name, service: row.service, lang }) });
  const patch = { status: 'ready' as const, ready_at: row.ready_at ?? now, ready_source: source, patient_notified_at: wa.ok ? now : row.patient_notified_at, notify_provider_id: wa.ok ? wa.id ?? null : row.notify_provider_id, notify_error: wa.ok ? null : wa.error ?? 'send_failed', ...touch() };
  await db.from(TABLE).update(patch).eq('id', row.id);
  await audit('maccabi_commitment_ready', row.id, { reference: row.reference, source, whatsapp_ok: wa.ok, sender: wa.sender, fallback: wa.fallbackReason, error: wa.ok ? null : wa.error }, actorId);
  return { row: { ...row, ...patch } as CommitmentRow, whatsapp: wa };
}

export async function setStatus(row: CommitmentRow, status: Extract<CommitmentStatus, 'rejected' | 'cancelled' | 'sent'>, actorId: string | null) {
  const patch = { status, ...touch() };
  await getSupabaseAdmin().from(TABLE).update(patch).eq('id', row.id);
  await audit(`maccabi_commitment_${status}`, row.id, { reference: row.reference }, actorId);
  return { ...row, ...patch } as CommitmentRow;
}

/** Reads the Gmail thread of one open request and reacts to new replies from Maccabi. */
export async function checkOne(row: CommitmentRow, actorId: string | null = null) {
  const db = getSupabaseAdmin();
  const result: { id: string; reference: string; action: string; verdict?: string; reason?: string } = { id: row.id, reference: row.reference, action: 'no_change' };
  if (!row.gmail_thread_id) { await db.from(TABLE).update({ last_checked_at: new Date().toISOString(), ...touch() }).eq('id', row.id); return { ...result, action: 'no_thread' }; }
  const msgs = await threadMessages(row.gmail_thread_id);
  const replies = msgs.filter((m) => !m.isOurs);
  const patch: Record<string, unknown> = { last_checked_at: new Date().toISOString(), reply_count: replies.length, ...touch() };
  const fresh = replies.filter((m) => !row.last_reply_at || m.date.getTime() > new Date(row.last_reply_at).getTime() + 1000);
  if (fresh.length) {
    const latest = fresh[fresh.length - 1];
    // Strip quoted text of our own message before classification.
    const body = latest.text.split(/\n(?:>|On .* wrote:|בתאריך .* כתב)/)[0].slice(0, 4000);
    const cls = await classifyReply(body);
    Object.assign(patch, { last_reply_at: latest.date.toISOString(), last_reply_snippet: body.slice(0, 500) });
    result.verdict = cls.verdict; result.reason = cls.reason;
    if (cls.verdict === 'ready') {
      await db.from(TABLE).update(patch).eq('id', row.id);
      const r = await markReady({ ...row, ...patch } as CommitmentRow, 'email', actorId);
      await audit('maccabi_commitment_reply_classified', row.id, { reference: row.reference, verdict: cls.verdict, reason: cls.reason, model: cls.model, from: latest.from }, actorId);
      return { ...result, action: r.whatsapp.ok ? 'ready_notified' : 'ready_notify_failed' };
    }
    patch.status = cls.verdict === 'rejected' ? 'rejected' : 'reply_received';
    await audit('maccabi_commitment_reply_classified', row.id, { reference: row.reference, verdict: cls.verdict, reason: cls.reason, model: cls.model, from: latest.from }, actorId);
    result.action = `reply_${cls.verdict}`;
  }
  await db.from(TABLE).update(patch).eq('id', row.id);
  return result;
}

/** Daily job: read replies for every open request, then remind Maccabi when 3 business days passed without an answer. */
export async function runDailyCheck(opts: { remind?: boolean; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const db = getSupabaseAdmin();
  const access = await readAccess();
  const { data } = await db.from(TABLE).select('*').in('status', OPEN_STATUSES).order('sent_at');
  const rows = (data ?? []) as CommitmentRow[];
  const out: { checked: number; mail_access: string; results: unknown[]; reminders: string[]; errors: string[] } = { checked: rows.length, mail_access: access, results: [], reminders: [], errors: [] };
  for (const row of rows) {
    let current = row;
    if (access === 'ok') {
      try { const r = await checkOne(row); out.results.push(r); if (r.action.startsWith('ready')) continue; if (r.action.startsWith('reply')) current = { ...row, status: 'reply_received' } as CommitmentRow; }
      catch (e) { out.errors.push(`${row.reference}: ${e instanceof Error ? e.message : 'check_failed'}`); }
    }
    // Reminders only while Maccabi has not replied at all; after a reply the staff decide.
    if ((opts.remind ?? true) && isBusinessDay(now) && (current.status === 'sent' || current.status === 'reminded') && current.reminders_count < 3) {
      const since = new Date(current.last_reminder_at ?? current.sent_at);
      if (businessDaysBetween(since, now) >= REMINDER_AFTER_BUSINESS_DAYS) {
        try { await sendReminder(current, null); out.reminders.push(current.reference); }
        catch (e) { out.errors.push(`${row.reference}: reminder ${e instanceof Error ? e.message : 'failed'}`); }
      }
    }
  }
  return out;
}
