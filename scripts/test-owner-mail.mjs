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
const copy = load('lib/therapists/owner-mail-test-copy.ts');
function setup(role = 'admin', options = {}) {
  const calls = [];
  const route = load('app/api/admin/mail-test/route.ts', {
    '@/lib/admin/auth': { getCurrentStaff: async () => role ? { role } : null },
    '@/lib/therapists/owner-mail-test-copy': copy,
    '@/lib/therapists/mail': {
      mailConfigured: () => true,
      emailOnce: async (...args) => { calls.push(args); if (options.fail) throw Error('private provider details'); return 'accepted'; },
    },
    '@/lib/supabase': { getSupabaseAdmin: () => ({ from: table => {
      assert.equal(table, 'clinic_notifications');
      return { select: fields => { assert.equal(fields, 'state'); return {
        eq: (field, id) => { assert.equal(field, 'id'); assert.equal(id, copy.OWNER_MAIL_TEST.id);
          return { maybeSingle: async () => ({ data: options.state ? { state: options.state } : null, error: options.dbError }) }; },
      }; } };
    } }) },
  });
  return { route, calls };
}
const req = (body = { confirm: true }, origin = 'https://app.magickidsinstitute.com') => ({
  headers: new Headers({ origin }), nextUrl: new URL('https://app.magickidsinstitute.com/api/admin/mail-test'),
  json: async () => body,
});
test('admin-only GET and POST; no provider operations for other roles', async () => {
  for (const role of [null, 'assistant', 'diagnostician']) {
    const { route, calls } = setup(role);
    assert.equal((await route.GET()).status, 403);
    assert.equal((await route.POST(req())).status, 403);
    assert.equal(calls.length, 0);
  }
});
test('reject foreign origin and any destination/content override', async () => {
  const { route, calls } = setup();
  assert.equal((await route.POST(req({ confirm: true }, 'https://evil.test'))).status, 403);
  for (const body of [null, {}, { confirm: false }, { confirm: true, to: 'other@example.test' }, { confirm: true, body: 'changed' }])
    assert.equal((await route.POST(req(body))).status, 400);
  assert.equal(calls.length, 0);
});
test('GET never sends and only reads the fixed test state', async () => {
  const { route, calls } = setup('admin', { state: 'accepted' });
  const result = await route.GET();
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await result.json(), { state: 'accepted', configured: true });
  assert.equal(calls.length, 0);
});
test('POST uses exact approved owner recipient, subject, body and stable dedup key', async () => {
  const { route, calls } = setup();
  assert.deepEqual(await (await route.POST(req())).json(), { state: 'accepted' });
  const t = copy.OWNER_MAIL_TEST;
  assert.deepEqual(calls, [[t.id, 'bnamouz@gmail.com', 'Magic Kids | בדיקת הודעת אישור תור', t.body]]);
  assert.equal(t.sender, 'magickids@magickidsinstitute.com');
  assert.match(t.body, /אין זה אישור לתור אמיתי/);
});
test('failure is unknown, never leaks provider diagnostics', async () => {
  const { route, calls } = setup('admin', { fail: true });
  assert.deepEqual(await (await route.POST(req())).json(), { state: 'unknown' });
  assert.equal(calls.length, 1);
  const broken = setup('admin', { dbError: { message: 'private' } });
  assert.deepEqual(await (await broken.route.GET()).json(), { state: 'unavailable' });
});
test('shared provider helper still locks before send and does not retry', () => {
  const source = fs.readFileSync('lib/therapists/mail.ts', 'utf8');
  assert.match(source, /ignoreDuplicates:true/);
  assert.match(source, /eq\('state','pending'\)/);
  assert.match(source, /if\(!claim\.data\)/);
  assert.match(source, /retry:false/);
  assert.match(source, /subject:sender/);
});
