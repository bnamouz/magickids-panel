import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const m = { exports: {} };
  new Function('require', 'module', 'exports', code)(n => mocks[n] ?? require(n), m, m.exports);
  return m.exports;
}
const copy = load('lib/appointments/owner-whatsapp-test.ts');
function setup(role = 'admin', options = {}) {
  const calls = [], identities = [];
  const route = load('app/api/admin/whatsapp-test/route.ts', {
    '@/lib/admin/auth': { getCurrentStaff: async () => role ? { role } : null },
    '@/lib/appointments/owner-whatsapp-test': copy,
    '@/lib/appointments/owner-whatsapp-identity': { ownerWhatsAppIdentity: async () => { identities.push(1); return options.identity ?? 'verified'; } },
    '@/lib/appointments/magic-kids-whatsapp': { notifyMagicKidsOnce: async (...args) => { calls.push(args); if (options.fail) throw Error('private'); return 'accepted'; } },
    '@/lib/supabase': { getSupabaseAdmin: () => ({ from: table => {
      assert.equal(table, 'clinic_notifications');
      return { select: fields => { assert.equal(fields, 'state'); return {
        eq: (field, id) => { assert.equal(field, 'id'); assert.equal(id, copy.OWNER_WHATSAPP_TEST.id);
          return { maybeSingle: async () => ({ data: options.state ? { state: options.state } : null, error: options.dbError }) }; },
      }; } };
    } }) },
  });
  return { route, calls, identities };
}
const req = (body = { confirm: true }, origin = 'https://app.magickidsinstitute.com') => ({
  headers: new Headers({ origin }), nextUrl: new URL('https://app.magickidsinstitute.com/api/admin/whatsapp-test'),
  json: async () => body,
});
test('admin-only; no provider identity or sends for other roles', async () => {
  for (const role of [null, 'assistant', 'diagnostician']) {
    const f = setup(role);
    assert.equal((await f.route.GET()).status, 403);
    assert.equal((await f.route.POST(req())).status, 403);
    assert.equal(f.calls.length + f.identities.length, 0);
  }
});
test('reject foreign origin, malformed approval and all overrides', async () => {
  const f = setup();
  assert.equal((await f.route.POST(req({ confirm: true }, 'https://evil.test'))).status, 403);
  for (const body of [null, {}, [], 'true', { confirm: false }, { confirm: true, to: 'other' }, { confirm: true, body: 'other' }])
    assert.equal((await f.route.POST(req(body))).status, 400);
  assert.equal(f.calls.length + f.identities.length, 0);
});
test('GET never sends; reports identity and fixed test only', async () => {
  const f = setup('admin', { state: 'accepted' });
  const r = await f.route.GET();
  assert.match(r.headers.get('Cache-Control'), /private, no-store/);
  assert.deepEqual(await r.json(), { state: 'accepted', identity: 'verified', configured: true });
  assert.equal(f.calls.length, 0);
});
test('POST uses exact owner recipient, text and stable ID', async () => {
  const f = setup();
  assert.deepEqual(await (await f.route.POST(req())).json(), { state: 'accepted' });
  const t = copy.OWNER_WHATSAPP_TEST;
  assert.deepEqual(f.calls, [[t.id, '+972509955137', t.body]]);
  assert.equal(t.sender, '+972544020043');
  assert.match(t.body, /אין זה אישור לתור אמיתי/);
});
test('identity failure and database error fail closed', async () => {
  for (const identity of ['identity_mismatch', 'identity_unavailable', 'not_configured']) {
    const f = setup('admin', { identity });
    assert.equal((await f.route.POST(req())).status, 503);
    assert.equal(f.calls.length, 0);
  }
  const f = setup('admin', { dbError: true });
  assert.equal((await f.route.GET()).status, 503);
  assert.equal((await f.route.POST(req())).status, 503);
  assert.equal(f.calls.length + f.identities.length, 0);
});
test('accepted, sending and unknown never resend', async () => {
  for (const state of ['accepted', 'sending', 'unknown']) {
    const f = setup('admin', { state });
    assert.deepEqual(await (await f.route.POST(req())).json(), { state });
    assert.equal(f.calls.length + f.identities.length, 0);
  }
});
test('provider exceptions sanitized as unknown', async () => {
  const f = setup('admin', { fail: true });
  assert.deepEqual(await (await f.route.POST(req())).json(), { state: 'unknown' });
});
test('identity verifies exact instance and sender; network failures never leak token', async () => {
  const original = global.fetch;
  const oldInstance = process.env.MAGIC_KIDS_ULTRAMSG_INSTANCE_ID, oldToken = process.env.MAGIC_KIDS_ULTRAMSG_TOKEN;
  const mod = load('lib/appointments/owner-whatsapp-identity.ts', { './owner-whatsapp-test': copy });
  let calls = 0;
  try {
    global.fetch = async (url, opts) => {
      calls++; assert.equal(url.origin, 'https://api.ultramsg.com');
      assert.equal(opts.redirect, 'error'); assert.equal(opts.cache, 'no-store');
      return { ok: true, json: async () => ({ id: '972544020043@c.us' }) };
    };
    delete process.env.MAGIC_KIDS_ULTRAMSG_TOKEN;
    assert.equal(await mod.ownerWhatsAppIdentity(), 'not_configured');
    process.env.MAGIC_KIDS_ULTRAMSG_TOKEN = 'synthetic-test-only';
    process.env.MAGIC_KIDS_ULTRAMSG_INSTANCE_ID = 'wrong';
    assert.equal(await mod.ownerWhatsAppIdentity(), 'identity_mismatch'); assert.equal(calls, 0);
    process.env.MAGIC_KIDS_ULTRAMSG_INSTANCE_ID = 'instance173060';
    assert.equal(await mod.ownerWhatsAppIdentity(), 'verified');
    global.fetch = async () => ({ ok: true, json: async () => ({ id: '972500000000@c.us' }) });
    assert.equal(await mod.ownerWhatsAppIdentity(), 'identity_mismatch');
    global.fetch = async () => ({ ok: true, json: async () => ({ error: 'private' }) });
    assert.equal(await mod.ownerWhatsAppIdentity(), 'identity_unavailable');
    global.fetch = async () => { throw Error('secret'); };
    assert.equal(await mod.ownerWhatsAppIdentity(), 'identity_unavailable');
  } finally {
    global.fetch = original;
    if (oldInstance === undefined) delete process.env.MAGIC_KIDS_ULTRAMSG_INSTANCE_ID; else process.env.MAGIC_KIDS_ULTRAMSG_INSTANCE_ID = oldInstance;
    if (oldToken === undefined) delete process.env.MAGIC_KIDS_ULTRAMSG_TOKEN; else process.env.MAGIC_KIDS_ULTRAMSG_TOKEN = oldToken;
  }
});
