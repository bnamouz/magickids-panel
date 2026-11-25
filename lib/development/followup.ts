import { ageTemplate, officialPages, officialSummary, validOfficialAnswers, OFFICIAL_VERSION } from './official';

/**
 * Follow-up rules of the child-development track: the same personal link can be reopened and resent,
 * staff can remind the parent or the educator, and staff can correct the case details.
 * Pure functions only; the routes do the database work.
 */
export type Row = Record<string, any>;
export type FormRole = 'parent' | 'education';
export type ReminderLang = 'he' | 'ar';

export { CONSENT_VERSION, CONSENT_TEXT } from './consent';
export const LINK_DAYS = 30;
export const REMINDER_COOLDOWN_MS = 12 * 3600_000;
export const PUBLIC_BASE = 'https://app.magickidsinstitute.com';
/** Columns added by the follow-up migration. Code must keep working while they are absent. */
export const FOLLOWUP_COLUMNS = ['parent_token', 'education_token', 'education_contact_name', 'education_phone'] as const;
export const OPEN_STATUSES = ['parent', 'education'];
export const EDITABLE_STATUSES = ['parent', 'education', 'review'];

export const isOfficial = (row: Row) => row.form_version === OFFICIAL_VERSION;
export const isToken = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export const developmentLink = (token: string, base = PUBLIC_BASE) => `${base}/development#${token}`;
export const expiryFrom = (now = Date.now()) => new Date(now + LINK_DAYS * 86400_000).toISOString();
/** A link that is sent out again should not expire within two weeks. */
export function needsRenewal(expiresAt: unknown, now = Date.now(), minDays = 14) {
  const t = Date.parse(String(expiresAt ?? ''));
  return !Number.isFinite(t) || t < now + minDays * 86400_000;
}
/** PostgREST / Postgres answer when the follow-up columns were not created yet. */
export function missingColumn(error: unknown) {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  return e.code === '42703' || e.code === 'PGRST204' || (/column|schema cache/i.test(e.message ?? '') && FOLLOWUP_COLUMNS.some(c => (e.message ?? '').includes(c)));
}
export function withoutFollowup<T extends Row>(update: T): Row {
  return Object.fromEntries(Object.entries(update).filter(([k]) => !(FOLLOWUP_COLUMNS as readonly string[]).includes(k)));
}

const asciiDigits = (raw: unknown) => String(raw ?? '').replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6f0));
/** Israeli mobile as +9725XXXXXXXX, or null. Accepts 05…, 9725…, +9725…, 009725…, spaces and dashes. */
export function mobile(raw: unknown): string | null {
  let d = asciiDigits(raw).replace(/\D/g, '');
  if (d.startsWith('00972')) d = d.slice(2);
  if (d.startsWith('972')) d = '0' + d.slice(3);
  return /^05\d{8}$/.test(d) ? '+972' + d.slice(1) : null;
}
/** Both ways the same parent phone is stored on older and newer cases. */
export const phoneForms = (e164: string) => [e164, '0' + e164.slice(4)];
export const localPhone = (raw: unknown) => { const m = mobile(raw); return m ? `0${m.slice(4, 6)}-${m.slice(6, 9)}-${m.slice(9)}` : String(raw ?? ''); };
/** First name without vowel marks, punctuation or the Arabic letter variants people type interchangeably. */
export function firstNameKey(raw: unknown) {
  const first = String(raw ?? '').trim().split(/\s+/)[0] ?? '';
  return first.normalize('NFKC').replace(/[\u0591-\u05c7\u064b-\u065f\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
}
/** A second registration with the same child continues the open case instead of opening another one. */
export function sameChild(row: Row, input: { child_name: string; birth_date: string; phone: string }) {
  const a = mobile(row.phone), b = mobile(input.phone), key = firstNameKey(input.child_name);
  return isOfficial(row) && OPEN_STATUSES.includes(row.status) && !!a && a === b && String(row.birth_date) === input.birth_date && !!key && firstNameKey(row.child_name) === key;
}

const filled = (answers: unknown) => Object.values((answers ?? {}) as Record<string, string>).filter(Boolean).length;
export const hasAnswers = (answers: unknown) => filled(answers) > 0;
export const educatorWord = (role: string) => role === 'teacher' ? 'המורה' : 'הגננת';

/** What changes when a questionnaire is completed, by the respondent or by staff on their behalf. */
export function submitPlan(row: Row, form: FormRole, answers: Record<string, string>, o: { now: string; educationToken?: string; educationHash?: string }):
  { error: string } | { update: Row } {
  const parent = form === 'parent', role = parent ? 'parent' : row.education_role;
  const fields = officialPages(row.form_template, role).flatMap(p => p.fields);
  if (filled(answers) < 3 || fields.some(f => f.required && !answers[f.id])) return { error: 'יש למלא את השאלון ואת שדות החובה המקוריים' };
  const update: Row = { [parent ? 'parent_answers' : 'education_answers']: answers, [parent ? 'parent_submitted_at' : 'education_submitted_at']: o.now };
  if (parent && row.education_role !== 'none') {
    update.status = 'education';
    if (o.educationToken && o.educationHash) { update.education_hash = o.educationHash; update.education_token = o.educationToken; }
    // The educator gets a full period from the day the parent finished.
    update.expires_at = expiryFrom(Date.parse(o.now));
  } else { update.status = 'review'; update.summary = officialSummary({ ...row, ...update }); }
  return { update };
}

export type Step = { key: string; label: string; state: 'done' | 'current' | 'todo' | 'skipped' };
/** The stages of a case and the one next action, as shown to staff. */
export function caseSteps(row: Row, hasReferral: boolean): { steps: Step[]; next: string } {
  const noSetting = row.education_role === 'none', sent = ['accepted', 'delivered'].includes(row.status), approved = sent || ['approved', 'sending'].includes(row.status);
  const parentDone = !!row.parent_submitted_at, educationDone = noSetting ? parentDone : !!row.education_submitted_at;
  const done = [true, parentDone, educationDone, hasReferral && educationDone, approved, sent];
  const labels = ['הרשמה', 'שאלון הורים', noSetting ? 'אינו במסגרת' : `שאלון ${educatorWord(row.education_role)}`, 'הפניה רפואית', 'אישור רופא', 'נשלח למכבי'];
  const keys = ['registered', 'parent', 'education', 'referral', 'approval', 'sent'];
  const current = done.findIndex(d => !d);
  const steps = keys.map((key, i): Step => ({ key, label: labels[i], state: key === 'education' && noSetting ? 'skipped' : done[i] ? 'done' : i === current ? 'current' : 'todo' }));
  const next = row.status === 'unknown' ? 'מצב השליחה אינו ידוע. יש לבדוק בתיבת הדואר הנשלח לפני ניסיון נוסף.'
    : row.status === 'bounced' || row.status === 'failed' ? 'השליחה לא הושלמה. יש לבדוק את התיק.'
    : sent ? 'התיק נשלח. ממתינים לזימון של מכבי.'
    : row.status === 'sending' ? 'השליחה מתבצעת.'
    : row.status === 'approved' ? 'התיק מאושר. אפשר לבחור נמען ולשלוח למכבי.'
    : !parentDone ? 'ממתינים לשאלון ההורים. אפשר לשלוח להורה תזכורת עם אותו קישור.'
    : !educationDone ? `ממתינים לשאלון ${educatorWord(row.education_role)}. אפשר לשלוח לה תזכורת או להעביר את הקישור להורים.`
    : !hasReferral ? 'שני השאלונים הושלמו. יש לצרף הפניה רפואית להתפתחות הילד.'
    : 'השאלונים וההפניה מוכנים. נותר לבדוק, לאשר ולשלוח למכבי.';
  return { steps, next };
}

/** Reminder text. The link returns to the same questionnaire with the answers that were already saved. */
export function reminderMessage(o: { role: FormRole; lang: ReminderLang; name: string; child: string; link: string; started: boolean; educationRole?: string }) {
  const first = o.name.trim().split(/\s+/)[0] || '', ar = o.lang === 'ar', teacher = o.educationRole === 'teacher';
  const child = o.child.trim() || (ar ? 'الطفل/ة' : 'הילד/ה');
  const hi = ar ? `مرحبًا${first ? ` ${first}` : ''}، معك سكرتارية معهد Magic Kids.` : `שלום${first ? ` ${first}` : ''}, זו המזכירות של מכון Magic Kids.`;
  const form = o.role === 'parent'
    ? (ar ? `استبيان الأهل لتطوّر الطفل بخصوص ${child}` : `שאלון ההורים להתפתחות הילד עבור ${child}`)
    : ar ? `${teacher ? 'استبيان المعلّم/ة' : 'استبيان مربّية الروضة/الحضانة'} بخصوص ${child} (بطلب من الأهل)` : `שאלון ${teacher ? 'המורה' : 'הגננת'} עבור ${child} (לבקשת ההורים)`;
  const body = ar
    ? `تذكير: ${form} لسّا ما اكتمل.${o.started ? ' الإجابات اللي عبّيتوها محفوظة، وبتقدروا تكملوا من نفس النقطة:' : ' بتقدروا تعبّوه من هون:'}\n${o.link}`
    : `תזכורת: ${form} עדיין לא הושלם.${o.started ? ' התשובות שכבר מילאתם נשמרו, ואפשר להמשיך מאותה נקודה:' : ' אפשר למלא אותו כאן:'}\n${o.link}`;
  const why = o.role === 'parent'
    ? (ar ? 'بعد ما تكتمل الاستبيانات منحوّل الطلب لمكابي عشان يحدّدوا موعد لتقييم تطوّر الطفل.' : 'לאחר השלמת השאלונים נוכל להעביר את הפנייה למכבי לזימון להערכה התפתחותית.')
    : (ar ? `تعبئة الاستبيان بتساعد نتقدّم بتقييم تطوّر ${child}.` : `מילוי השאלון מסייע לקדם את ההערכה ההתפתחותית של ${child}.`);
  return `${hi}\n${body}\n${why}\n${ar ? 'شكرًا، طاقم Magic Kids.' : 'תודה, צוות Magic Kids.'}`;
}

/** Whether a reminder makes sense for this form, and to whom. */
export function reminderTarget(row: Row, role: FormRole):
  { ok: true; phone: string; name: string; started: boolean } | { ok: false; status: 'complete' | 'not_ready' | 'closed' | 'missing_phone' } {
  if (!isOfficial(row)) return { ok: false, status: 'closed' };
  const parent = role === 'parent';
  if (parent ? row.parent_submitted_at : (row.education_submitted_at || row.education_role === 'none')) return { ok: false, status: 'complete' };
  if (!parent && !row.parent_submitted_at) return { ok: false, status: 'not_ready' };
  if (row.status !== (parent ? 'parent' : 'education')) return { ok: false, status: 'closed' };
  const phone = mobile(parent ? row.phone : row.education_phone);
  if (!phone) return { ok: false, status: 'missing_phone' };
  return { ok: true, phone, name: String((parent ? row.parent_name : row.education_contact_name) ?? ''), started: hasAnswers(parent ? row.parent_answers : row.education_answers) };
}

export type EditInput = Partial<Record<'child_name' | 'parent_name' | 'phone' | 'birth_date' | 'education_role' | 'education_contact_name' | 'education_phone', unknown>>;
/** Staff correction of the case details. Returns only what really changes, or the reason it is refused. */
export function editPlan(row: Row, input: EditInput, now = new Date()): { error: string; code: number } | { update: Row; changed: string[]; needsEducationLink: boolean } {
  const refuse = (error: string, code = 400) => ({ error, code });
  if (!EDITABLE_STATUSES.includes(row.status)) return refuse('התיק נעול. יש להחזיר אותו לעריכה לפני שינוי הפרטים.', 409);
  const update: Row = {}; let needsEducationLink = false;
  for (const key of ['child_name', 'parent_name'] as const) {
    if (input[key] === undefined) continue;
    const v = String(input[key] ?? '').trim();
    if (v.length < 2 || v.length > 100) return refuse('שם חייב להכיל בין 2 ל־100 תווים.');
    if (v !== row[key]) update[key] = v;
  }
  if (input.phone !== undefined && String(input.phone ?? '').trim() !== String(row.phone ?? '')) {
    const p = mobile(input.phone); if (!p) return refuse('נדרש מספר נייד ישראלי תקין להורה.');
    if (p !== row.phone) update.phone = p;
  }
  if (input.education_contact_name !== undefined) {
    const v = String(input.education_contact_name ?? '').trim();
    if (v.length > 100) return refuse('שם איש/אשת הקשר במסגרת ארוך מדי.');
    if ((v || null) !== (row.education_contact_name ?? null)) update.education_contact_name = v || null;
  }
  if (input.education_phone !== undefined) {
    const raw = String(input.education_phone ?? '').trim(), p = raw ? mobile(raw) : null;
    if (raw && !p) return refuse('נדרש מספר נייד ישראלי תקין לגננת/מורה, או להשאיר את השדה ריק.');
    if (p !== (row.education_phone ?? null)) update.education_phone = p;
  }
  const birth = input.birth_date === undefined ? row.birth_date : String(input.birth_date ?? ''), role = input.education_role === undefined ? row.education_role : String(input.education_role ?? '');
  const birthChanged = birth !== row.birth_date, roleChanged = role !== row.education_role;
  if ((birthChanged || roleChanged || update.child_name !== undefined) && !isOfficial(row)) return refuse('בפנייה מהמסלול הקודם אפשר לעדכן רק את פרטי הקשר.', 409);
  let template = row.form_template;
  if (birthChanged) {
    template = /^\d{4}-\d{2}-\d{2}$/.test(birth) ? ageTemplate(birth, now) : null;
    if (!template) return refuse('תאריך הלידה אינו תקין. הערכות מיועדות מלידה ועד לפני גיל שבע.');
    if (template !== row.form_template) {
      if (row.parent_submitted_at || hasAnswers(row.parent_answers) || hasAnswers(row.education_answers)) return refuse('תאריך הלידה החדש שייך לערכת שאלונים אחרת, וכבר נשמרו תשובות בערכה הנוכחית. לא ניתן לשנות.', 409);
      update.form_template = template;
    }
    update.birth_date = birth;
  }
  if (!['kindergarten', 'teacher', 'none'].includes(role)) return refuse('מסגרת לא מוכרת.');
  if (template === 'infant' && role === 'teacher') return refuse('ערכת הגיל עד שנה אינה כוללת שאלון מורה. בחרו מעון/גן או "אינו במסגרת".');
  if (roleChanged) {
    if (row.education_submitted_at) return refuse('שאלון המסגרת כבר הושלם, ולכן לא ניתן לשנות את סוג המסגרת.', 409);
    if (role !== 'none' && hasAnswers(row.education_answers) && !validOfficialAnswers(template, role, row.education_answers)) return refuse('כבר נשמרו תשובות בשאלון מסגרת מסוג אחר. לא ניתן לשנות את סוג המסגרת.', 409);
    update.education_role = role;
    if (role === 'none' && row.status === 'education') { update.status = 'review'; update.summary = officialSummary({ ...row, ...update }); }
    if (role !== 'none' && row.education_role === 'none' && row.status === 'review' && row.parent_submitted_at) { update.status = 'education'; update.summary = null; update.expires_at = expiryFrom(now.getTime()); needsEducationLink = true; }
  }
  return { update, changed: Object.keys(update), needsEducationLink };
}
