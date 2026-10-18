import { getSupabaseAdmin } from '@/lib/supabase';
import { sendInstituteWhatsAppText } from '@/lib/whatsapp-ultramsg';
import { INTAKE_LINK_TEMPLATE, sendIntakeLink } from './intake-link';

const WINDOW_H = 72;            // look back three days, so a weekend outage is still covered
const OWNER_PHONE = '+972509955137';
const last9 = (p: string | null | undefined) => (p ?? '').replace(/\D/g, '').slice(-9);
const localTime = (iso: string) => new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export type RetryReport = { checked: number; resent: { phone: string; failedAt: string; callId: string | null }[]; stillFailing: { phone: string; error: string }[]; skipped: { phone: string; why: string }[] };

/**
 * Nightly safety net: every registration link Sarah failed to send (WhatsApp/provider outage) is sent again,
 * unless the family already received one later or already opened a file. Each failure is retried once.
 */
export async function retryFailedIntakeLinks(): Promise<RetryReport> {
  const db = getSupabaseAdmin();
  const since = new Date(Date.now() - WINDOW_H * 3600e3).toISOString();
  const report: RetryReport = { checked: 0, resent: [], stillFailing: [], skipped: [] };

  const logs = await db.from('notifications').select('id,recipient_phone,status,payload,created_at').eq('template', INTAKE_LINK_TEMPLATE).gt('created_at', since).order('created_at', { ascending: true });
  const rows = logs.data ?? [];
  const sentPhones = new Map<string, string>();   // last9 → latest successful send time
  const retried = new Set<string>();              // notification ids already retried
  for (const r of rows) {
    if (r.status === 'sent') sentPhones.set(last9(r.recipient_phone), r.created_at);
    if (r.payload?.retry_of) retried.add(String(r.payload.retry_of));
  }

  // 1) Failures logged by the send route itself.
  type Cand = { key: string; phone: string; language: 'he' | 'ar'; parentName: string | null; childName: string | null; failedAt: string; retryOf: string | null; callId: string | null };
  const cands: Cand[] = [];
  for (const r of rows) {
    if (r.status !== 'failed' || retried.has(String(r.id))) continue;
    cands.push({ key: last9(r.recipient_phone), phone: r.recipient_phone, language: r.payload?.language === 'ar' ? 'ar' : 'he', parentName: r.payload?.parent_name ?? null, childName: r.payload?.child_name ?? null, failedAt: r.created_at, retryOf: String(r.id), callId: r.payload?.call_id ?? null });
  }
  // 2) Calls where Sarah tried to send a link but no successful send was logged (e.g. the request never reached the server).
  const calls = await db.from('voice_calls').select('id,caller_phone,caller_name,child_name,language_used,outcome,call_started_at,raw_summary,agent_tool_calls').gt('call_started_at', since).neq('outcome', 'intake_sent').limit(500);
  for (const c of calls.data ?? []) {
    if (!JSON.stringify(c.agent_tool_calls ?? '').includes('send_intake_link')) continue;
    if ((c.raw_summary as any)?.staff_followup?.action === 'intake_link_resent') continue;
    const key = last9(c.caller_phone);
    if (!key || cands.some(x => x.key === key)) continue;
    const anyLog = rows.some(r => last9(r.recipient_phone) === key && r.created_at > c.call_started_at);
    if (anyLog) continue; // the route handled it (sent or failed → already covered above)
    cands.push({ key, phone: c.caller_phone, language: c.language_used === 'ar' ? 'ar' : 'he', parentName: c.caller_name ?? null, childName: c.child_name ?? null, failedAt: c.call_started_at, retryOf: null, callId: c.id });
  }
  report.checked = cands.length;

  // Exclusions: already received a link later, or already opened a file.
  const seen = new Set<string>();
  for (const c of cands) {
    if (seen.has(c.key)) { report.skipped.push({ phone: c.phone, why: 'duplicate' }); continue; }
    seen.add(c.key);
    const later = sentPhones.get(c.key);
    if (later && later > c.failedAt) { report.skipped.push({ phone: c.phone, why: 'sent_later' }); continue; }
    const reg = await db.from('parents').select('id').ilike('phone', `%${c.key}`).limit(1);
    if ((reg.data ?? []).length) { report.skipped.push({ phone: c.phone, why: 'registered' }); continue; }
    if (!/^\+9725\d{8}$/.test(c.phone)) { report.skipped.push({ phone: c.phone, why: 'not_mobile' }); continue; }

    const r = await sendIntakeLink({ phone: c.phone, language: c.language, parentName: c.parentName, childName: c.childName, reason: 'retry_after_failure', source: 'retry', retryOf: c.retryOf, callId: c.callId });
    if (r.ok) {
      report.resent.push({ phone: c.phone, failedAt: c.failedAt, callId: c.callId });
      if (c.callId) await db.from('voice_calls').update({ outcome: 'intake_sent', next_action: `הקישור נשלח מחדש אוטומטית ב-${localTime(new Date().toISOString())} אחרי כשל שליחה` }).eq('id', c.callId).neq('outcome', 'intake_sent').then(() => null, () => null);
    } else report.stillFailing.push({ phone: c.phone, error: r.error });
  }

  await db.from('audit_log').insert({ actor_type: 'system', action: 'intake_link_retry', entity_type: 'voice_calls', metadata: { checked: report.checked, resent: report.resent.length, still_failing: report.stillFailing.length, skipped: report.skipped.map(s => s.why), at: new Date().toISOString() } }).then(() => null, () => null);

  if (report.resent.length || report.stillFailing.length) {
    const lines = ['בדיקת קישורי הרשמה של שרה (20:00):'];
    if (report.resent.length) lines.push(`נשלחו מחדש ${report.resent.length}: ` + report.resent.map(r => `0${r.phone.slice(4)} (כשל ב-${localTime(r.failedAt)})`).join(', '));
    if (report.stillFailing.length) lines.push(`עדיין נכשלים ${report.stillFailing.length}: ` + report.stillFailing.map(r => `0${r.phone.slice(4)}`).join(', ') + ' — כדאי לבדוק את חיבור הוואטסאפ של המכון.');
    await sendInstituteWhatsAppText({ toPhone: OWNER_PHONE, body: lines.join('\n') }).catch(() => null);
  }
  return report;
}
