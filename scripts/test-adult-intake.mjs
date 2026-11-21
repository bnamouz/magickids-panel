// Adult ADHD track: question set, scoring, progress, the migration and both public APIs against PostgreSQL (PGlite).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const require = createRequire(import.meta.url), root = path.resolve(import.meta.dirname, '..');
function compile(relative, overrides = {}) {
  const filename = path.join(root, relative), source = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => {
    if (name in overrides) return overrides[name];
    if (name.startsWith('@/') || name.startsWith('./')) {
      const base = name.startsWith('@/') ? name.slice(2) : path.relative(root, path.resolve(path.dirname(filename), name));
      return compile(fs.existsSync(path.join(root, base + '.ts')) ? base + '.ts' : base + '/index.ts', overrides);
    }
    return require(name);
  }, module, module.exports);
  return module.exports;
}
const { ASRS_ADULT_QUESTIONS: questions, ASRS_ADULT_INTRO_FIELDS: introFields, adultScale, ASRS_COPYRIGHT } = compile('questions/asrs_adult.ts');
const scoring = compile('lib/adult-scoring.ts'), progress = compile('lib/intake/progress.ts');
const fill = (value, overrides = {}) => ({ ...Object.fromEntries(questions.map(q => [q.id, Math.min(value, q.max)])), ...overrides });
const intro = Object.fromEntries(introFields.filter(f => f.required).map(f => [f.id, f.options?.[0].value ?? 'קושי להתרכז בעבודה']));

test('the question set is the official screener plus one item per remaining DSM-5 symptom', () => {
  assert.equal(questions.length, 28);
  assert.deepEqual(questions.map(q => q.id), Array.from({ length: 28 }, (_, i) => i + 1));
  assert.deepEqual(questions.filter(q => q.part === 'A').map(q => q.id), [1, 2, 3, 4, 5, 6]);
  const codes = questions.filter(q => q.dsm).map(q => q.dsm).sort();
  assert.deepEqual(codes, [...'abcdefghi'].flatMap(letter => ['A1' + letter, 'A2' + letter]).sort(), 'each of the 18 DSM-5 symptoms is asked exactly once');
  assert.equal(questions.filter(q => q.domain === 'inattention').length, 9); assert.equal(questions.filter(q => q.domain === 'hyperactivity').length, 9);
  for (const q of questions) {
    for (const lang of ['he', 'ar', 'en']) assert.ok(q.text[lang]?.trim().length > 8, `item ${q.id} has ${lang} wording`);
    assert.equal(adultScale(q.part).length, q.max + 1, `item ${q.id} scale matches its range`);
  }
  // The licence of the free screener requires the citation and the copyright notice.
  assert.match(ASRS_COPYRIGHT, /Kessler/); assert.match(ASRS_COPYRIGHT, /New York University and President and Fellows of Harvard College/);
  // Official wording of the first screener item in the three languages.
  assert.match(questions[0].text.en, /^How often do you have trouble wrapping up the final details of a project/);
});

test('screener scoring follows the published rules', () => {
  const s = r => scoring.scoreAdult(r);
  assert.equal(s(fill(0)).screenerCount, 0); assert.equal(s(fill(0)).screenerPositive, false); assert.equal(s(fill(0)).presentation, 'none');
  // Items 1–3 count from "sometimes" (2), items 4–6 only from "often" (3).
  assert.equal(s(fill(0, { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 })).screenerCount, 3);
  assert.equal(s(fill(0, { 1: 2, 2: 2, 3: 2, 4: 3 })).screenerCount, 4);
  assert.equal(s(fill(0, { 1: 2, 2: 2, 3: 2, 4: 3 })).screenerPositive, true);
  assert.equal(s(fill(0, { 1: 1, 2: 1, 3: 1, 4: 3, 5: 3, 6: 3 })).screenerPositive, false);
  // 2024 scoring: sum 0–24, positive from 14, four bands.
  const sum = total => { const r = fill(0); let left = total; for (let id = 1; id <= 6; id++) { r[id] = Math.min(4, left); left -= r[id]; } return s(r); };
  for (const [total, band, positive] of [[0, 'low_negative', false], [9, 'low_negative', false], [10, 'high_negative', false], [13, 'high_negative', false], [14, 'low_positive', true], [17, 'low_positive', true], [18, 'high_positive', true], [24, 'high_positive', true]]) {
    const result = sum(total);
    assert.equal(result.screenerSum, total); assert.equal(result.screenerBand, band, `sum ${total}`); assert.equal(result.screenerPositive24, positive, `sum ${total}`);
  }
});

test('DSM-5 counts use the adult threshold of five and never count "sometimes"', () => {
  const ids = domain => questions.filter(q => q.domain === domain).map(q => q.id);
  const only = (domain, n, value = 3) => scoring.scoreAdult(fill(0, Object.fromEntries(ids(domain).slice(0, n).map(id => [id, value]))));
  assert.equal(scoring.ADULT_SYMPTOM_THRESHOLD, 5);
  assert.equal(only('inattention', 4).presentation, 'none');
  assert.equal(only('inattention', 5).presentation, 'inattentive'); assert.equal(only('inattention', 5).inattention, 5);
  assert.equal(only('hyperactivity', 5).presentation, 'hyperactive_impulsive');
  assert.equal(only('inattention', 9, 2).inattention, 0, '"sometimes" is not a symptom');
  assert.equal(scoring.scoreAdult(fill(4)).presentation, 'combined');
  assert.equal(scoring.scoreAdult(fill(4)).symptoms.length, 18);
});

test('childhood onset and impairment are summarised, and "do not remember" is not a no', () => {
  const childhood = questions.filter(q => q.part === 'childhood').map(q => q.id), impairment = questions.filter(q => q.part === 'impairment').map(q => q.id);
  const set = (ids, value) => Object.fromEntries(ids.map(id => [id, value]));
  assert.equal(scoring.scoreAdult(fill(0, set(childhood.slice(0, 2), 1))).childhoodOnset, 'likely');
  assert.equal(scoring.scoreAdult(fill(0, set(childhood.slice(0, 1), 2))).childhoodOnset, 'not_reported');
  assert.equal(scoring.scoreAdult(fill(0, set(childhood, 3))).childhoodOnset, 'unknown');
  assert.equal(scoring.scoreAdult(fill(0)).childhoodOnset, 'not_reported');
  assert.deepEqual(scoring.scoreAdult(fill(0, set(impairment.slice(0, 2), 2))).impairedDomains, impairment.slice(0, 2));
  assert.equal(scoring.scoreAdult(fill(0, set(impairment.slice(0, 2), 2))).impairmentMulti, true);
  assert.equal(scoring.scoreAdult(fill(0, set(impairment, 1))).impairmentMulti, false);
});

test('a submission is complete only with every item answered inside its own scale', () => {
  assert.equal(scoring.adultResponsesComplete(fill(2)), true);
  assert.equal(scoring.adultResponsesComplete(null), false);
  const missing = fill(2); delete missing[17]; assert.equal(scoring.adultResponsesComplete(missing), false);
  assert.equal(scoring.adultResponsesComplete(fill(2, { 19: 4 })), false, 'childhood items stop at 3');
  assert.equal(scoring.adultResponsesComplete(fill(2, { 5: 1.5 })), false);
  assert.equal(scoring.adultResponsesComplete(fill(2, { 5: -1 })), false);
});

test('an adult file is ready after the self-report alone; child files are unaffected', () => {
  const at = '2026-11-20T10:00:00Z', self = { type: 'asrs_adult', is_complete: true, submitted_at: at, responses: fill(1) };
  const waiting = progress.intakeProgress([], [], 'created', 'adult');
  assert.equal(waiting.adult, true); assert.equal(waiting.stage, 'self'); assert.equal(waiting.readyToSchedule, false); assert.equal(waiting.canBookAssessment, false);
  assert.equal(progress.intakeProgress([{ ...self, is_complete: false, submitted_at: null }], [], 'parent_form_started', 'adult').stage, 'self');
  assert.equal(progress.intakeProgress([{ ...self, responses: { 1: 2 } }], [], 'created', 'adult').readyToSchedule, false);
  const ready = progress.intakeProgress([self], [], 'profile_ready', 'adult');
  assert.equal(ready.stage, 'ready'); assert.equal(ready.bothComplete, true); assert.equal(ready.readyAt, at); assert.equal(ready.teacherComplete, false);
  // The self-report marks the track even where the column was not read (booking, voice).
  assert.equal(progress.intakeProgress([self]).readyToSchedule, true); assert.equal(progress.intakeProgress([self]).adult, true);
  assert.equal(progress.intakeProgress([self], [{ status: 'scheduled' }], 'booked', 'adult').stage, 'scheduled');
  assert.equal(progress.intakeProgress([self], [], 'closed', 'adult').readyToSchedule, false);
  // Child track: unchanged, with or without the track argument.
  for (const track of [undefined, 'child', null]) {
    const child = progress.intakeProgress([], [], 'created', track);
    assert.equal(child.adult, false); assert.equal(child.stage, 'parent');
  }
  assert.ok(progress.INTAKE_STAGES.self);
});

// ---- PostgreSQL: production-shaped schema, the migration, and the two APIs ----
const PROD_SCHEMA = `
  create type questionnaire_type_enum as enum ('vanderbilt_parent','vanderbilt_teacher','moxo');
  create type respondent_enum as enum ('parent','teacher','system','diagnostician');
  create type session_status_enum as enum ('created','parent_form_started','parent_form_done','teacher_link_sent','teacher_form_started','teacher_form_done','profile_ready','booked','attended','moxo_pending','reported','closed','stuck','cancelled');
  create table patients(id uuid primary key default gen_random_uuid(),first_name text not null,last_name text not null,birth_date text not null,gender text,grade text,school text,medical_notes text,national_id text check (national_id is null or national_id ~ '^[0-9]{9}$'),archived_at timestamptz,
    -- PostgREST returns dates as text; the column is text here so the adapter returns the same shape.
    constraint age_in_range check (extract(year from age(birth_date::date::timestamptz)) between 6 and 80));
  create table parents(id uuid primary key default gen_random_uuid(),patient_id uuid not null,full_name text not null,relation text not null default 'mother',phone text not null,email text,consent_given boolean not null default false,consent_at timestamptz,consent_version text,consent_ip text);
  create table intake_sessions(id uuid primary key default gen_random_uuid(),patient_id uuid not null,primary_parent_id uuid,status session_status_enum not null default 'created',parent_token text not null,parent_token_expires_at timestamptz not null,teacher_token text,teacher_token_expires_at timestamptz,notes text,reason_for_referral text,teacher_name text,teacher_phone text,created_at timestamptz not null default now());
  create table questionnaires(id uuid primary key default gen_random_uuid(),session_id uuid not null,type questionnaire_type_enum not null,respondent respondent_enum not null,responses jsonb not null default '{}',free_text text,intro_data jsonb,is_complete boolean not null default false,started_at timestamptz,submitted_at timestamptz,unique(session_id,type,respondent));
  create table scores(id uuid primary key default gen_random_uuid(),session_id uuid not null,questionnaire_id uuid,scope text not null,presentation text,confidence numeric,flags jsonb not null default '{}',raw_scores jsonb not null default '{}',engine_version text not null default 'vanderbilt-dsm5-v1',
    constraint scores_scope_check check (scope = any (array['parent','teacher','combined'])));
  create table dashboard_case_archive(session_id uuid primary key);
  create table audit_log(id serial primary key,actor_type text not null,action text not null,entity_type text not null,entity_id uuid,metadata jsonb default '{}');
  create table notifications(id serial primary key,session_id uuid,recipient_type text not null,channel text not null,template text not null,scheduled_for timestamptz,status text,payload jsonb not null default '{}');`;
const MIGRATION = fs.readFileSync(path.join(root, 'supabase/migrations/20261121120000_adult_adhd_track.sql'), 'utf8');

function db(pg, failures = {}) {
  return {
    async rpc(name, a) {
      assert.equal(name, 'create_intake_session');
      try {
        const patient = (await pg.query('insert into patients(first_name,last_name,birth_date) values($1,$2,$3) returning id', [a.p_first_name, a.p_last_name, a.p_birth_date])).rows[0].id;
        const parent = (await pg.query('insert into parents(patient_id,full_name,phone) values($1,$2,$3) returning id', [patient, a.p_parent_name, a.p_parent_phone])).rows[0].id;
        const token = 'p_' + randomUUID().replace(/-/g, '');
        return { data: (await pg.query("insert into intake_sessions(patient_id,primary_parent_id,parent_token,parent_token_expires_at) values($1,$2,$3,now()+interval '30 days') returning id", [patient, parent, token])).rows[0].id, error: null };
      } catch (error) { return { data: null, error }; }
    },
    from(table) {
      let action = 'select', columns = '*', values, conflict, filters = [], one = false;
      const q = {
        select(value = '*') { columns = value; return q; },
        eq(key, value) { filters.push([key + '=', value]); return q; },
        neq(key, value) { filters.push([key + '<>', value]); return q; },
        in(key, value) { filters.push(value.length ? [key + '= any', value] : ['false']); return q; },
        is(key, value) { assert.equal(value, null); filters.push([key + ' is null']); return q; },
        or(value) { assert.equal(value, 'is_complete.is.null,is_complete.eq.false'); filters.push(['(is_complete is null or is_complete=false)']); return q; },
        limit() { return q; },
        insert(value) { action = 'insert'; values = value; return q; },
        upsert(value, options) { action = 'insert'; values = value; conflict = options; return q; },
        update(value) { action = 'update'; values = value; return q; },
        single() { one = true; return q; }, maybeSingle() { one = true; return q; },
        then(resolve, reject) { return (async () => {
          if (failures.track && /track/.test(action === 'select' ? columns : Object.keys(values).join(','))) return { data: null, error: new Error('column intake_sessions.track does not exist') };
          if (failures.trackFilter && filters.some(([op]) => op.startsWith('track'))) return { data: null, error: new Error('column intake_sessions.track does not exist') };
          const params = [], param = v => { params.push(v !== null && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v); return '$' + params.length; };
          let sql = action === 'select' ? `select ${columns} from ${table}` : action === 'update' ? `update ${table} set ${Object.entries(values).map(([k, v]) => `${k}=${param(v)}`).join(',')}`
            : `insert into ${table}(${Object.keys(values).join(',')}) values(${Object.values(values).map(param).join(',')})` + (conflict ? ` on conflict (${conflict.onConflict}) do nothing` : '');
          if (filters.length) sql += ' where ' + filters.map(([op, v]) => v === undefined ? op : op.endsWith('any') ? `${op.slice(0, -5)} in (${v.map(param).join(',')})` : op + param(v)).join(' and ');
          if (action !== 'select') sql += ' returning ' + (columns === '*' ? '*' : columns);
          try { const r = await pg.query(sql, params); return { data: one ? r.rows[0] ?? null : r.rows, error: null }; } catch (error) { return { data: null, error }; }
        })().then(resolve, reject); },
      };
      return q;
    },
  };
}
// A valid Israeli ID (check digit) for a given 8-digit prefix.
const israeliId = prefix => { const sum = [...prefix].reduce((t, ch, i) => { const v = Number(ch) * (i % 2 + 1); return t + (v > 9 ? v - 9 : v); }, 0); return prefix + (10 - sum % 10) % 10; };

test('the migration is additive, repeatable and keeps every existing file on the child track', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(PROD_SCHEMA);
    const patient = (await pg.query("insert into patients(first_name,last_name,birth_date) values('A','B','2016-01-01') returning id")).rows[0].id;
    const before = (await pg.query("insert into intake_sessions(patient_id,parent_token,parent_token_expires_at) values($1,'p_x',now()) returning id", [patient])).rows[0].id;
    await pg.query("insert into scores(session_id,scope) values($1,'combined')", [before]);
    await pg.exec(MIGRATION); await pg.exec(MIGRATION);
    assert.equal((await pg.query('select track from intake_sessions where id=$1', [before])).rows[0].track, 'child');
    await assert.rejects(pg.query("update intake_sessions set track='teen'"));
    await pg.query("update intake_sessions set track='adult' where id=$1", [before]);
    await pg.query("insert into questionnaires(session_id,type,respondent) values($1,'asrs_adult','self')", [before]);
    await pg.query("insert into scores(session_id,scope) values($1,'self')", [before]);
    await assert.rejects(pg.query("insert into scores(session_id,scope) values($1,'other')", [before]));
    assert.equal((await pg.query("select count(*)::int n from scores where scope='combined'")).rows[0].n, 1);
  } finally { await pg.close(); }
});

test('an adult opens a file, continues it, and never collides with a childhood file', async t => {
  const pg = new PGlite(), failures = {};
  await pg.exec(PROD_SCHEMA); await pg.exec(MIGRATION);
  const overrides = { '@/lib/supabase': { getSupabaseAdmin: () => db(pg, failures) } };
  const adultRoute = compile('app/api/intake/adult/route.ts', overrides), childRoute = compile('app/api/intake/route.ts', overrides);
  const id = israeliId('12345678'), base = { first_name: 'סמיר', last_name: 'Test', national_id: id, birth_date: '1990-05-06', gender: 'male', phone: '050-111-2233', email: '', consent: true };
  const call = async (route, body) => { const r = await route.POST({ headers: new Headers({ origin: 'https://app.test' }), json: async () => body }); return { status: r.status, body: await r.json() }; };
  const post = body => call(adultRoute, { ...base, ...body });
  const count = async (table, where = 'true') => (await pg.query(`select count(*)::int n from ${table} where ${where}`)).rows[0].n;
  try {
    await t.test('under 18, over 80, a bad ID and missing consent are refused before anything is created', async () => {
      const year = new Date().getFullYear();
      const minor = await post({ birth_date: `${year - 17}-01-01` }); assert.equal(minor.status, 400); assert.equal(minor.body.code, 'under_age');
      assert.equal((await post({ birth_date: `${year - 82}-01-01` })).body.code, 'invalid_birth_date');
      assert.equal((await post({ national_id: '123456789' })).body.code, 'invalid_id');
      assert.equal((await post({ consent: false })).status, 400);
      assert.equal(await count('patients'), 0); assert.equal(await count('intake_sessions'), 0);
    });
    let first;
    await t.test('a new adult file is on the adult track with the person as the contact', async () => {
      first = await post({});
      assert.equal(first.status, 200); assert.match(first.body.token, /^p_[A-Za-z0-9_-]{32}$/); assert.equal(first.body.url, 'https://app.test/questionnaire/adult/' + first.body.token);
      const session = (await pg.query('select * from intake_sessions')).rows[0];
      assert.equal(session.track, 'adult'); assert.equal(session.status, 'created');
      assert.equal((await pg.query('select national_id from patients')).rows[0].national_id, id);
      const contact = (await pg.query('select * from parents')).rows[0];
      assert.equal(contact.full_name, 'סמיר Test'); assert.equal(contact.relation, 'other'); assert.equal(contact.consent_given, true);
      assert.equal(await count('audit_log', "action='adult_intake_opened'"), 1);
      assert.equal((await pg.query("select payload->>'track' t from notifications")).rows[0].t, 'adult');
    });
    await t.test('the same person and phone continue the same file; nothing new is created', async () => {
      for (const phone of ['0501112233', '+972 50 111 2233']) {
        const again = await post({ phone, first_name: 'Samir' });
        assert.equal(again.status, 200); assert.equal(again.body.existing, true); assert.equal(again.body.token, first.body.token);
      }
      assert.equal(await count('patients'), 1); assert.equal(await count('intake_sessions'), 1);
    });
    await t.test('another phone never receives the link', async () => {
      const other = await post({ phone: '0529998877' });
      assert.equal(other.status, 409); assert.equal(other.body.code, 'existing_file'); assert.equal(JSON.stringify(other.body).includes(first.body.token), false);
      const guess = await post({ phone: '0529998877', birth_date: '1991-01-01' });
      assert.equal(guess.status, 409); assert.equal(guess.body.code, 'details_mismatch');
      assert.equal(await count('intake_sessions'), 1);
    });
    await t.test('a childhood file with the same ID stays separate and staff are told', async () => {
      const second = israeliId('87654321');
      const child = await call(childRoute, { child_first_name: 'Layla', child_last_name: 'Test', child_id: second, birth_date: '2008-02-03', parent_name: 'Parent', parent_phone: '0507776655', relation: 'mother', consent: true });
      assert.equal(child.status, 200, JSON.stringify(child.body));
      const childPatient = (await pg.query('select id from patients where national_id=$1', [second])).rows[0].id;
      // Same person, years later, as an adult (the age check is by today's date, so the stored child birth date is changed).
      await pg.query("update patients set birth_date='2000-02-03' where id=$1", [childPatient]);
      const adult = await post({ first_name: 'Layla', national_id: second, birth_date: '2000-02-03', phone: '0507776655' });
      assert.equal(adult.status, 200, JSON.stringify(adult.body)); assert.equal(adult.body.existing, undefined); assert.notEqual(adult.body.token, child.body.parent_token);
      assert.equal(await count('intake_sessions', "track='adult'"), 2); assert.equal(await count('intake_sessions', "track='child'"), 1);
      const earlier = (await pg.query("select metadata->'earlier_patient_ids' ids from audit_log where action='adult_intake_opened' order by id desc limit 1")).rows[0].ids;
      assert.deepEqual(earlier, [childPatient]);
      // The child form, sent again, continues the child file and not the adult one.
      const childAgain = await call(childRoute, { child_first_name: 'Layla', child_last_name: 'Test', child_id: second, birth_date: '2000-02-03', parent_name: 'Parent', parent_phone: '0507776655', relation: 'mother', consent: true });
      assert.equal(childAgain.body.parent_token, child.body.parent_token);
    });
    await t.test('if the track cannot be read or written, no adult file is opened as a child file', async () => {
      const sessions = await count('intake_sessions', "status<>'cancelled'");
      failures.track = true;
      const refused = await post({ national_id: israeliId('11223344'), phone: '0541234567' });
      assert.equal(refused.status, 503); assert.equal(refused.body.code, 'unavailable');
      failures.track = false;
      assert.equal(await count('intake_sessions', "status<>'cancelled'"), sessions);
      assert.equal(await count('intake_sessions', "track='child' and status<>'cancelled'"), 1);
    });
  } finally { await pg.close(); }
});

test('the self-report saves drafts, scores on submission, and stays inside the adult track', async t => {
  const pg = new PGlite();
  await pg.exec(PROD_SCHEMA); await pg.exec(MIGRATION);
  const overrides = { '@/lib/supabase': { getSupabaseAdmin: () => db(pg) } };
  const route = compile('app/api/questionnaire/adult/route.ts', overrides), childRoute = compile('app/api/questionnaire/route.ts', overrides);
  const patient = (await pg.query("insert into patients(first_name,last_name,birth_date) values('A','B','1990-01-01') returning id")).rows[0].id;
  const adultToken = 'p_' + 'a'.repeat(32), childToken = 'p_' + 'c'.repeat(32);
  const adultId = (await pg.query("insert into intake_sessions(patient_id,parent_token,parent_token_expires_at,track) values($1,$2,'2099-01-01','adult') returning id", [patient, adultToken])).rows[0].id;
  await pg.query("insert into intake_sessions(patient_id,parent_token,parent_token_expires_at) values($1,$2,'2099-01-01')", [patient, childToken]);
  const send = async (method, body) => { const r = await route[method]({ json: async () => ({ token: adultToken, responses: {}, ...body }) }); return { status: r.status, body: await r.json() }; };
  const row = async () => (await pg.query('select * from questionnaires where session_id=$1', [adultId])).rows[0];
  const status = async () => (await pg.query('select status from intake_sessions where id=$1', [adultId])).rows[0].status;
  try {
    await t.test('a child link, an unknown link and an expired link are refused', async () => {
      assert.equal((await send('PATCH', { token: childToken, responses: { 1: 2 } })).status, 403);
      assert.equal((await send('PATCH', { token: 'p_' + 'z'.repeat(32), responses: { 1: 2 } })).status, 403);
      assert.equal((await send('PATCH', { token: 'nonsense', responses: { 1: 2 } })).status, 403);
      await pg.exec("update intake_sessions set parent_token_expires_at='2020-01-01' where track='adult'");
      assert.equal((await send('PATCH', { responses: { 1: 2 } })).status, 403);
      await pg.exec("update intake_sessions set parent_token_expires_at='2099-01-01'");
      assert.equal((await pg.query('select count(*)::int n from questionnaires')).rows[0].n, 0);
    });
    await t.test('a draft is kept, out-of-range answers are dropped, and nothing is ready yet', async () => {
      const draft = await send('PATCH', { responses: { 1: 3, 19: 4, 99: 1 }, intro_data: { main_difficulty: ' ריכוז ', unknown: 'x' }, language: 'ar' });
      assert.equal(draft.status, 200);
      const saved = await row();
      assert.deepEqual(saved.responses, { 1: 3 }); assert.equal(saved.is_complete, false); assert.equal(saved.type, 'asrs_adult'); assert.equal(saved.respondent, 'self');
      assert.deepEqual(saved.intro_data, { main_difficulty: 'ריכוז', language: 'ar' });
      assert.equal(await status(), 'parent_form_started');
      assert.equal(progress.intakeProgress([saved], [], await status(), 'adult').stage, 'self');
    });
    await t.test('an incomplete submission is refused and changes nothing', async () => {
      assert.equal((await send('POST', { responses: { 1: 3 }, intro_data: intro })).body.code, 'incomplete');
      assert.equal((await send('POST', { responses: fill(2), intro_data: {} })).body.code, 'incomplete_background');
      assert.equal((await row()).is_complete, false); assert.equal(await status(), 'parent_form_started');
    });
    await t.test('a full submission is scored for staff and makes the file ready to schedule', async () => {
      const done = await send('POST', { responses: fill(4), intro_data: intro, free_text: ' הערה ', language: 'he' });
      assert.equal(done.status, 200); assert.equal(done.body.scoring_saved, true);
      assert.equal('presentation' in done.body, false, 'the person assessed is never shown a result');
      const saved = await row();
      assert.equal(saved.is_complete, true); assert.ok(saved.submitted_at); assert.equal(saved.free_text, 'הערה');
      const score = (await pg.query('select * from scores')).rows[0];
      assert.equal(score.scope, 'self'); assert.equal(score.presentation, 'combined'); assert.equal(score.engine_version, scoring.ADULT_ENGINE_VERSION);
      assert.equal(score.raw_scores.screener_sum, 24); assert.equal(score.flags.screener_positive, true); assert.equal(score.questionnaire_id, saved.id);
      assert.equal(await status(), 'profile_ready');
      assert.equal(progress.intakeProgress([saved], [], await status(), 'adult').readyToSchedule, true);
    });
    await t.test('a late draft or a second submission cannot change submitted answers', async () => {
      const before = JSON.stringify(await row());
      assert.equal((await send('PATCH', { responses: { 1: 0 } })).body.already_submitted, true);
      assert.equal((await send('POST', { responses: fill(0), intro_data: intro })).body.already_submitted, true);
      assert.equal(JSON.stringify(await row()), before);
      assert.equal((await pg.query('select count(*)::int n from scores')).rows[0].n, 1);
    });
    await t.test('the parent and teacher questionnaire API refuses an adult file', async () => {
      const parent = compile('questions/vanderbilt_parent.ts').VANDERBILT_PARENT_QUESTIONS;
      const r = await childRoute.PATCH({ json: async () => ({ token: adultToken, type: 'vanderbilt_parent', responses: { [parent[0].id]: 1 } }) });
      assert.equal(r.status, 403);
      assert.equal((await pg.query("select count(*)::int n from questionnaires where type<>'asrs_adult'")).rows[0].n, 0);
    });
    await t.test('the demo link validates but stores nothing', async () => {
      const before = (await pg.query('select count(*)::int n from questionnaires')).rows[0].n;
      const demo = await send('POST', { token: 'demo', responses: fill(1), intro_data: intro });
      assert.equal(demo.body.demo, true);
      assert.equal((await pg.query('select count(*)::int n from questionnaires')).rows[0].n, before);
    });
  } finally { await pg.close(); }
});
