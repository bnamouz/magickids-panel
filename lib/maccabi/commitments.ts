import { randomUUID } from 'crypto';
import { sender } from '@/lib/therapists/mail';
import { buildRawMessage, type MailAttachment } from '@/lib/maccabi/send-files';

export { MACCABI_BRANCH_EMAIL, REMINDER_AFTER_BUSINESS_DAYS, SERVICES, STATUS_LABEL, OPEN_STATUSES, type CommitmentStatus } from '@/lib/maccabi/commitment-shared';
import { MACCABI_BRANCH_EMAIL } from '@/lib/maccabi/commitment-shared';
export const CLINIC_PHONE = '054-349-6656';
export const CLINIC_ADDRESS = 'תופיק זיאד 21, שפרעם';

export function newReference(now = new Date()) {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: '2-digit', month: '2-digit', day: '2-digit' }).format(now).replace(/-/g, '');
  return `MK-${d}-${randomUUID().slice(0, 4).toUpperCase()}`;
}

export const fmtDate = (d: string | Date | null | undefined) => d ? new Date(d).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }) : null;

export type CommitmentInput = { reference: string; patientName: string; nationalId: string; birthDate?: string | null; phone: string; service: string; note?: string | null; staffName?: string | null; attachments?: string[] };

export function requestSubject(i: Pick<CommitmentInput, 'reference' | 'patientName' | 'nationalId' | 'service'>) {
  return `בקשה להתחייבות – ${i.patientName} ת.ז. ${i.nationalId} – ${i.service} [${i.reference}]`;
}

export function requestBody(i: CommitmentInput) {
  const lines = ['שלום רב,', '', `נבקש להנפיק התחייבות (טופס 17) עבור המטופל/ת הבא/ה, בעקבות הפניית ד״ר בסים נמוז:`, '',
    `שם: ${i.patientName}`, `ת.ז.: ${i.nationalId}`, ...(i.birthDate ? [`תאריך לידה: ${fmtDate(i.birthDate)}`] : []), `טלפון ההורה: ${i.phone}`, `השירות המבוקש: ${i.service}`,
    ...(i.note?.trim() ? ['', 'פרטים נוספים:', i.note.trim()] : []),
    ...(i.attachments?.length ? ['', 'מסמכים מצורפים:', ...i.attachments.map((f, k) => `${k + 1}. ${f}`)] : []),
    '', 'נודה לעדכון במייל זה כשההתחייבות מוכנה במערכת, ונעדכן את המשפחה.', `מספר אסמכתא לבקשה: ${i.reference}`, '',
    'בברכה,', i.staffName ? `${i.staffName} · מזכירות מרפאת הילדים` : 'מזכירות מרפאת הילדים', `ד״ר בסים נמוז – רופא ילדים · ${CLINIC_ADDRESS}`, `טלפון ${CLINIC_PHONE} · ${sender}`];
  return lines.join('\n');
}

export function reminderBody(i: Pick<CommitmentInput, 'reference' | 'patientName' | 'nationalId' | 'service'> & { sentAt: Date; nth: number }) {
  return ['שלום רב,', '', `תזכורת${i.nth > 1 ? ` (${i.nth})` : ''} לבקשת ההתחייבות שנשלחה ב־${fmtDate(i.sentAt)} עבור ${i.patientName}, ת.ז. ${i.nationalId}, לשירות: ${i.service}.`,
    'נודה לעדכון על סטטוס הבקשה במייל זה.', `מספר אסמכתא: ${i.reference}`, '', 'בברכה,', 'מזכירות מרפאת הילדים – ד״ר בסים נמוז', `טלפון ${CLINIC_PHONE}`].join('\n');
}

export function readyWhatsApp(i: { patientName: string; service: string; lang?: 'he' | 'ar' }) {
  if (i.lang === 'ar') return `مرحبًا، معكم عيادة الأطفال – د. بسيم نموز.\nالتعهد المالي (טופס 17) من مكابي لـ${i.patientName} (${i.service}) أصبح جاهزًا في نظام مكابي.\nيمكنكم التوجه إلينا أو حجز موعد: ${CLINIC_PHONE}\n${CLINIC_ADDRESS}`;
  return `שלום, כאן מרפאת הילדים של ד״ר בסים נמוז.\nההתחייבות ממכבי (טופס 17) עבור ${i.patientName} (${i.service}) מוכנה במערכת של מכבי.\nאפשר להגיע אלינו או לקבוע תור: ${CLINIC_PHONE}\n${CLINIC_ADDRESS}`;
}

/** Message-ID header value for a request/reminder, keeps all mails in one Gmail thread. */
export const rfcId = (messageId: string) => `${messageId.replace(/[^a-zA-Z0-9-]/g, '-')}@magickidsinstitute.com`;

export function buildRequestRaw(i: CommitmentInput, attachments: MailAttachment[], to = MACCABI_BRANCH_EMAIL) {
  return buildRawMessage({ to, subject: requestSubject(i), text: requestBody({ ...i, attachments: attachments.map((a) => a.filename) }), attachments, messageId: i.reference });
}

export function buildReminderRaw(i: Pick<CommitmentInput, 'reference' | 'patientName' | 'nationalId' | 'service'> & { sentAt: Date; nth: number; to?: string }) {
  const raw = buildRawMessage({ to: i.to ?? MACCABI_BRANCH_EMAIL, subject: `Re: ${requestSubject(i)}`, text: reminderBody(i), attachments: [], messageId: `${i.reference}-r${i.nth}` });
  const orig = rfcId(i.reference);
  return raw.replace('MIME-Version: 1.0', `In-Reply-To: <${orig}>\r\nReferences: <${orig}>\r\nMIME-Version: 1.0`);
}

/** Israel business days: Sunday–Thursday. */
export function businessDaysBetween(from: Date, to: Date) {
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(d);
  const wd = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short' }).format(d);
  let n = 0; const cur = new Date(from);
  while (day(cur) < day(to)) { cur.setUTCDate(cur.getUTCDate() + 1); if (!['Fri', 'Sat'].includes(wd(cur))) n++; }
  return n;
}
export const isBusinessDay = (d = new Date()) => !['Fri', 'Sat'].includes(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short' }).format(d));

export type Verdict = 'ready' | 'rejected' | 'pending' | 'unclear';

/** Keyword classifier for a Maccabi reply (fallback when the language model is unavailable). */
export function classifyByKeywords(text: string): Verdict {
  const t = text.replace(/\s+/g, ' ');
  const neg = /(לא (ניתן|מאושר|אושר)|נדח(ה|תה)|חסר(ה|ים)?|אין (כיסוי|זכאות)|לא זכאי|דרוש(ה)? (הפניה|אישור)|נא (לצרף|להעביר|להשלים)|يرجى (إرفاق|استكمال)|مرفوض|غير مصادق|ناقص)/i;
  const pos = /(התחייבות (מאושרת|אושרה|הונפקה|הופקה|מוכנה|קיימת|נמצאת|הוזנה)|אושר(ה)? (ההתחייבות|הבקשה)|טופס 17 (מוכן|הונפק|הופק|מאושר)|הונפק(ה)? (טופס|התחייבות)|ההתחייבות במערכת|מוכנ(ה|ים) במערכת|נקלט(ה)? במערכת|תם التعهد|التعهد جاهز|تمت الموافقة)/i;
  if (neg.test(t) && !pos.test(t)) return 'rejected';
  if (pos.test(t)) return 'ready';
  if (/(בטיפול|נבדק|הועבר ל|נחזור|ממתין|قيد المعالجة)/i.test(t)) return 'pending';
  return 'unclear';
}

/** Language-model classification with the keyword classifier as a cross-check; auto-notify only when both agree on 'ready'. */
export async function classifyReply(text: string, fetchImpl: typeof fetch = fetch): Promise<{ verdict: Verdict; reason: string; model: boolean }> {
  const kw = classifyByKeywords(text);
  const key = process.env.OPENAI_API_KEY;
  if (!key || !text.trim()) return { verdict: kw, reason: 'keywords', model: false };
  try {
    const r = await fetchImpl('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0, response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: 'You classify replies from an Israeli health fund (Maccabi) to a clinic that requested a financial commitment (התחייבות / טופס 17) for a patient. Return JSON {"verdict":"ready"|"rejected"|"pending"|"unclear","reason":"short Hebrew"}. "ready" ONLY if the reply clearly states the commitment was issued/approved/is available in the system. "rejected" if refused or documents are missing. "pending" if being handled. Otherwise "unclear". Ignore quoted text of our own earlier email.' },
        { role: 'user', content: text.slice(0, 6000) }] }) });
    const d = await r.json();
    const parsed = JSON.parse(d.choices?.[0]?.message?.content ?? '{}');
    const v: Verdict = ['ready', 'rejected', 'pending', 'unclear'].includes(parsed.verdict) ? parsed.verdict : 'unclear';
    if (v === 'ready' && kw === 'rejected') return { verdict: 'unclear', reason: 'מודל וסימני מפתח לא מסכימים', model: true };
    return { verdict: v, reason: String(parsed.reason ?? ''), model: true };
  } catch { return { verdict: kw, reason: 'keywords (model unavailable)', model: false }; }
}
