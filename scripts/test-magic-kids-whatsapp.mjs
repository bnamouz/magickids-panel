import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const m = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(n => mocks[n] ?? require(n), m, m.exports);
  return m.exports;
}
const copy = load('lib/appointments/owner-whatsapp-test.ts');
const key = copy.OWNER_WHATSAPP_TEST.id;
const phone = copy.OWNER_WHATSAPP_TEST.to;
const body = copy.OWNER_WHATSAPP_TEST.body;
function fixture(options = {}) {
  const states = new Map();
  let reads = 0;
  const db = { from(table) {
    reads++; assert.equal(table, 'clinic_notifications');
    const b = { filters: {}, patch: null,
      async upsert(row, opts) {
        assert.equal(opts.ignoreDuplicates, true);
        if (options.insertError) return { error: true };
        if (!states.has(row.id)) states.set(row.id, { state: 'pending' });
        return { error: null };
      },
      select() { return this; }, eq(k, v) { this.filters[k] = v; return this; },
      update(p) { this.patch = p; return this; },
      result() {
        const row = states.get(this.filters.id);
        if (this.patch) {
          if (this.patch.state === 'sending' && options.claimError) return { error: true };
          if (this.patch.state !== 'sending' && options.saveError) return { error: true };
          if (!row || (this.filters.state && row.state !== this.filters.state)) return { data: null, error: null };
          Object.assign(row, this.patch);
          return { data: { id: this.filters.id }, error: null };
        }
        return { data: row ?? null, error: options.readError };
      },
      async maybeSingle() { return this.result(); },
      then(resolve, reject) { return Promise.resolve(this.result()).then(resolve, reject); },
    }; return b;
  } };
  const mod = load('lib/appointments/magic-kids-whatsapp.ts', {
    '@/lib/supabase': { getSupabaseAdmin: () => db },
    './owner-whatsapp-test': copy,
    './owner-whatsapp-identity': { ownerWhatsAppIdentity: async () => options.identity ?? 'verified' },
  });
  return { mod, states, reads: () => reads };
}
async function isolated(fn) {
  const names = ['MAGIC_KIDS_ULTRAMSG_INSTANCE_ID', 'MAGIC_KIDS_ULTRAMSG_TOKEN', 'ULTRAMSG_INSTANCE_ID', 'ULTRAMSG_TOKEN'];
  const env = Object.fromEntries(names.map(n => [n, process.env[n]]));
  const oldFetch = global.fetch;
  const calls = [];
  process.env.MAGIC_KIDS_ULTRAMSG_INSTANCE_ID = 'instance173060';
  process.env.MAGIC_KIDS_ULTRAMSG_TOKEN = 'synthetic-institute-token';
  process.env.ULTRAMSG_INSTANCE_ID = 'instance174062';
  process.env.ULTRAMSG_TOKEN = 'synthetic-shared-token';
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ id: 1234 }) };
  };
  try { await fn(calls); } finally {
    global.fetch = oldFetch;
    for (const n of names) if (env[n] === undefined) delete process.env[n]; else process.env[n] = env[n];
  }
}
test('uses only dedicated credentials and keeps existing stable key', async () => isolated(async calls => {
  const f = fixture();
  assert.equal(await f.mod.notifyMagicKidsOnce(key, phone, body), 'accepted');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.ultramsg.com/instance173060/messages/chat');
  const params = new URLSearchParams(calls[0].options.body);
  assert.equal(params.get('token'), 'synthetic-institute-token');
  assert.equal(params.get('to'), phone); assert.equal(params.get('body'), body);
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(f.states.get(key).state, 'accepted');
  assert.equal(f.states.get(key).provider_id, '1234');
}));
test('parallel or repeated attempts claim once and never duplicate', async () => isolated(async calls => {
  const f = fixture();
  await Promise.all([f.mod.notifyMagicKidsOnce(key, phone, body), f.mod.notifyMagicKidsOnce(key, phone, body)]);
  assert.equal(await f.mod.notifyMagicKidsOnce(key, phone, body), 'accepted');
  assert.equal(calls.length, 1);
}));
test('missing dedicated credential never falls back to valid shared credentials', async () => isolated(async calls => {
  delete process.env.MAGIC_KIDS_ULTRAMSG_TOKEN;
  const f = fixture();
  assert.equal(await f.mod.notifyMagicKidsOnce(key, phone, body), 'not_configured');
  assert.equal(calls.length, 0); assert.equal(f.reads(), 0);
  const realIdentity = load('lib/appointments/owner-whatsapp-identity.ts', { './owner-whatsapp-test': copy });
  assert.equal(await realIdentity.ownerWhatsAppIdentity(), 'not_configured');
  assert.equal(calls.length, 0);
}));
test('identity mismatch/unavailable never claims or sends', async () => isolated(async calls => {
  for (const identity of ['identity_mismatch', 'identity_unavailable', 'not_configured']) {
    const f = fixture({ identity });
    assert.equal(await f.mod.notifyMagicKidsOnce(key, phone, body), identity);
    assert.equal(f.reads(), 0);
  }
  assert.equal(calls.length, 0);
}));
test('uncertain send is persisted and cannot be retried', async () => isolated(async () => {
  let sends = 0;
  global.fetch = async () => { sends++; throw Error('network lost with private detail'); };
  const f = fixture();
  assert.equal(await f.mod.notifyMagicKidsOnce(key, phone, body), 'unknown');
  assert.equal(await f.mod.notifyMagicKidsOnce(key, phone, body), 'unknown');
  assert.equal(sends, 1);
}));
test('claim or insert error blocks send; save error leaves sending claim intact', async () => isolated(async calls => {
  for (const opts of [{ insertError: true }, { claimError: true }]) {
    const f = fixture(opts);
    assert.equal(await f.mod.notifyMagicKidsOnce(key, phone, body), 'unavailable');
  }
  assert.equal(calls.length, 0);
  const f = fixture({ saveError: true });
  assert.equal(await f.mod.notifyMagicKidsOnce(key, phone, body), 'unknown');
  assert.equal(await f.mod.notifyMagicKidsOnce(key, phone, body), 'sending');
  assert.equal(calls.length, 1);
}));
test('dedicated helper accepts appointment namespace but not unrelated services', async () => isolated(async calls => {
  const f = fixture();
  assert.equal(await f.mod.notifyMagicKidsOnce('nour:123', phone, body), 'blocked');
  assert.equal(calls.length, 0);
  assert.equal(await f.mod.notifyMagicKidsOnce('appointment-confirmation:00000000-0000-4000-8000-000000000001:whatsapp', phone, body), 'accepted');
  assert.equal(calls.length, 1);
}));
test('only intended call sites use isolated sender; original helper remains shared', () => {
  assert.match(fs.readFileSync('lib/whatsapp-ultramsg.ts', 'utf8'), /process.env.ULTRAMSG_INSTANCE_ID/);
  assert.match(fs.readFileSync('lib/moxo/notification.ts', 'utf8'), /sendWhatsAppText/);
  for (const file of ['lib/appointments/confirmation.ts', 'app/api/admin/whatsapp-test/route.ts']) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /notifyMagicKidsOnce/);
    assert.doesNotMatch(source, /@\/lib\/moxo\/notification/);
  }
});
