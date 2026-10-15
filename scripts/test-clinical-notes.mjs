import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
const require = createRequire(import.meta.url);
function compile(path, mocks) {
  const m = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(n => mocks[n] ?? require(n), m, m.exports);
  return m.exports;
}
const ids = Array.from({ length: 7 }, (_, i) => `00000000-0000-4000-8000-00000000000${i + 1}`);
const [owner, admin, other, session, otherSession, note, secondNote] = ids;
const { NextRequest } = require('next/server');
const request = (method, body, origin = 'https://clinic.test') => new NextRequest(
  'https://clinic.test/api/admin/notes', { method, headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
function routes(staff = { id: owner }, rpcError = null) {
  const calls = [];
  const api = compile('app/api/admin/notes/route.ts', {
    '@/lib/admin/auth': { getCurrentStaff: async () => staff },
    '@/lib/supabase': { getSupabaseAdmin: () => ({ rpc: async (...args) => {
      calls.push(args); return { data: { ok: true }, error: rpcError };
    } }) },
  });
  return { api, calls };
}
const create = { id: note, session_id: session, content: 'Synthetic note', category: 'clinical' };
const edit = { ...create, action: 'edit', version: 0, reason: 'Correct test text' };
test('note APIs authenticate, enforce origin and reject spoofed staff and missing reason', async () => {
  assert.equal((await routes(null).api.POST(request('POST', create))).status, 401);
  const { api, calls } = routes();
  assert.equal((await api.POST(request('POST', create, 'https://other.test'))).status, 403);
  assert.equal((await api.POST(request('POST', { ...create, staff_id: admin }))).status, 400);
  assert.equal((await api.PATCH(request('PATCH', { ...edit, reason: '' }))).status, 400);
  assert.equal((await api.PATCH(request('PATCH', { ...edit, action: 'delete' }))).status, 400);
  assert.equal(calls.length, 0);
  assert.equal((await api.PATCH(request('PATCH', edit))).status, 200);
  assert.equal(calls[0][1].p_staff, owner);
  assert.equal(calls[0][1].p_version, 0);
});
test('API maps stale edits and forbids leaking database diagnostics', async () => {
  const stale = await routes({ id: owner }, { message: 'note_changed' }).api.PATCH(request('PATCH', edit));
  assert.equal(stale.status, 409);
  const fail = await routes({ id: owner }, { message: 'private-table-secret' }).api.POST(request('POST', create));
  assert.equal(fail.status, 503); assert.doesNotMatch(await fail.text(), /private-table-secret/);
});
test('history endpoint requires staff and exact case ownership', async () => {
  const req = new NextRequest(`https://clinic.test/api/admin/notes?id=${note}&session_id=${otherSession}`);
  assert.equal((await routes(null).api.GET(req)).status, 401);
  const api = compile('app/api/admin/notes/route.ts', {
    '@/lib/admin/auth': { getCurrentStaff: async () => ({ id: owner }) },
    '@/lib/supabase': { getSupabaseAdmin: () => ({ from: table => {
      assert.equal(table, 'clinical_notes'); return { select() { return this; }, eq() { return this; },
        maybeSingle: async () => ({ data: null }) };
    } }) },
  });
  assert.equal((await api.GET(req)).status, 404);
});
test('database enforces author/admin, immutable revisions, stale locks, void and atomic audit', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table users(id uuid primary key,role text,is_active boolean);
      create view staff_users as select * from users;
      create table intake_sessions(id uuid primary key);
      create table clinical_notes(id uuid primary key,session_id uuid not null references intake_sessions(id) on delete cascade,
        staff_id uuid not null,category text not null,content text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
      grant all on clinical_notes to anon,authenticated,service_role;
      create table audit_log(actor_id uuid,actor_type text,action text,entity_type text,entity_id uuid,metadata jsonb);
      insert into staff_users values('${owner}','diagnostician',true),('${admin}','admin',true),('${other}','assistant',true);
      insert into intake_sessions values('${session}'),('${otherSession}');
      insert into clinical_notes(id,session_id,staff_id,category,content) values('${note}','${session}','${owner}','clinical','original');
    `);
    await db.exec(fs.readFileSync('supabase/migrations/20261016000100_clinical_note_revisions.sql', 'utf8'));
    const mutate = (actor, action, version, text = 'updated', reason = 'correction', n = note, s = session) =>
      db.query('select manage_clinical_note($1,$2,$3,$4,$5,$6,$7,$8) result',
        [actor, s, n, action, version, text, 'clinical', reason]);
    const get = async () => (await db.query('select * from clinical_notes where id=$1', [note])).rows[0];
    assert.equal((await get()).version, 0); assert.equal((await get()).content, 'original');
    await assert.rejects(mutate(other, 'edit', 0), /forbidden/);
    await assert.rejects(mutate(owner, 'edit', 0, 'updated', ''), /reason_required/);
    await assert.rejects(mutate(owner, 'edit', 0, 'updated', 'reason', note, otherSession), /note_not_found/);
    await mutate(owner, 'edit', 0);
    assert.equal((await get()).version, 1); assert.equal((await get()).content, 'updated');
    await assert.rejects(mutate(owner, 'edit', 0, 'stale'), /note_changed/);
    await mutate(admin, 'void', 1, null, 'entered in wrong case');
    assert.ok((await get()).voided_at); assert.equal((await get()).content, 'updated');
    assert.equal((await db.query('select count(*)::int n from clinical_notes where voided_at is null')).rows[0].n, 0);
    await assert.rejects(mutate(owner, 'edit', 2), /note_voided/);
    const revisions = (await db.query('select content,version,action from clinical_note_revisions order by version')).rows;
    assert.deepEqual(revisions, [{ content: 'original', version: 0, action: 'edit' }, { content: 'updated', version: 1, action: 'void' }]);
    const audit = (await db.query('select * from audit_log')).rows;
    assert.equal(audit.length, 2); assert.equal(audit[1].actor_id, admin);
    assert.doesNotMatch(JSON.stringify(audit), /original|updated|entered in wrong case/);
    // A repeated create with the same ID is idempotent.
    await mutate(owner, 'create', null, 'new', null, secondNote);
    await mutate(owner, 'create', null, 'new', null, secondNote);
    assert.equal((await db.query('select count(*)::int n from audit_log')).rows[0].n, 3);
    await assert.rejects(mutate(owner, 'create', null, 'different', null, secondNote), /note_changed/);
    await db.exec(`update staff_users set is_active=false where id='${owner}'`);
    await assert.rejects(mutate(owner, 'edit', 0, 'inactive', 'reason', secondNote), /unauthorized/);
    await db.exec(`update staff_users set is_active=true where id='${owner}';
      alter table audit_log add constraint fail_edits check(action<>'clinical_note_edit') not valid;`);
    await assert.rejects(mutate(owner, 'edit', 0, 'must rollback', 'reason', secondNote), /fail_edits/);
    assert.equal((await db.query('select content from clinical_notes where id=$1', [secondNote])).rows[0].content, 'new');
    assert.equal((await db.query('select count(*)::int n from clinical_note_revisions where note_id=$1', [secondNote])).rows[0].n, 0);
    for (const role of ['anon', 'authenticated']) {
      assert.equal((await db.query(`select has_table_privilege('${role}','clinical_notes','update') allowed`)).rows[0].allowed, false);
      assert.equal((await db.query(`select has_table_privilege('${role}','clinical_note_revisions','select') allowed`)).rows[0].allowed, false);
      assert.equal((await db.query(`select has_function_privilege('${role}','manage_clinical_note(uuid,uuid,uuid,text,integer,text,text,text)','execute') allowed`)).rows[0].allowed, false);
    }
    // The established explicit whole-case deletion still cascades revisions.
    await db.query('delete from intake_sessions where id=$1', [session]);
    assert.equal((await db.query('select count(*)::int n from clinical_note_revisions')).rows[0].n, 0);
  } finally { await db.close(); }
});
test('report and page guard against voided notes and silently empty failed reads', () => {
  const report = fs.readFileSync('app/api/admin/reports/generate/route.ts', 'utf8');
  assert.match(report, /\.is\('voided_at', null\)/);
  assert.match(report, /if \(clinicalNotesError\)/);
  const page = fs.readFileSync('app/admin/sessions/[id]/page.tsx', 'utf8');
  assert.match(page, /<CaseActions/); assert.match(page, /notesError \?/);
  assert.doesNotMatch(page, /select\('\*, staff_users\(full_name\)'\)/);
});
