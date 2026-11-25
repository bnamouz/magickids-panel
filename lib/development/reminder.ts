import { getSupabaseAdmin } from '@/lib/supabase';
import { sendInstituteWhatsAppText } from '@/lib/whatsapp-ultramsg';
import { hash, token as newToken } from '@/lib/development/server';
import { developmentLink, expiryFrom, isToken, missingColumn, needsRenewal, reminderMessage, reminderTarget, REMINDER_COOLDOWN_MS, type FormRole, type ReminderLang, type Row } from '@/lib/development/followup';

export const REMINDER_ACTION = 'development_reminder_sent';
export type Reminder = { at: string; ok: boolean } | null;
export type ReminderResult =
  | { status: 'sent'; phone: string }
  | { status: 'recent'; sentAt: string }
  | { status: 'complete' | 'not_ready' | 'missing_phone' | 'closed' | 'not_found' | 'unavailable' | 'needs_update' }
  | { status: 'failed' | 'unknown'; error: string };

/** Last reminder per form, read from the audit log (the track has no notifications table of its own). */
export async function lastReminders(id: string): Promise<Record<FormRole, Reminder>> {
  const out: Record<FormRole, Reminder> = { parent: null, education: null };
  const r = await getSupabaseAdmin().from('audit_log').select('metadata,created_at').eq('action', REMINDER_ACTION).eq('entity_type', 'development_referral').eq('entity_id', id).order('created_at', { ascending: false }).limit(20);
  for (const row of r.data ?? []) {
    const m = (row.metadata ?? {}) as { role?: string; ok?: boolean; error?: string };
    const role = m.role === 'parent' || m.role === 'education' ? m.role : null;
    // An uncertain send counts as sent: the provider may have delivered it.
    if (role && !out[role]) out[role] = { at: String(row.created_at), ok: !!m.ok || m.error === 'send_uncertain' };
  }
  return out;
}

/** Makes sure the case has a link that staff can show for this form, without cancelling a link that was already handed out. */
export async function ensureLink(row: Row, role: FormRole): Promise<{ token: string; expiresAt: string } | null> {
  const db = getSupabaseAdmin(), field = role === 'parent' ? 'parent_token' : 'education_token';
  const existing = isToken(row[field]) ? row[field] : null, renew = needsRenewal(row.expires_at);
  if (existing && !renew) return { token: existing, expiresAt: row.expires_at };
  const next = existing ?? newToken(), update: Row = { ...(existing ? {} : { [field]: next }), ...(renew ? { expires_at: expiryFrom() } : {}) };
  // Older cases stored only the hash of the first link. That link keeps working; the new one is kept next to it.
  let q = db.from('development_referrals').update(update).eq('id', row.id).eq('status', row.status);
  q = existing ? q.eq(field, existing) : q.is(field, null);
  const r = await q.select('id').maybeSingle();
  if (r.error || !r.data) return null;
  return { token: next, expiresAt: (update.expires_at as string) ?? row.expires_at };
}

/** Cancels the previous link of this form and issues a new one. */
export async function rotateLink(row: Row, role: FormRole) {
  const db = getSupabaseAdmin(), t = newToken(), parent = role === 'parent';
  const update: Row = { [parent ? 'parent_hash' : 'education_hash']: hash(t), [parent ? 'parent_token' : 'education_token']: t, expires_at: expiryFrom() };
  let r = await db.from('development_referrals').update(update).eq('id', row.id).eq('status', row.status).select('id').maybeSingle();
  if (r.error && missingColumn(r.error)) { delete update[parent ? 'parent_token' : 'education_token']; r = await db.from('development_referrals').update(update).eq('id', row.id).eq('status', row.status).select('id').maybeSingle(); }
  return r.error || !r.data ? null : t;
}

/**
 * One WhatsApp reminder from the institute number to the parent or the educator, with the link that reopens the same questionnaire.
 * Once per 12 hours per form unless forced. Every attempt is written to the audit log, without the link itself.
 */
export async function sendDevelopmentReminder(o: { id: string; role: FormRole; lang: ReminderLang; staffId: string; force?: boolean }): Promise<ReminderResult> {
  const db = getSupabaseAdmin();
  const found = await db.from('development_referrals').select('*').eq('id', o.id).maybeSingle();
  if (found.error) return { status: 'unavailable' };
  const row = found.data as Row | null;
  if (!row) return { status: 'not_found' };
  if (!('parent_token' in row)) return { status: 'needs_update' };
  const target = reminderTarget(row, o.role);
  if (!target.ok) return { status: target.status };
  if (!o.force) {
    const last = (await lastReminders(o.id))[o.role];
    if (last?.ok && Date.now() - Date.parse(last.at) < REMINDER_COOLDOWN_MS) return { status: 'recent', sentAt: last.at };
  }
  const link = await ensureLink(row, o.role);
  if (!link) return { status: 'unavailable' };
  const message = reminderMessage({ role: o.role, lang: o.lang, name: target.name, child: String(row.child_name ?? ''), link: developmentLink(link.token), started: target.started, educationRole: row.education_role });
  const wa = await sendInstituteWhatsAppText({ toPhone: target.phone, body: message });
  await db.from('audit_log').insert({ actor_id: o.staffId, actor_type: 'user', action: REMINDER_ACTION, entity_type: 'development_referral', entity_id: o.id, metadata: { role: o.role, language: o.lang, ok: wa.ok, error: wa.ok ? null : wa.error ?? 'unknown', forced: !!o.force, started: target.started, sender: 'institute' } }).then(() => null, () => null);
  if (wa.ok) return { status: 'sent', phone: target.phone };
  return { status: wa.error === 'send_uncertain' ? 'unknown' : 'failed', error: wa.error ?? 'unknown' };
}
