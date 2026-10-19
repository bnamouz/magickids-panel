import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendInstituteWhatsAppText } from '@/lib/whatsapp-ultramsg';
import { firstRelated } from '@/lib/intake/progress';

export type ReminderKind = 'parent' | 'teacher';
export type ReminderLang = 'he' | 'ar';
export const REMINDER_TEMPLATE = 'questionnaire_reminder';
export const REMINDER_COOLDOWN_MS = 12 * 3600_000;
const BASE = 'https://app.magickidsinstitute.com';

export function questionnaireLink(kind: ReminderKind, token: string) {
  return `${BASE}/${kind === 'parent' ? 'questionnaire/parent' : 'teacher'}/${encodeURIComponent(token)}`;
}

/** Reminder text. The link returns to the same questionnaire with the answers that were already saved. */
export function reminderMessage(o: { kind: ReminderKind; lang: ReminderLang; name: string; child: string; link: string; started: boolean }) {
  const first = o.name.trim().split(/\s+/)[0] || '';
  const hi = o.lang === 'ar' ? `مرحبًا${first ? ` ${first}` : ''}، معك سكرتارية معهد Magic Kids.` : `שלום${first ? ` ${first}` : ''}, זו המזכירות של מכון Magic Kids.`;
  const form = o.kind === 'parent'
    ? (o.lang === 'ar' ? `استبيان الأهل بخصوص ${o.child}` : `שאלון ההורים עבור ${o.child}`)
    : (o.lang === 'ar' ? `استبيان المعلّم/ة بخصوص ${o.child} (بطلب من الأهل)` : `שאלון המורה עבור ${o.child} (לבקשת ההורים)`);
  const body = o.lang === 'ar'
    ? `تذكير: ${form} لسّا ما اكتمل.${o.started ? ' الإجابات اللي عبّيتوها محفوظة، وبتقدروا تكملوا من نفس النقطة:' : ' بتقدروا تعبّوه من هون:'}\n${o.link}`
    : `תזכורת: ${form} עדיין לא הושלם.${o.started ? ' התשובות שכבר מילאתם נשמרו, ואפשר להמשיך מאותה נקודה:' : ' אפשר למלא אותו כאן:'}\n${o.link}`;
  const why = o.kind === 'parent'
    ? (o.lang === 'ar' ? 'بدون الاستبيانات ما منقدر نحدّد موعد التشخيص.' : 'ללא השאלונים לא ניתן לקבוע את מועד האבחון.')
    : (o.lang === 'ar' ? 'الاستبيان بياخد حوالي 10 دقايق وبيساعد بالتشخيص.' : 'מילוי השאלון אורך כ־10 דקות ומסייע לאבחון.');
  const bye = o.lang === 'ar' ? 'شكرًا، طاقم Magic Kids.' : 'תודה, צוות Magic Kids.';
  return `${hi}\n${body}\n${why}\n${bye}`;
}

function normalizePhone(value: string | null | undefined) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const n = digits.startsWith('0') ? `+972${digits.slice(1)}` : `+${digits}`;
  return /^\+[1-9]\d{6,14}$/.test(n) ? n : null;
}

export async function lastReminders(sessionId: string) {
  const db = getSupabaseAdmin();
  const r = await db.from('notifications').select('payload,sent_at,status,created_at').eq('template', REMINDER_TEMPLATE).eq('session_id', sessionId).order('created_at', { ascending: false }).limit(20);
  const out: Record<ReminderKind, { at: string; status: string } | null> = { parent: null, teacher: null };
  for (const row of r.data ?? []) {
    const kind = (row.payload as any)?.kind as ReminderKind;
    if ((kind === 'parent' || kind === 'teacher') && !out[kind]) out[kind] = { at: row.sent_at ?? row.created_at, status: String(row.status) };
  }
  return out;
}

export type ReminderResult =
  | { status: 'sent'; phone: string; link: string }
  | { status: 'recent'; sentAt: string }
  | { status: 'complete' | 'missing_phone' | 'closed' | 'not_found' | 'unavailable' }
  | { status: 'failed' | 'unknown'; error: string };

/** Sends one WhatsApp reminder from the institute number to the parent or teacher, with the link that resumes the same questionnaire.
 *  Once per 12 hours per form unless forced. Renews an expired link. Every attempt is logged in `notifications`. */
export async function sendQuestionnaireReminder(o: { sessionId: string; kind: ReminderKind; lang: ReminderLang; staffId: string; force?: boolean }): Promise<ReminderResult> {
  const db = getSupabaseAdmin();
  const s = await db.from('intake_sessions').select('id,status,parent_token,teacher_token,parent_token_expires_at,teacher_token_expires_at,teacher_name,teacher_phone,closed_at,patients(first_name),parents(full_name,phone,is_primary_contact)').eq('id', o.sessionId).maybeSingle();
  if (s.error) return { status: 'unavailable' };
  if (!s.data) return { status: 'not_found' };
  const session = s.data as any;
  if (session.closed_at) return { status: 'closed' };
  const type = o.kind === 'parent' ? 'vanderbilt_parent' : 'vanderbilt_teacher';
  const q = await db.from('questionnaires').select('is_complete,submitted_at,started_at,responses').eq('session_id', o.sessionId).eq('type', type).maybeSingle();
  if (q.error) return { status: 'unavailable' };
  if (q.data?.is_complete || q.data?.submitted_at) return { status: 'complete' };
  const started = !!q.data?.started_at || Object.keys((q.data?.responses as object) ?? {}).length > 0;

  const parents = Array.isArray(session.parents) ? session.parents : [session.parents].filter(Boolean);
  const parent = parents.find((p: any) => p?.is_primary_contact) ?? firstRelated<any>(session.parents);
  const phone = normalizePhone(o.kind === 'parent' ? parent?.phone : session.teacher_phone);
  if (!phone) return { status: 'missing_phone' };
  const name = o.kind === 'parent' ? String(parent?.full_name ?? '') : String(session.teacher_name ?? '');
  const child = String(firstRelated<any>(session.patients)?.first_name ?? '').trim() || (o.lang === 'ar' ? 'الولد/البنت' : 'הילד/ה');

  if (!o.force) {
    const last = (await lastReminders(o.sessionId))[o.kind];
    if (last && last.status === 'sent' && Date.now() - Date.parse(last.at) < REMINDER_COOLDOWN_MS) return { status: 'recent', sentAt: last.at };
  }

  // Same link as the "copy link" button; renew it if missing or expired so the recipient never lands on an expired page.
  const field = o.kind === 'parent' ? 'parent_token' : 'teacher_token', expiry = o.kind === 'parent' ? 'parent_token_expires_at' : 'teacher_token_expires_at';
  let token: string | null = session[field];
  const exp = session[expiry];
  if (!token || (exp && (!Number.isFinite(Date.parse(exp)) || Date.parse(exp) <= Date.now()))) {
    const nextToken = token || randomUUID(), nextExpiry = new Date(Date.now() + 30 * 86400000).toISOString();
    let u = db.from('intake_sessions').update({ [field]: nextToken, [expiry]: nextExpiry }).eq('id', o.sessionId);
    u = token ? u.eq(field, token) : u.is(field, null);
    const r = await u.select('id').maybeSingle();
    if (r.error || !r.data) return { status: 'unavailable' };
    token = nextToken;
  }
  const link = questionnaireLink(o.kind, token!);
  const message = reminderMessage({ kind: o.kind, lang: o.lang, name, child, link, started });
  const wa = await sendInstituteWhatsAppText({ toPhone: phone, body: message });
  const now = new Date().toISOString();
  await db.from('notifications').insert({
    session_id: o.sessionId, recipient_type: o.kind, recipient_phone: phone, channel: 'whatsapp', template: REMINDER_TEMPLATE,
    payload: { kind: o.kind, language: o.lang, staff_id: o.staffId, started, link, forced: !!o.force, sender: 'institute' },
    scheduled_for: now, sent_at: wa.ok ? now : null, status: wa.ok ? 'sent' : 'failed', delivery_id: wa.ok ? wa.id ?? null : null, error_message: wa.ok ? null : wa.error ?? 'unknown', retry_count: 0,
  }).then(() => null, () => null);
  await db.from('audit_log').insert({ actor_id: o.staffId, actor_type: 'staff', action: 'questionnaire_reminder_sent', entity_type: 'intake_session', entity_id: o.sessionId, metadata: { kind: o.kind, language: o.lang, ok: wa.ok, error: wa.ok ? null : wa.error ?? 'unknown' } }).then(() => null, () => null);
  if (o.kind === 'teacher' && wa.ok) await db.from('intake_sessions').update({ teacher_link_sent_at: now }).eq('id', o.sessionId).then(() => null, () => null);
  if (wa.ok) return { status: 'sent', phone, link };
  return { status: wa.error === 'send_uncertain' ? 'unknown' : 'failed', error: wa.error ?? 'unknown' };
}
