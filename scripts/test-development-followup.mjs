// Child-development follow-up: reopening the same link, reminders, staff edits and the additive migration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
const require = createRequire(import.meta.url);
function load(file, mocks = {}, patch = s => s) {
  const code = ts.transpileModule(patch(fs.readFileSync(file, 'utf8')), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const m = { exports: {} }; new Function('require', 'module', 'exports', code)(n => mocks[n] ?? require(n), m, m.exports); return m.exports;
}
const catalog = JSON.parse(fs.readFileSync('public/development-original/catalog.json', 'utf8'));
const official = load('lib/development/official.ts', {}, s => s.replace("import raw from '@/public/development-original/catalog.json';", 'const raw=' + JSON.stringify(catalog) + ';'));
const consent = load('lib/development/consent.ts');
const f = load('lib/development/followup.ts', { './official': official, './consent': consent });
const V = official.OFFICIAL_VERSION, NOW = new Date('2026-11-25T10:00:00Z');
const fields = role => official.officialPages('child', role).flatMap(p => p.fields).filter(x => x.type === 'text');
const some = (role, n = 4) => Object.fromEntries(fields(role).slice(0, n).map((x, i) => [x.id, 'תשובה ' + i]));
const row = o => ({ id: 'r1', child_name: 'עלי לדוגמה', parent_name: 'סמיר לדוגמה', phone: '+972500000001', birth_date: '2022-03-10', education_role: 'kindergarten', form_version: V, form_template: 'child', status: 'parent',
  parent_answers: {}, education_answers: {}, parent_submitted_at: null, education_submitted_at: null, expires_at: '2026-12-20T00:00:00Z', parent_token: null, education_token: null, education_contact_name: null, education_phone: null, summary: null, ...o });

test('phones: one mobile in every way it is typed or stored', () => {
  for (const v of ['0500000001', '050-000 0001', '+972500000001', '972500000001', '00972500000001', '٠٥٠٠٠٠٠٠٠١']) assert.equal(f.mobile(v), '+972500000001', v);
  for (const v of ['', '049861234', '05000000', '+15550001111', null]) assert.equal(f.mobile(v), null);
  assert.deepEqual(f.phoneForms('+972500000001'), ['+972500000001', '0500000001']);
  assert.equal(f.localPhone('+972544020043'), '054-402-0043');
});

test('a second registration continues the open case only when phone, birth date and first name all agree', () => {
  const input = { child_name: 'עַלִי', birth_date: '2022-03-10', phone: '+972500000001' };
  assert.equal(f.sameChild(row(), input), true);
  assert.equal(f.sameChild(row({ phone: '0500000001', child_name: 'עלי נמוז' }), input), true, 'older cases keep the local form and a full name');
  assert.equal(f.sameChild(row({ status: 'education', parent_submitted_at: 'x' }), input), true);
  assert.equal(f.sameChild(row(), { ...input, child_name: 'עומר' }), false, 'a twin is another child');
  assert.equal(f.sameChild(row(), { ...input, birth_date: '2022-03-11' }), false);
  assert.equal(f.sameChild(row(), { ...input, phone: '+972500000009' }), false);
  for (const status of ['review', 'approved', 'accepted', 'unknown']) assert.equal(f.sameChild(row({ status }), input), false, status);
  assert.equal(f.sameChild(row({ form_version: null }), input), false, 'the earlier track is never continued');
});

test('links: renewal window and missing-column detection', () => {
  const now = Date.parse('2026-11-25T10:00:00Z');
  assert.equal(f.needsRenewal('2026-12-20T00:00:00Z', now), false);
  assert.equal(f.needsRenewal('2026-12-01T00:00:00Z', now), true);
  assert.equal(f.needsRenewal('2026-10-01T00:00:00Z', now), true);
  assert.equal(f.needsRenewal(null, now), true);
  assert.equal(f.expiryFrom(now), '2026-12-25T10:00:00.000Z');
  assert.equal(f.developmentLink('a'.repeat(64)), 'https://app.magickidsinstitute.com/development#' + 'a'.repeat(64));
  assert.equal(f.missingColumn({ code: '42703', message: 'column development_referrals.parent_token does not exist' }), true);
  assert.equal(f.missingColumn({ code: 'PGRST204', message: "Could not find the 'education_token' column of 'development_referrals' in the schema cache" }), true);
  assert.equal(f.missingColumn({ code: '23505', message: 'duplicate key' }), false);
  assert.equal(f.missingColumn(null), false);
  assert.deepEqual(f.withoutFollowup({ status: 'education', education_token: 't', education_hash: 'h', parent_token: 'p', education_phone: '1', education_contact_name: 'n' }), { status: 'education', education_hash: 'h' });
});

test('completing the parent questionnaire opens the educator link and gives it a full period', () => {
  const plan = f.submitPlan(row(), 'parent', some('parent'), { now: NOW.toISOString(), educationToken: 'e'.repeat(64), educationHash: 'hash-e' });
  assert.equal(plan.update.status, 'education'); assert.equal(plan.update.education_token, 'e'.repeat(64)); assert.equal(plan.update.education_hash, 'hash-e');
  assert.equal(plan.update.parent_submitted_at, NOW.toISOString()); assert.equal(plan.update.expires_at, '2026-12-25T10:00:00.000Z'); assert.equal('summary' in plan.update, false);
  assert.match(f.submitPlan(row(), 'parent', some('parent', 2), { now: NOW.toISOString() }).error, /יש למלא/);
});

test('a child with no setting, and a completed educator questionnaire, go to the doctor with a summary', () => {
  const none = f.submitPlan(row({ education_role: 'none' }), 'parent', some('parent'), { now: NOW.toISOString() });
  assert.equal(none.update.status, 'review'); assert.match(none.update.summary, /אינו במסגרת חינוכית/); assert.equal('education_token' in none.update, false);
  const edu = f.submitPlan(row({ status: 'education', parent_submitted_at: 'x', parent_answers: some('parent') }), 'education', some('kindergarten'), { now: NOW.toISOString() });
  assert.equal(edu.update.status, 'review'); assert.match(edu.update.summary, /דיווח הורים[\s\S]*דיווח גננת/); assert.equal(edu.update.education_submitted_at, NOW.toISOString());
});

test('stages: one current stage and one next action at every point', () => {
  const at = (o, referral = false) => { const r = f.caseSteps(row(o), referral); return [r.steps.map(s => s.state[0]).join(''), r.next]; };
  let [s, next] = at({}); assert.equal(s, 'dctttt'); assert.match(next, /שאלון ההורים/); assert.equal(s.split('c').length - 1, 1);
  [s, next] = at({ status: 'education', parent_submitted_at: 'x' }); assert.equal(s, 'ddcttt'); assert.match(next, /שאלון הגננת/);
  [s, next] = at({ status: 'education', parent_submitted_at: 'x', education_role: 'teacher' }); assert.match(next, /שאלון המורה/);
  [s, next] = at({ status: 'review', parent_submitted_at: 'x', education_submitted_at: 'y' }); assert.equal(s, 'dddctt'); assert.match(next, /לצרף הפניה רפואית/);
  [s, next] = at({ status: 'review', parent_submitted_at: 'x', education_submitted_at: 'y' }, true); assert.equal(s, 'ddddct'); assert.match(next, /לאשר ולשלוח למכבי/);
  [s, next] = at({ status: 'approved', parent_submitted_at: 'x', education_submitted_at: 'y' }, true); assert.equal(s, 'dddddc'); assert.match(next, /לשלוח למכבי/);
  [s, next] = at({ status: 'accepted', parent_submitted_at: 'x', education_submitted_at: 'y' }, true); assert.equal(s, 'dddddd'); assert.match(next, /נשלח/);
  [s, next] = at({ status: 'review', parent_submitted_at: 'x', education_role: 'none' }); assert.equal(s, 'ddsctt'); assert.match(next, /הפניה רפואית/);
  // A referral uploaded early does not jump ahead of the questionnaires.
  [s] = at({}, true); assert.equal(s, 'dctttt');
  [, next] = at({ status: 'unknown', parent_submitted_at: 'x', education_submitted_at: 'y' }, true); assert.match(next, /אינו ידוע/);
});

test('reminder wording: Hebrew and Arabic, parent and educator, with the same link', () => {
  const link = 'https://app.magickidsinstitute.com/development#' + 'a'.repeat(64);
  for (const role of ['parent', 'education']) for (const lang of ['he', 'ar']) for (const started of [true, false]) for (const educationRole of ['kindergarten', 'teacher']) {
    const m = f.reminderMessage({ role, lang, name: 'רים לדוגמה', child: 'נור', link, started, educationRole });
    assert.ok(m.includes(link) && m.includes('נור') && m.includes('רים') && !m.includes('לדוגמה') && m.includes('Magic Kids'));
    assert.doesNotMatch(m, /undefined|null|\$\{/); assert.equal(m.split('\n').length, 5);
    assert.equal(/[\u0590-\u05ff]/.test(m.replace(/רים|נור/g, '')), lang === 'he'); assert.equal(/[\u0621-\u064a]/.test(m), lang === 'ar');
  }
  const he = f.reminderMessage({ role: 'parent', lang: 'he', name: 'רים', child: 'נור', link, started: true });
  assert.equal(he, `שלום רים, זו המזכירות של מכון Magic Kids.\nתזכורת: שאלון ההורים להתפתחות הילד עבור נור עדיין לא הושלם. התשובות שכבר מילאתם נשמרו, ואפשר להמשיך מאותה נקודה:\n${link}\nלאחר השלמת השאלונים נוכל להעביר את הפנייה למכבי לזימון להערכה התפתחותית.\nתודה, צוות Magic Kids.`);
  assert.match(f.reminderMessage({ role: 'education', lang: 'he', name: '', child: 'נור', link, started: false, educationRole: 'kindergarten' }), /^שלום, זו המזכירות[\s\S]*שאלון הגננת עבור נור \(לבקשת ההורים\) עדיין לא הושלם\. אפשר למלא אותו כאן:/);
  assert.match(f.reminderMessage({ role: 'education', lang: 'he', name: '', child: 'נור', link, started: false, educationRole: 'teacher' }), /שאלון המורה עבור נור/);
});

test('a reminder goes only to whoever still has to fill a questionnaire, and only with a mobile', () => {
  assert.deepEqual(f.reminderTarget(row({ parent_answers: some('parent', 1) }), 'parent'), { ok: true, phone: '+972500000001', name: 'סמיר לדוגמה', started: true });
  assert.equal(f.reminderTarget(row({ phone: '0500000001' }), 'parent').phone, '+972500000001');
  assert.equal(f.reminderTarget(row({ phone: '049861234' }), 'parent').status, 'missing_phone');
  assert.equal(f.reminderTarget(row(), 'education').status, 'not_ready');
  const waiting = row({ status: 'education', parent_submitted_at: 'x' });
  assert.equal(f.reminderTarget(waiting, 'parent').status, 'complete');
  assert.equal(f.reminderTarget(waiting, 'education').status, 'missing_phone');
  assert.deepEqual(f.reminderTarget({ ...waiting, education_phone: '+972500000022', education_contact_name: 'סוהא' }, 'education'), { ok: true, phone: '+972500000022', name: 'סוהא', started: false });
  assert.equal(f.reminderTarget(row({ status: 'review', parent_submitted_at: 'x', education_submitted_at: 'y' }), 'education').status, 'complete');
  assert.equal(f.reminderTarget(row({ status: 'education', parent_submitted_at: 'x', education_role: 'none' }), 'education').status, 'complete');
  assert.equal(f.reminderTarget(row({ status: 'uploading' }), 'parent').status, 'closed');
  assert.equal(f.reminderTarget(row({ form_version: null }), 'parent').status, 'closed');
});

test('staff edit: contact details, with the phone stored in one form', () => {
  const p = f.editPlan(row(), { parent_name: ' סמיר נמוז ', phone: '050-000 0009', child_name: 'עלי לדוגמה', birth_date: '2022-03-10', education_role: 'kindergarten', education_contact_name: 'סוהא', education_phone: '0500000022' }, NOW);
  assert.deepEqual(p.update, { parent_name: 'סמיר נמוז', phone: '+972500000009', education_contact_name: 'סוהא', education_phone: '+972500000022' });
  assert.deepEqual(f.editPlan(row(), { parent_name: 'סמיר לדוגמה', phone: '+972500000001' }, NOW).changed, [], 'nothing typed, nothing written');
  assert.equal(f.editPlan(row({ phone: '049861234' }), { phone: '049861234', parent_name: 'אבא חדש' }, NOW).update.phone, undefined, 'an old landline is left alone when untouched');
  assert.match(f.editPlan(row(), { phone: '049861234' }, NOW).error, /נייד ישראלי/);
  assert.match(f.editPlan(row(), { education_phone: '123' }, NOW).error, /גננת\/מורה/);
  assert.equal(f.editPlan(row({ education_phone: '+972500000022' }), { education_phone: '' }, NOW).update.education_phone, null);
  assert.match(f.editPlan(row(), { child_name: 'ע' }, NOW).error, /בין 2/);
  for (const status of ['uploading', 'approved', 'sending', 'accepted', 'unknown']) assert.equal(f.editPlan(row({ status }), { parent_name: 'אחר לגמרי' }, NOW).code, 409, status);
});

test('staff edit: birth date may change the age kit only before any answer was saved', () => {
  assert.deepEqual(f.editPlan(row(), { birth_date: '2021-01-05' }, NOW).update, { birth_date: '2021-01-05' });
  assert.deepEqual(f.editPlan(row(), { birth_date: '2026-06-01' }, NOW).update, { form_template: 'infant', birth_date: '2026-06-01' });
  assert.equal(f.editPlan(row({ parent_answers: some('parent', 1) }), { birth_date: '2026-06-01' }, NOW).code, 409);
  assert.match(f.editPlan(row(), { birth_date: '2019-01-01' }, NOW).error, /לפני גיל שבע/);
  assert.match(f.editPlan(row(), { birth_date: '2022-13-40' }, NOW).error, /אינו תקין/);
  assert.match(f.editPlan(row({ education_role: 'teacher' }), { birth_date: '2026-06-01' }, NOW).error, /אינה כוללת שאלון מורה/);
});

test('staff edit: changing the setting moves the case to the right stage', () => {
  const none = f.editPlan(row({ status: 'education', parent_submitted_at: 'x', parent_answers: some('parent') }), { education_role: 'none' }, NOW);
  assert.equal(none.update.status, 'review'); assert.match(none.update.summary, /אינו במסגרת חינוכית/);
  assert.deepEqual(f.editPlan(row(), { education_role: 'none' }, NOW).update, { education_role: 'none' }, 'before the parent finished only the setting changes');
  const back = f.editPlan(row({ status: 'review', education_role: 'none', parent_submitted_at: 'x', summary: 's' }), { education_role: 'teacher' }, NOW);
  assert.equal(back.update.status, 'education'); assert.equal(back.update.summary, null); assert.equal(back.needsEducationLink, true); assert.equal(back.update.expires_at, '2026-12-25T10:00:00.000Z');
  assert.equal(f.editPlan(row({ status: 'review', parent_submitted_at: 'x', education_submitted_at: 'y' }), { education_role: 'teacher' }, NOW).code, 409, 'a completed educator questionnaire fixes the setting');
  assert.equal(f.editPlan(row({ status: 'education', parent_submitted_at: 'x', education_answers: some('kindergarten', 1) }), { education_role: 'teacher' }, NOW).code, 409, 'answers of another form are not silently dropped');
  assert.deepEqual(f.editPlan(row({ status: 'education', parent_submitted_at: 'x' }), { education_role: 'teacher' }, NOW).update, { education_role: 'teacher' });
  assert.match(f.editPlan(row(), { education_role: 'school' }, NOW).error, /מסגרת לא מוכרת/);
});

test('a case from the earlier track only lets the contact details change', () => {
  const legacy = row({ form_version: null, form_template: null });
  assert.deepEqual(f.editPlan(legacy, { parent_name: 'הורה אחר', phone: '0500000009' }, NOW).update, { parent_name: 'הורה אחר', phone: '+972500000009' });
  for (const input of [{ child_name: 'שם אחר' }, { birth_date: '2021-01-01' }, { education_role: 'none' }]) assert.equal(f.editPlan(legacy, input, NOW).code, 409);
});

test('the e-mail to Maccabi asks to schedule the evaluation; the copy for the institute does not change', () => {
  const r = load('lib/development/recipients.ts', { './schema': { DESTINATION: 'magickids@magickidsinstitute.com' }, '@/lib/maccabi/send-files': { MACCABI_CHILDREN_CENTER_EMAIL: 'MokedMhuziYld@mac.org.il' }, './followup': f });
  const body = r.packetBody('all', row({ parent_answers: { f5: '123456782' } }), ['reviewed-summary.pdf', 'referral.pdf']);
  assert.ok(body.includes('נבקש לזמן את הילד/ה להערכה התפתחותית.')); assert.ok(body.includes('לתיאום מועד ניתן לפנות להורה: סמיר לדוגמה, טלפון 050-000-0001.'));
  assert.ok(body.includes('ת.ז. 123456782') && body.includes('1. ריכוז הדיווחים שנבדק במכון') && body.includes('2. הפניית רופא'));
  assert.equal(r.packetBody('institute', row(), []), 'שלום, מצורפים שאלוני ההורים והמסגרת, הפניית רופא, הסכמה וסיכום שנבדק במכון ילדי הקסם. נא לאשר קבלה. תודה.');
  assert.deepEqual(Object.keys(r.RECIPIENTS), ['all', 'maccabi', 'shfaram', 'institute']);
});

test('the registration consent names the transfer to Maccabi', () => {
  assert.match(consent.CONSENT_TEXT, /למכבי/); assert.doesNotMatch(consent.CONSENT_TEXT, /אינם נשלחים למכבי/); assert.notEqual(consent.CONSENT_VERSION, V);
  assert.ok(fs.readFileSync('app/development/Form.tsx', 'utf8').includes('{CONSENT_TEXT}'));
});

test('migration: additive, repeatable, keeps existing cases and stays closed to anonymous readers', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon;create role authenticated;create role service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
    await db.exec(fs.readFileSync('db/migrations/20260915_development_referrals.sql', 'utf8'));
    await db.exec(fs.readFileSync('supabase/migrations/20261002233144_official_development_questionnaires.sql', 'utf8'));
    await db.query("select register_development_original('TEST','2022-01-01','TEST','+972500000000','kindergarten','hash1','hash2','child','ip1')");
    const before = (await db.query('select * from development_referrals')).rows[0];
    const sql = fs.readFileSync('supabase/migrations/20261125150000_development_followup.sql', 'utf8');
    assert.doesNotMatch(sql, /\b(drop|delete|truncate|update)\b/i);
    await db.exec(sql); await db.exec(sql);
    const after = (await db.query('select * from development_referrals')).rows[0];
    for (const k of Object.keys(before)) assert.deepEqual(after[k], before[k], k);
    for (const k of f.FOLLOWUP_COLUMNS) assert.equal(after[k], null, k);
    const t = 'a'.repeat(64);
    await db.query('update development_referrals set parent_token=$1, education_phone=$2 where id=$3', [t, '+972500000022', before.id]);
    await db.query("select register_development_original('TEST2','2022-01-01','TEST','+972500000000','none','hash3','hash4','child','ip1')");
    await assert.rejects(db.query('update development_referrals set parent_token=$1 where parent_hash=$2', [t, 'hash3']), /duplicate key/);
    await assert.rejects(db.query("update development_referrals set education_token='short' where id=$1", [before.id]), /followup_lengths/);
    assert.equal((await db.query('select count(*)::int n from development_referrals where parent_token is null')).rows[0].n, 1, 'many cases may have no stored link');
    await db.exec('set role anon'); await assert.rejects(db.query('select parent_token from development_referrals'), /permission denied/); await db.exec('reset role');
  } finally { await db.close(); }
});
