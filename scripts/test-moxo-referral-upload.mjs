// MOXO request with the physician's referral attached: the migration, the public endpoint and the staff link.
// Usage: node --test scripts/test-moxo-referral-upload.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { test, before } from 'node:test';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
function compile(relative, overrides = {}) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  const local = name => name.startsWith('@/') ? name.slice(2) : name.startsWith('./') || name.startsWith('../') ? path.relative(root, path.resolve(root, path.dirname(relative), name)) : null;
  const load = name => { const rel = local(name); if (!rel) return require(name); const file = ['.ts', '.tsx'].map(ext => rel + ext).find(f => fs.existsSync(path.join(root, f))); return file ? compile(file, overrides) : require(name); };
  new Function('require', 'module', 'exports', js)(name => name in overrides ? overrides[name] : load(name), module, module.exports);
  return module.exports;
}
const { NextRequest } = require('next/server');
const { MAX_REFERRAL_BYTES, MAX_REFERRALS_PER_DAY } = compile('lib/moxo/referral.ts');

const pg = new PGlite();
const rpcArgs = ['p_id', 'p_patient', 'p_contact', 'p_phone', 'p_language', 'p_date', 'p_start', 'p_national_id'];
/** The Supabase client shapes this feature uses, over a real Postgres with the project's migrations applied. */
function makeDb({ failUpload = false } = {}) {
  const stored = new Map(), audit = [], uploads = [];
  const from = table => {
    let columns = '*', head = false, updates = null, inserted = null, single = false; const filters = [];
    const q = {
      select(c = '*', o = {}) { columns = c; head = !!o.head; return q; }, update(v) { updates = v; return q; }, insert(v) { inserted = v; return q; },
      eq(k, v) { filters.push([k, '=', v]); return q; }, gt(k, v) { filters.push([k, '>', v]); return q; }, is(k, v) { assert.equal(v, null); filters.push([k, 'is null']); return q; },
      maybeSingle() { single = true; return q; },
      then(ok, bad) { return (async () => {
        if (inserted) { assert.equal(table, 'audit_log'); audit.push(inserted); return { data: null, error: null }; }
        try {
          const params = [], p = v => { params.push(v); return '$' + params.length; };
          const where = filters.length ? ' where ' + filters.map(([k, op, v]) => op === 'is null' ? `${k} is null` : `${k}${op}${p(v)}`).join(' and ') : '';
          if (updates) { const set = Object.entries(updates).map(([k, v]) => `${k}=${p(v)}`).join(','); await pg.query(`update ${table} set ${set}${where}`, params); return { data: null, error: null }; }
          const r = await pg.query(`select ${head ? 'count(*)::int as n' : columns} from ${table}${where}`, params);
          if (head) return { data: null, count: r.rows[0].n, error: null };
          return { data: single ? r.rows[0] ?? null : r.rows, error: null };
        } catch (error) { return { data: null, error }; }
      })().then(ok, bad); },
    };
    return q;
  };
  return {
    stored, audit, uploads, from,
    async rpc(name, args) { assert.equal(name, 'submit_identified_moxo'); try { const r = await pg.query(`select submit_identified_moxo(${rpcArgs.map((_, i) => '$' + (i + 1)).join(',')}) as value`, rpcArgs.map(k => args[k])); return { data: r.rows[0].value, error: null }; } catch (error) { return { data: null, error }; } },
    storage: { from: bucket => ({
      async upload(p, bytes, o) { uploads.push(p); if (failUpload) return { error: { message: 'upload failed' } }; assert.equal(o.upsert, true); stored.set(`${bucket}/${p}`, { size: bytes.length, type: o.contentType }); return { data: { path: p }, error: null }; },
      async remove(paths) { for (const p of paths) stored.delete(`${bucket}/${p}`); return { data: [], error: null }; },
      async createSignedUrl(p, seconds) { return stored.has(`${bucket}/${p}`) ? { data: { signedUrl: `https://files.test/${p}?ttl=${seconds}` }, error: null } : { data: null, error: { message: 'missing' } }; },
    }) },
  };
}
const publicRoute = db => compile('app/api/moxo/requests/route.ts', { '@/lib/supabase': { getSupabaseAdmin: () => db } });
const origin = 'https://app.test';
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(400, 0x20)]);
let phoneSeq = 100;
const details = (over = {}) => ({ id: randomUUID(), patient_name: 'Synthetic child', contact_name: 'Synthetic parent', national_id: '123456782', phone: `+9725000${String(++phoneSeq).padStart(5, '0')}`, language: 'he', consent: 'true', website: '', ...over });
function multipart(fields, file) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  if (file) form.set('referral', new File([file.bytes], file.name ?? 'referral.pdf', { type: file.type ?? 'application/pdf' }));
  return new NextRequest(`${origin}/api/moxo/requests`, { method: 'POST', headers: { origin }, body: form });
}
const row = async id => (await pg.query('select * from moxo_requests where id=$1', [id])).rows[0];

before(async () => {
  await pg.exec('create role anon;create role authenticated;create role service_role;');
  await pg.exec(fs.readFileSync(path.join(root, 'db/migrations/20260909_moxo_requests.sql'), 'utf8'));
  for (const file of ['20260912062810_clinic_self_service.sql', '20261002193341_therapists_and_treatment_workflow.sql', '20261008052117_therapist_parent_booking.sql', '20261105120000_therapist_booking_mode.sql', '20261106150000_booking_profile_contact_phone.sql', '20261002213054_moxo_tuesday_thursday_hourly.sql', '20261111110000_request_national_ids.sql'])
    await pg.exec(fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8'));
  // A request saved before this change must survive the migration untouched.
  await pg.query("select submit_identified_moxo($1,'Earlier child','Earlier parent','+972500000001','he',null,null,'123456782')", ['00000000-0000-4000-8000-000000000001']);
  await pg.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261124120000_moxo_referral_upload.sql'), 'utf8'));
  await pg.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261124140000_moxo_via_maccabi.sql'), 'utf8'));
});

test('the migration is additive and keeps the referral columns consistent', async () => {
  const earlier = await row('00000000-0000-4000-8000-000000000001');
  assert.equal(earlier.status, 'pending'); assert.equal(earlier.via_maccabi, false); assert.equal(earlier.referral_path, null); assert.equal(earlier.referral_type, null); assert.equal(earlier.referral_uploaded_at, null);
  await assert.rejects(pg.query("update moxo_requests set referral_path='moxo/x/referral.pdf' where id=$1", [earlier.id]), /moxo_requests_referral_complete/);
  await assert.rejects(pg.query("update moxo_requests set referral_path='moxo/x/referral.gif',referral_type='image/gif',referral_uploaded_at=now() where id=$1", [earlier.id]), /referral_type/);
});

test('a request with an attached referral stores the file beside the request', async () => {
  const db = makeDb(), route = publicRoute(db), d = details();
  const res = await route.POST(multipart(d, { bytes: PDF }));
  assert.equal(res.status, 200); assert.deepEqual(await res.json(), { received: true, status: 'pending', reference: d.id, referral: 'stored' });
  const saved = await row(d.id);
  assert.equal(saved.referral_path, `moxo/${d.id}/referral.pdf`); assert.equal(saved.referral_type, 'application/pdf'); assert.ok(saved.referral_uploaded_at); assert.equal(saved.national_id, '123456782');
  assert.deepEqual(db.stored.get(`adhd-payments/moxo/${d.id}/referral.pdf`), { size: PDF.length, type: 'application/pdf' });
  // The same request sent again (lost reply, double tap) neither fails nor stores the file twice.
  const again = await route.POST(multipart(d, { bytes: PDF }));
  assert.equal(again.status, 200); assert.equal((await again.json()).referral, 'stored'); assert.equal(db.uploads.length, 1);
});

test('through Maccabi the referral is mandatory: without it nothing is saved', async () => {
  const db = makeDb(), route = publicRoute(db), d = details({ via_maccabi: 'true' });
  const res = await route.POST(multipart(d));
  assert.equal(res.status, 400); assert.equal((await res.json()).error, 'referral_required'); assert.equal(await row(d.id), undefined);
  // The JSON form of the request cannot carry a file, so it cannot ask through Maccabi either.
  const j = details(), json = await route.POST(new NextRequest(`${origin}/api/moxo/requests`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ ...j, consent: true, via_maccabi: true }) }));
  assert.equal(json.status, 400); assert.equal((await json.json()).error, 'referral_required'); assert.equal(await row(j.id), undefined);
  // With the referral the request is saved and marked for the eligibility check.
  const ok = await route.POST(multipart(d, { bytes: PDF }));
  assert.equal(ok.status, 200); assert.equal((await ok.json()).referral, 'stored');
  const saved = await row(d.id); assert.equal(saved.via_maccabi, true); assert.equal(saved.referral_path, `moxo/${d.id}/referral.pdf`);
  // A request that does not ask through Maccabi stays unmarked, with or without a file.
  const plain = details({ via_maccabi: 'false' }); assert.equal((await route.POST(multipart(plain, { bytes: PDF }))).status, 200); assert.equal((await row(plain.id)).via_maccabi, false);
});

test('the type is read from the file itself, not from its name', async () => {
  const db = makeDb(), route = publicRoute(db), d = details();
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 1)]);
  const res = await route.POST(multipart(d, { bytes: jpeg, name: 'scan.pdf', type: 'application/pdf' }));
  assert.equal((await res.json()).referral, 'stored'); assert.equal((await row(d.id)).referral_path, `moxo/${d.id}/referral.jpg`);
});

test('a request without a file, and the earlier JSON form of the request, still work', async () => {
  const db = makeDb(), route = publicRoute(db), d = details();
  const res = await route.POST(multipart(d));
  assert.equal(res.status, 200); assert.deepEqual(await res.json(), { received: true, status: 'pending', reference: d.id }); assert.equal((await row(d.id)).referral_path, null); assert.equal(db.uploads.length, 0);
  const j = details();
  const json = await route.POST(new NextRequest(`${origin}/api/moxo/requests`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ ...j, consent: true }) }));
  assert.equal(json.status, 200); assert.deepEqual(await json.json(), { received: true, status: 'pending', reference: j.id });
});

test('a file that is not a photo or a PDF, or is too large, is refused before anything is saved', async () => {
  const db = makeDb(), route = publicRoute(db);
  const bad = details(), res = await route.POST(multipart(bad, { bytes: Buffer.alloc(500, 0x41), name: 'referral.pdf' }));
  assert.equal(res.status, 400); assert.equal((await res.json()).error, 'invalid_file'); assert.equal(await row(bad.id), undefined);
  const big = details(), large = await route.POST(multipart(big, { bytes: Buffer.concat([PDF, Buffer.alloc(MAX_REFERRAL_BYTES)]) }));
  assert.equal(large.status, 413); assert.equal((await large.json()).error, 'too_large'); assert.equal(await row(big.id), undefined);
  assert.equal(db.uploads.length, 0);
});

test('invalid details are refused even with a valid file', async () => {
  const db = makeDb(), route = publicRoute(db);
  for (const over of [{ national_id: '123456789' }, { consent: 'false' }, { phone: '+97240000000' }, { website: 'x' }]) {
    const d = details(over), res = await route.POST(multipart(d, { bytes: PDF }));
    assert.equal(res.status, 400); assert.equal(await row(d.id), undefined);
  }
  const foreign = multipart(details(), { bytes: PDF }); foreign.headers.set('origin', 'https://elsewhere.test');
  assert.equal((await route.POST(foreign)).status, 403); assert.equal(db.uploads.length, 0);
});

test('when the file cannot be stored the request is kept and the family is told', async () => {
  const db = makeDb({ failUpload: true }), route = publicRoute(db), d = details();
  const res = await route.POST(multipart(d, { bytes: PDF }));
  assert.equal(res.status, 200); assert.deepEqual(await res.json(), { received: true, status: 'pending', reference: d.id, referral: 'not_stored' });
  const saved = await row(d.id); assert.equal(saved.status, 'pending'); assert.equal(saved.referral_path, null);
});

test('past the daily cap the request is kept without the file', async () => {
  const before = (await pg.query('select count(*)::int n from moxo_requests where referral_uploaded_at is not null')).rows[0].n;
  for (let i = before; i < MAX_REFERRALS_PER_DAY; i++)
    await pg.query("insert into moxo_requests(id,patient_name,contact_name,phone,language,referral_path,referral_type,referral_uploaded_at) values($1,'Cap child','Cap parent',$2,'he',$3,'application/pdf',now())", [randomUUID(), `+9725100${String(i).padStart(5, '0')}`, `moxo/cap-${i}/referral.pdf`]);
  const db = makeDb(), route = publicRoute(db), d = details();
  const res = await route.POST(multipart(d, { bytes: PDF }));
  assert.equal(res.status, 200); assert.equal((await res.json()).referral, 'not_stored'); assert.equal(db.uploads.length, 0); assert.equal((await row(d.id)).referral_path, null);
  await pg.query("delete from moxo_requests where patient_name='Cap child'");
});

test('staff open the referral through a short-lived link, and each opening is recorded', async () => {
  const db = makeDb(), d = details();
  assert.equal((await (await publicRoute(db).POST(multipart(d, { bytes: PDF }))).json()).referral, 'stored');
  const none = details(); await publicRoute(db).POST(multipart(none));
  let staff = null;
  const admin = compile('app/api/admin/moxo/route.ts', { '@/lib/supabase': { getSupabaseAdmin: () => db }, '@/lib/admin/auth': { getCurrentStaff: async () => staff }, '@/lib/moxo/notification': { notifyOnce: async () => 'accepted' }, '@/lib/google-calendar': { getCalendarId: () => 'institute' }, '@/lib/moxo/calendar': { syncMoxoCalendar: async () => 'synced' } });
  const ask = id => admin.POST(new NextRequest(`${origin}/api/admin/moxo`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ id, action: 'referral' }) }));
  assert.equal((await ask(d.id)).status, 403); assert.equal(db.audit.length, 0);
  staff = { id: randomUUID(), role: 'assistant' };
  assert.equal((await ask(none.id)).status, 404); assert.equal((await ask(randomUUID())).status, 404);
  const res = await ask(d.id); assert.equal(res.status, 200);
  assert.equal((await res.json()).url, `https://files.test/moxo/${d.id}/referral.pdf?ttl=300`);
  assert.deepEqual(db.audit, [{ actor_id: staff.id, actor_type: 'user', action: 'moxo_referral_viewed', entity_type: 'moxo_request', entity_id: d.id, metadata: {} }]);
});

test('the form offers the file in three languages and sends it with the request', () => {
  const form = fs.readFileSync(path.join(root, 'components/moxo/RequestForm.tsx'), 'utf8');
  assert.match(form, /name="referral" type="file" required=\{maccabi\} accept="image\/\*,application\/pdf"/);
  assert.match(form, /data\.set\('referral',file\)/);
  for (const key of [",file:'", ",fileHint:'", ",successFile:'", ",successNoFile:'", ",badFile:'", ",bigFile:'"]) assert.equal(form.split(key).length - 1, 3, key);
  // Mandatory only when the family asks through Maccabi; otherwise the referral may still be sent on WhatsApp.
  assert.match(form, /name="via_maccabi" type="checkbox" checked=\{maccabi\}/);
  assert.match(form, /name="referral" type="file" required=\{maccabi\}/);
  assert.match(form, /if\(maccabi&&!file\)\{setError\('needFile'\);return;\}/);
  for (const key of [",viaMaccabi:'", ",fileRequired:'", ",needFile:'"]) assert.equal(form.split(key).length - 1, 3, key);
});
