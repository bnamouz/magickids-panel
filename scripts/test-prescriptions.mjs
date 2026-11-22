// Prescription renewal: prices, who counts as known to the system, the mandatory summary, the stored request and the manager's decision.
// Usage: node --test scripts/test-prescriptions.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
function compile(relative, overrides = {}) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  const local = name => name.startsWith('@/') ? name.slice(2) : name.startsWith('./') || name.startsWith('../') ? path.relative(root, path.resolve(root, path.dirname(relative), name)) : null;
  const load = name => { const rel = local(name); if (!rel) return require(name); const file = ['.ts', '.tsx', '/index.ts'].map(ext => rel + ext).find(f => fs.existsSync(path.join(root, f))); return file ? compile(file, overrides) : require(name); };
  new Function('require', 'module', 'exports', js)(name => name in overrides ? overrides[name] : load(name), module, module.exports);
  return module.exports;
}
const { NextRequest } = require('next/server');

/** In-memory stand-in for the Supabase client: just the query shapes this feature uses. */
function fakeDb(seed = {}, { failUpload = false } = {}) {
  const tables = { patients: [], parents: [], intake_sessions: [], appointments: [], reports: [], adhd_clinical_assessments: [], prescription_renewal_requests: [], prescription_renewal_attempts: [], audit_log: [], ...seed };
  const stored = new Map();
  function query(table) {
    const rows = tables[table]; if (!rows) return { error: { message: 'no table ' + table }, data: null };
    const filters = []; let op = 'select', payload = null, options = {}, single = false, returning = false;
    const run = () => {
      const hit = rows.filter(r => filters.every(f => f(r)));
      if (op === 'insert') {
        for (const r of [].concat(payload)) {
          if (table === 'prescription_renewal_requests' && rows.some(x => x.id === r.id)) return { data: null, error: { code: '23505' } };
          rows.push({ created_at: new Date().toISOString(), ...r });
        }
        return { data: null, error: null };
      }
      if (op === 'update') { for (const r of hit) Object.assign(r, payload); return { data: returning ? (single ? hit[0] ?? null : hit) : null, error: null }; }
      if (op === 'delete') { for (const r of hit) rows.splice(rows.indexOf(r), 1); return { data: null, error: null }; }
      if (options.head) return { data: null, count: hit.length, error: null };
      return { data: single ? hit[0] ?? null : hit, count: hit.length, error: null };
    };
    const q = {
      select(_cols, o = {}) { if (op === 'select') options = o; else returning = true; return q; },
      insert(v) { op = 'insert'; payload = v; return q; }, update(v) { op = 'update'; payload = v; return q; }, delete() { op = 'delete'; return q; },
      eq(k, v) { filters.push(r => r[k] === v); return q; }, neq(k, v) { filters.push(r => r[k] !== v); return q; },
      is(k, v) { filters.push(r => (r[k] ?? null) === v); return q; }, in(k, v) { filters.push(r => v.includes(r[k])); return q; },
      gt(k, v) { filters.push(r => r[k] > v); return q; }, lt(k, v) { filters.push(r => r[k] < v); return q; },
      order() { return q; }, limit() { return q; }, maybeSingle() { single = true; return q; },
      then(ok, bad) { return Promise.resolve().then(run).then(ok, bad); },
    };
    return q;
  }
  return {
    tables, stored, from: query,
    storage: { from: bucket => ({
      async upload(p, bytes, o) { if (failUpload && p.includes('summary')) return { error: { message: 'upload failed' } }; stored.set(`${bucket}/${p}`, { size: bytes.length, type: o.contentType }); return { data: { path: p }, error: null }; },
      async remove(paths) { for (const p of paths) stored.delete(`${bucket}/${p}`); return { data: [], error: null }; },
      async createSignedUrl(p, seconds) { return stored.has(`${bucket}/${p}`) ? { data: { signedUrl: `https://files.test/${p}?ttl=${seconds}` }, error: null } : { data: null, error: { message: 'missing' } }; },
    }) },
  };
}

const ID = '123456782', OTHER_ID = '039337423';
const PATIENT = 'aaaaaaaa-0000-4000-8000-000000000001', SESSION = 'bbbbbbbb-0000-4000-8000-000000000001';
const past = new Date(Date.now() - 40 * 864e5).toISOString(), future = new Date(Date.now() + 5 * 864e5).toISOString();
const base = () => ({
  patients: [{ id: PATIENT, first_name: 'יוסף', last_name: 'בדיקה', birth_date: '2015-03-04', national_id: ID, archived_at: null }],
  parents: [{ patient_id: PATIENT, phone: '+972501112233' }],
  intake_sessions: [{ id: SESSION, patient_id: PATIENT, status: 'booked', created_at: past }],
});
const jpeg = (size = 2000) => { const b = Buffer.alloc(size, 1); b.set([0xff, 0xd8, 0xff, 0xe0]); return b; };
const pdf = (size = 2000) => Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(size, 32)]);

const pricing = compile('lib/prescriptions/pricing.ts');
const schema = compile('lib/prescriptions/schema.ts');
const { recognisePatient } = compile('lib/prescriptions/match.ts');
const messages = compile('lib/prescriptions/messages.ts');
const { renewalCopy, FUND_LABELS } = compile('lib/prescriptions/copy.ts');

test('one month costs 300 and three months cost 500 before VAT; families pay 354 and 590', () => {
  assert.deepEqual(pricing.RENEWAL_BASE, { 1: 300, 3: 500 });
  assert.deepEqual(pricing.RENEWAL_PRICE, { 1: 354, 3: 590 });
  assert.ok(pricing.isRenewalMonths(1) && pricing.isRenewalMonths(3) && !pricing.isRenewalMonths(2));
  assert.ok(pricing.MAX_TOTAL_BYTES < 4.5 * 1024 * 1024, 'one request stays under the platform body limit');
});

test('request fields: valid ID, real birth date, phone stored internationally', () => {
  const ok = { id: randomUUID(), months: '3', method: 'bit', patientName: ' יוסף בדיקה ', nationalId: '١٢٣٤٥٦٧٨٢', birthDate: '2015-03-04', contactName: 'אמא בדיקה', phone: '050-111 2233', fund: 'clalit', medication: 'ריטלין LA 20 מ״ג', language: 'he', consent: 'true', website: '' };
  const parsed = schema.renewalSchema.parse(ok);
  assert.equal(parsed.months, 3); assert.equal(parsed.nationalId, ID); assert.equal(parsed.phone, '+972501112233'); assert.equal(parsed.patientName, 'יוסף בדיקה');
  for (const bad of [{ nationalId: '123456789' }, { birthDate: '2015-02-30' }, { birthDate: '2999-01-01' }, { months: '2' }, { phone: '12' }, { consent: 'false' }, { website: 'spam' }, { medication: ' ' }, { fund: 'other' }, { id: 'x' }, { patientName: 'a\nb' }])
    assert.equal(schema.renewalSchema.safeParse({ ...ok, ...bad }).success, false, JSON.stringify(bad));
  assert.equal(schema.normalisePhone('+972 50-111-2233'), '+972501112233'); assert.equal(schema.normalisePhone('00972501112233'), '+972501112233');
  assert.equal(schema.fileKind(jpeg())?.ext, 'jpg'); assert.equal(schema.fileKind(pdf())?.type, 'application/pdf'); assert.equal(schema.fileKind(Buffer.from('<html>')), null);
});

test('known to the system only with a documented assessment and a second matching detail', async () => {
  const input = { nationalId: ID, birthDate: '2015-03-04', patientName: 'יוסף בדיקה', phone: '+972509999999' };
  const fileOnly = await recognisePatient(fakeDb(base()), input);
  assert.deepEqual(fileOnly, { recognition: 'file_only', patientId: PATIENT, sessionId: SESSION });
  // A future appointment, a cancelled one and a MOXO test are not an assessment.
  const notYet = fakeDb({ ...base(), appointments: [
    { session_id: SESSION, patient_id: PATIENT, appointment_type: 'assessment', status: 'scheduled', scheduled_at: future, cancelled_at: null },
    { session_id: SESSION, patient_id: PATIENT, appointment_type: 'assessment', status: 'cancelled', scheduled_at: past, cancelled_at: past },
    { session_id: SESSION, patient_id: PATIENT, appointment_type: 'moxo', status: 'attended', scheduled_at: past, cancelled_at: null },
  ] });
  assert.equal((await recognisePatient(notYet, input)).recognition, 'file_only');
  for (const evidence of [
    { appointments: [{ session_id: SESSION, patient_id: PATIENT, appointment_type: 'assessment', status: 'confirmed', scheduled_at: past, cancelled_at: null }] },
    { reports: [{ session_id: SESSION }] }, { adhd_clinical_assessments: [{ session_id: SESSION }] },
    { intake_sessions: [{ id: SESSION, patient_id: PATIENT, status: 'reported', created_at: past }] },
  ]) assert.deepEqual(await recognisePatient(fakeDb({ ...base(), ...evidence }), input), { recognition: 'diagnosed', patientId: PATIENT, sessionId: SESSION }, Object.keys(evidence)[0]);

  const assessed = () => fakeDb({ ...base(), reports: [{ session_id: SESSION }] });
  // The ID alone is not enough: neither the birth date nor a phone on the file fits.
  assert.equal((await recognisePatient(assessed(), { ...input, birthDate: '2015-03-05' })).recognition, 'unknown');
  assert.equal((await recognisePatient(assessed(), { ...input, birthDate: '2015-03-05', phone: '050-1112233' })).recognition, 'diagnosed');
  assert.equal((await recognisePatient(assessed(), { ...input, nationalId: OTHER_ID })).recognition, 'unknown');
  // Archived patients and cancelled files do not count.
  const archived = assessed(); archived.tables.patients[0].archived_at = past;
  assert.equal((await recognisePatient(archived, input)).recognition, 'unknown');
  const cancelled = fakeDb({ ...base(), intake_sessions: [{ id: SESSION, patient_id: PATIENT, status: 'cancelled', created_at: past }] });
  assert.equal((await recognisePatient(cancelled, input)).recognition, 'file_only');
  // Files opened before the ID was mandatory: birth date, first name and phone together.
  const older = () => { const db = assessed(); db.tables.patients[0].national_id = null; return db; };
  assert.equal((await recognisePatient(older(), { ...input, phone: '0501112233' })).recognition, 'diagnosed');
  assert.equal((await recognisePatient(older(), input)).recognition, 'unknown');
  assert.equal((await recognisePatient(older(), { ...input, phone: '0501112233', patientName: 'אחמד בדיקה' })).recognition, 'unknown');
  await assert.rejects(recognisePatient({ from: () => ({ select() { return this; }, eq() { return this; }, is: async () => ({ data: null, error: { message: 'down' } }) }) }, input), /recognition_failed/);
});

test('messages to the family exist in three languages and carry the note', () => {
  assert.equal(messages.issuedText('he', 'יוסף', 3, ' המרשם ממתין בבית המרקחת. '), 'שלום, בקשתכם לחידוש מרשם עבור יוסף אושרה, והמרשם לשלושה חודשים הופק. המרשם ממתין בבית המרקחת. לשאלות: וואטסאפ 054-402-0043.');
  assert.ok(messages.issuedText('ar', 'يوسف', 1).includes('شهر واحد') && messages.issuedText('en', 'Yosef', 3).includes('three months'));
  assert.equal(messages.rejectedText('he', 'יוסף'), 'שלום, לא ניתן לאשר את בקשתכם לחידוש מרשם עבור יוסף. לבירור: וואטסאפ 054-402-0043.');
  assert.ok(messages.rejectedText('ar', 'يوسف', 'سبب').includes('سبب') && messages.rejectedText('en', 'Yosef').startsWith('Hello'));
  const keys = Object.keys(renewalCopy.he).sort();
  for (const lang of ['ar', 'en']) {
    assert.deepEqual(Object.keys(renewalCopy[lang]).sort(), keys, lang);
    assert.deepEqual(Object.keys(renewalCopy[lang].errors).sort(), Object.keys(renewalCopy.he.errors).sort(), lang);
    assert.deepEqual(Object.keys(FUND_LABELS[lang]).sort(), Object.keys(FUND_LABELS.he).sort(), lang);
  }
});

test('migration: private tables, mandatory summary unless assessed here, valid months and status', async () => {
  const pg = new PGlite();
  await pg.exec('create role anon; create role authenticated; create role service_role;');
  await pg.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261123120000_prescription_renewals.sql'), 'utf8'));
  const insert = (o = {}) => { const r = { id: randomUUID(), months: 1, amount_ils: 300, payment_method: 'bit', patient_name: 'יוסף בדיקה', patient_id: ID, birth_date: '2015-03-04', contact_name: 'אמא', phone: '+972501112233', fund: 'clalit', medication: 'ריטלין', proof_path: `rx/${randomUUID()}/proof.jpg`, proof_type: 'image/jpeg', summary_paths: [], recognition: 'diagnosed', ip_hash: 'h', ...o };
    const keys = Object.keys(r); return pg.query(`insert into prescription_renewal_requests(${keys.join(',')}) values(${keys.map((_, i) => '$' + (i + 1)).join(',')})`, keys.map(k => r[k])); };
  await insert();
  await insert({ recognition: 'unknown', summary_paths: ['rx/a/summary-1.pdf'], months: 3, amount_ils: 500 });
  await assert.rejects(insert({ recognition: 'unknown' }), /prescription_summary_required/);
  await assert.rejects(insert({ recognition: 'file_only' }), /prescription_summary_required/);
  await assert.rejects(insert({ months: 2 })); await assert.rejects(insert({ patient_id: '12345' })); await assert.rejects(insert({ phone: '0501112233' }));
  await assert.rejects(insert({ proof_type: 'text/html' })); await assert.rejects(insert({ status: 'approved' }));
  await assert.rejects(insert({ recognition: 'unknown', summary_paths: ['a', 'b', 'c', 'd'] }));
  const rls = await pg.query("select relname, relrowsecurity from pg_class where relname like 'prescription_renewal_%' and relkind='r' order by 1");
  assert.deepEqual(rls.rows, [{ relname: 'prescription_renewal_attempts', relrowsecurity: true }, { relname: 'prescription_renewal_requests', relrowsecurity: true }]);
  const grants = await pg.query("select grantee from information_schema.role_table_grants where table_name like 'prescription_renewal_%' and grantee in ('anon','authenticated','PUBLIC')");
  assert.equal(grants.rows.length, 0);
  await pg.close();
});

const ORIGIN = 'https://app.magickidsinstitute.com';
function publicRoute(db) { return compile('app/api/prescriptions/route.ts', { '@/lib/supabase': { getSupabaseAdmin: () => db } }); }
function submit(route, { fields = {}, proof = jpeg(), summaries = [], origin = ORIGIN } = {}) {
  const form = new FormData();
  const all = { id: randomUUID(), months: '1', method: 'bank', patientName: 'יוסף בדיקה', nationalId: ID, birthDate: '2015-03-04', contactName: 'אמא בדיקה', phone: '0501112233', fund: 'clalit', medication: 'ריטלין LA 20', note: '', language: 'he', consent: 'true', website: '', ...fields };
  for (const [k, v] of Object.entries(all)) form.set(k, v);
  if (proof) form.set('proof', new File([proof], 'proof.bin'));
  for (const s of summaries) form.append('summary', new File([s], 'summary.bin'));
  return route.POST(new NextRequest(`${ORIGIN}/api/prescriptions`, { method: 'POST', body: form, headers: { origin } }));
}

test('public request: a known patient needs no summary, anyone else must attach one', async () => {
  const before = process.env.BOOKING_HASH_SECRET; process.env.BOOKING_HASH_SECRET = 'x'.repeat(40);
  try {
    const db = fakeDb({ ...base(), reports: [{ session_id: SESSION }] }), route = publicRoute(db);
    assert.equal((await submit(route, { origin: 'https://evil.test' })).status, 403);
    assert.equal((await submit(route, { fields: { nationalId: '111111111' } })).status, 400);
    assert.equal((await submit(route, { proof: Buffer.from('<html>'.repeat(40)) })).status, 400);
    assert.equal((await submit(route, { summaries: [pdf(), pdf(), pdf(), pdf()] })).status, 400);
    assert.equal((await submit(route, { proof: jpeg(4 * 1024 * 1024 + 10) })).status, 413);
    assert.equal(db.tables.prescription_renewal_requests.length, 0);

    const id = randomUUID();
    const ok = await submit(route, { fields: { id, months: '3', method: 'bit' } });
    assert.deepEqual(await ok.json(), { received: true, reference: id });
    const row = db.tables.prescription_renewal_requests[0];
    assert.deepEqual({ status: row.status, months: row.months, amount: row.amount_ils, method: row.payment_method, recognition: row.recognition, patient: row.matched_patient_id, session: row.matched_session_id, phone: row.phone, proof: row.proof_path, summaries: row.summary_paths, note: row.note },
      { status: 'pending', months: 3, amount: 590, method: 'bit', recognition: 'diagnosed', patient: PATIENT, session: SESSION, phone: '+972501112233', proof: `rx/${id}/proof.jpg`, summaries: [], note: null });
    assert.deepEqual([...db.stored.keys()], [`adhd-payments/rx/${id}/proof.jpg`]);
    assert.ok(row.ip_hash.length === 64 && !JSON.stringify(row).includes('unknown'));
    // The same request sent again is acknowledged, not stored twice; another patient cannot reuse the id.
    assert.equal((await submit(route, { fields: { id, months: '3', method: 'bit' } })).status, 200);
    assert.equal((await submit(route, { fields: { id, nationalId: OTHER_ID } })).status, 409);
    assert.equal(db.tables.prescription_renewal_requests.length, 1);

    // Not known: refused without a summary, stored with one.
    const stranger = { nationalId: OTHER_ID, birthDate: '2012-01-01', patientName: 'לא מוכר', phone: '0527777777' };
    const refused = await submit(route, { fields: stranger });
    assert.equal(refused.status, 409); assert.deepEqual(await refused.json(), { error: 'summary_required' });
    assert.equal(db.tables.prescription_renewal_requests.length, 1);
    const id2 = randomUUID();
    assert.equal((await submit(route, { fields: { ...stranger, id: id2 }, summaries: [pdf(), jpeg()] })).status, 200);
    const second = db.tables.prescription_renewal_requests[1];
    assert.deepEqual({ recognition: second.recognition, patient: second.matched_patient_id, summaries: second.summary_paths, amount: second.amount_ils }, { recognition: 'unknown', patient: null, summaries: [`rx/${id2}/summary-1.pdf`, `rx/${id2}/summary-2.jpg`], amount: 354 });
    assert.equal(db.stored.get(`adhd-payments/rx/${id2}/summary-1.pdf`).type, 'application/pdf');
    // The right ID with a wrong birth date and a phone that is not on the file is treated as unknown.
    assert.equal((await submit(route, { fields: { birthDate: '2015-03-05', phone: '0527777777' } })).status, 409);
  } finally { process.env.BOOKING_HASH_SECRET = before; }
});

test('public request: failed upload leaves nothing behind, repeated attempts are limited, missing secret refuses', async () => {
  const before = process.env.BOOKING_HASH_SECRET; process.env.BOOKING_HASH_SECRET = 'x'.repeat(40);
  try {
    const broken = fakeDb(base(), { failUpload: true });
    assert.equal((await submit(publicRoute(broken), { summaries: [pdf()] })).status, 503);
    assert.equal(broken.tables.prescription_renewal_requests.length, 0); assert.equal(broken.stored.size, 0);

    const db = fakeDb(base()), route = publicRoute(db);
    for (let i = 0; i < 12; i++) assert.equal((await submit(route, { fields: { nationalId: OTHER_ID } })).status, 409, `attempt ${i + 1}`);
    const limited = await submit(route, { fields: { nationalId: OTHER_ID }, summaries: [pdf()] });
    assert.equal(limited.status, 429); assert.equal(db.tables.prescription_renewal_requests.length, 0);

    const five = fakeDb(base()), r5 = publicRoute(five);
    for (let i = 0; i < 5; i++) assert.equal((await submit(r5, { summaries: [pdf()] })).status, 200);
    assert.equal((await submit(r5, { summaries: [pdf()] })).status, 429);

    delete process.env.BOOKING_HASH_SECRET;
    assert.equal((await submit(publicRoute(fakeDb(base())), { summaries: [pdf()] })).status, 503);
  } finally { process.env.BOOKING_HASH_SECRET = before; }
});

test('manager decision: manager only, one WhatsApp from the institute number, audit trail, no second decision', async () => {
  const id = randomUUID(), id2 = randomUUID();
  const request = (o = {}) => ({ id, months: 3, amount_ils: 500, patient_name: 'יוסף בדיקה', phone: '+972501112233', language: 'he', proof_path: `rx/${id}/proof.jpg`, summary_paths: [`rx/${id}/summary-1.pdf`], status: 'pending', ...o });
  const db = fakeDb({ prescription_renewal_requests: [request(), request({ id: id2, language: 'ar', months: 1 }), request({ id: randomUUID(), status: 'uploading' })] });
  db.stored.set(`adhd-payments/rx/${id}/proof.jpg`, {}); db.stored.set(`adhd-payments/rx/${id}/summary-1.pdf`, {});
  const sent = []; let staff = { id: 'staff-1', role: 'admin' };
  const route = compile('app/api/admin/prescriptions/route.ts', {
    '@/lib/supabase': { getSupabaseAdmin: () => db }, '@/lib/admin/auth': { getCurrentStaff: async () => staff },
    '@/lib/moxo/notification': { notifyOnce: async (...args) => { sent.push(args); return 'accepted'; } },
  });
  const call = (body, origin = ORIGIN) => route.POST(new NextRequest(`${ORIGIN}/api/admin/prescriptions`, { method: 'POST', body: JSON.stringify(body), headers: { origin, 'content-type': 'application/json' } }));

  assert.equal((await call({ action: 'issue', id }, 'https://evil.test')).status, 403);
  for (const role of ['assistant', 'diagnostician']) { staff = { id: 's', role }; assert.equal((await call({ action: 'file', id })).status, 403, role); }
  staff = null; assert.equal((await call({ action: 'issue', id })).status, 403);
  staff = { id: 'staff-1', role: 'admin' };
  assert.equal(sent.length, 0); assert.equal(db.tables.audit_log.length, 0);

  assert.equal((await (await call({ action: 'file', id, file: 0 })).json()).url, `https://files.test/rx/${id}/proof.jpg?ttl=300`);
  assert.equal((await (await call({ action: 'file', id, file: 1 })).json()).url, `https://files.test/rx/${id}/summary-1.pdf?ttl=300`);
  assert.equal((await call({ action: 'file', id, file: 2 })).status, 404);
  assert.equal((await call({ action: 'issue', id: db.tables.prescription_renewal_requests[2].id })).status, 404);

  const issued = await call({ action: 'issue', id, note: 'המרשם ממתין בבית המרקחת.' });
  assert.deepEqual(await issued.json(), { ok: true, whatsapp: 'accepted' });
  assert.deepEqual(sent[0], [`rx:${id}:issued`, '+972501112233', 'שלום, בקשתכם לחידוש מרשם עבור יוסף בדיקה אושרה, והמרשם לשלושה חודשים הופק. המרשם ממתין בבית המרקחת. לשאלות: וואטסאפ 054-402-0043.', { sender: 'institute' }]);
  const row = db.tables.prescription_renewal_requests[0];
  assert.deepEqual({ status: row.status, by: row.reviewed_by, note: row.review_note }, { status: 'issued', by: 'staff-1', note: 'המרשם ממתין בבית המרקחת.' });
  assert.equal((await call({ action: 'reject', id })).status, 409); assert.equal((await call({ action: 'issue', id })).status, 409);
  assert.equal(sent.length, 1);

  assert.equal((await call({ action: 'reject', id: id2, note: 'يلزم موعد متابعة.' })).status, 200);
  assert.equal(sent[1][0], `rx:${id2}:rejected`); assert.ok(sent[1][2].includes('يلزم موعد متابعة.') && sent[1][2].startsWith('مرحبًا')); assert.deepEqual(sent[1][3], { sender: 'institute' });
  assert.deepEqual(db.tables.audit_log.map(a => [a.action, a.actor_type, a.actor_id, a.entity_id]), [
    ['prescription_renewal_file_viewed', 'user', 'staff-1', id], ['prescription_renewal_file_viewed', 'user', 'staff-1', id],
    ['prescription_renewal_issued', 'user', 'staff-1', id], ['prescription_renewal_rejected', 'user', 'staff-1', id2],
  ]);
  assert.ok(!JSON.stringify(db.tables.audit_log).includes('050111'), 'no phone numbers in the audit trail');
});

test('pages: the form is not indexed, the review page is for the manager, the panel links to it once', () => {
  const page = fs.readFileSync(path.join(root, 'app/prescription/page.tsx'), 'utf8');
  assert.ok(page.includes('robots: { index: false, follow: false }'));
  const admin = fs.readFileSync(path.join(root, 'app/admin/prescriptions/page.tsx'), 'utf8');
  assert.ok(admin.includes("staff.role !== 'admin'") && admin.includes(".neq('status', 'uploading')"));
  const nav = fs.readFileSync(path.join(root, 'components/admin/nav-config.ts'), 'utf8');
  assert.equal(nav.split("'/admin/prescriptions'").length - 1, 1);
  const form = fs.readFileSync(path.join(root, 'components/prescriptions/RenewalForm.tsx'), 'utf8');
  assert.ok(form.includes("j.error === 'summary_required'") && form.includes('required={needSummary}'));
});
