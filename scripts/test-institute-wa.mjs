import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
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
const g = compile('lib/institute-wa/guards.ts');
const r = compile('lib/institute-wa/reply.ts');
const { processEvent } = compile('lib/institute-wa/process.ts');

let seq = 0;
const payload = ({ event = 'message_received', from = '972501234567@c.us', to = '972544020043@c.us', fromMe = false, body = 'שלום, איך פותחים תיק לאבחון קשב?', type = 'chat', id, pushname = 'הורה', referenceId, instanceId = '173060' } = {}) =>
  ({ event_type: event, instanceId, referenceId, data: { id: id ?? `${fromMe}_${fromMe ? to : from}_${++seq}`, from, to, author: '', pushname, type, body, fromMe, time: 1 } });
const ev = (o) => g.parseEvent(payload(o));
const cfg = (over = {}) => ({ ...g.readConfig({}), ...over });

test('webhook auth: constant-time secret and instance id', () => {
  assert.equal(g.secretMatches('abc', 'abc'), true);
  assert.equal(g.secretMatches('abd', 'abc'), false);
  assert.equal(g.secretMatches('abc', undefined), false);
  assert.equal(g.secretMatches('', ''), false);
  assert.equal(g.secretMatches(null, 'abc'), false);
  assert.equal(g.instanceMatches('173060', 'instance173060'), true);
  assert.equal(g.instanceMatches('instance173060', 'instance173060'), true);
  assert.equal(g.instanceMatches('1150', 'instance173060'), false);
  assert.equal(g.instanceMatches('', 'instance173060'), false);
  assert.equal(g.instanceMatches(undefined, undefined), false);
});

test('mode parsing defaults to shadow; config caps are bounded', () => {
  assert.equal(g.parseMode(undefined), 'shadow');
  assert.equal(g.parseMode('ON'), 'on');
  assert.equal(g.parseMode('off'), 'off');
  assert.equal(g.parseMode('yes'), 'shadow');
  const c = g.readConfig({ INSTITUTE_WA_CHAT_CAP: '999', INSTITUTE_WA_IGNORE: '0521111111, 972522222222' });
  assert.equal(c.chatCap, 5); assert.equal(c.windowMinutes, 60); assert.equal(c.takeoverHours, 12);
  assert.deepEqual(c.ignore, ['972521111111', '972522222222']);
});

test('guards ignore groups, status, newsletters, own/internal numbers, envelopes and @lid', () => {
  const c = cfg({ ignore: ['972521111111'] });
  assert.equal(g.ignoreReason(ev({}), c), null);
  assert.equal(g.ignoreReason(ev({ from: '120363000000@g.us' }), c), 'non_direct');
  assert.equal(g.ignoreReason(ev({ from: 'status@broadcast' }), c), 'non_direct');
  assert.equal(g.ignoreReason(ev({ from: '120363@newsletter' }), c), 'non_direct');
  assert.equal(g.ignoreReason(ev({ from: '163969486553100@lid' }), c), 'non_direct');
  assert.equal(g.ignoreReason(ev({ from: '972544020043@c.us' }), c), 'internal_number');
  assert.equal(g.ignoreReason(ev({ from: '972509955137@c.us' }), c), 'internal_number');
  assert.equal(g.ignoreReason(ev({ from: '972543496656@c.us' }), c), 'internal_number');
  assert.equal(g.ignoreReason(ev({ from: '972521111111@c.us' }), c), 'internal_number');
  assert.equal(g.ignoreReason(ev({ fromMe: true, to: '972509955137@c.us', from: '972544020043@c.us' }), c), 'internal_number');
  assert.equal(g.ignoreReason(ev({ pushname: 'מכון ילדי הקסם' }), c), 'internal_name');
  assert.equal(g.ignoreReason(ev({ body: '💬 *הודעה חדשה* מ...' }), c), 'bot_envelope');
  assert.equal(g.ignoreReason(ev({ body: 'שלום' + g.BOT_MARKER }), c), 'bot_envelope');
  assert.equal(g.ignoreReason(ev({ event: 'message_ack' }), c), 'not_message_event');
  assert.equal(g.parseEvent({}), null);
  const noId = payload({}); delete noId.data.id;
  assert.equal(g.ignoreReason(g.parseEvent(noId), c), 'no_provider_id');
});

test('outgoing classification: bot echo vs staff typing', () => {
  const recent = [{ reference_id: 'mkbot-abc', body: 'תשובה' + g.BOT_MARKER }];
  assert.equal(g.classifyOutgoing(ev({ fromMe: true, body: 'x' + g.BOT_MARKER }), []), 'bot_echo');
  assert.equal(g.classifyOutgoing(ev({ fromMe: true, body: 'x', referenceId: 'mkbot-zzz' }), []), 'bot_echo');
  assert.equal(g.classifyOutgoing(ev({ fromMe: true, body: 'תשובה' }), recent), 'bot_echo');
  assert.equal(g.classifyOutgoing(ev({ fromMe: true, body: 'היי, כאן נוואל מהמכון' }), recent), 'staff');
});

test('language and staff triggers', () => {
  assert.equal(g.detectLanguage('مرحبا بدي موعد'), 'ar');
  assert.equal(g.detectLanguage('שלום'), 'he');
  assert.equal(g.detectLanguage('hello'), 'he');
  assert.equal(g.staffTrigger('זה דחוף מאוד'), 'urgent');
  assert.equal(g.staffTrigger('بدي تقرير من الدكتور'), 'document_request');
  assert.equal(g.staffTrigger('אני רוצה להגיש תלונה'), 'complaint');
  assert.equal(g.staffTrigger('מה שעות הפעילות?'), null);
});

test('model JSON validation: approved link keys only, URLs stripped', () => {
  assert.equal(r.validateModelReply('not json'), null);
  assert.equal(r.validateModelReply({ reply: 5 }), null);
  assert.equal(r.validateModelReply({ reply: '' }), null);
  const v = r.validateModelReply(JSON.stringify({ reply: 'אפשר לפתוח תיק כאן https://evil.example/x ובאתר www.bad.co', link_keys: ['adhd_registration', 'evil', 'moxo', 'classes', 'workshops'], needs_staff: false, reason: 'x' }));
  assert.ok(v);
  assert.deepEqual(v.link_keys, ['adhd_registration', 'moxo', 'classes']);
  assert.doesNotMatch(v.reply, /http|www\./);
  const staff = r.validateModelReply({ reply: '', needs_staff: true, reason: 'בקשת מסמך' });
  assert.equal(staff.needs_staff, true);
});

test('composed message ends links with the institute website and carries the bot marker', () => {
  const m = r.composeMessage({ reply: 'הנה הקישור', linkKeys: ['moxo'], lang: 'he' });
  assert.match(m, /app\.magickidsinstitute\.com\/moxo\?lang=he&utm_source=whatsapp_bot/);
  assert.ok(m.indexOf('www.magickidsinstitute.com') > m.indexOf('/moxo'));
  assert.ok(m.endsWith(g.BOT_MARKER));
  assert.equal(g.isGeneratedEnvelope(m), true);
  const plain = r.composeMessage({ reply: 'שלום', linkKeys: [], lang: 'ar' });
  assert.doesNotMatch(plain, /https?:/);
  const sys = r.buildSystemPrompt('ar');
  assert.match(sys, /ערבית פלסטינית/); assert.match(sys, /adhd_registration/);
});

// ---- Full processing against the real migration (PGlite) ----
async function setup() {
  const pg = new PGlite();
  await pg.exec('create role anon; create role authenticated; create role service_role;');
  await pg.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261120120000_institute_whatsapp_bot.sql'), 'utf8'));
  const q = async (sql, params = []) => (await pg.query(sql, params)).rows;
  const store = {
    async claim(row) {
      const prev = (await q('select chat_phone,paused_until,needs_staff,language from institute_wa_chats where chat_phone=$1', [row.chat_phone]))[0] ?? null;
      await q(`insert into institute_wa_chats(chat_phone,chat_id,name,last_inbound_at,last_preview) values($1,$2,nullif($3,''),case when $4='inbound' then now() end,$5)
        on conflict(chat_phone) do update set name=coalesce(excluded.name,institute_wa_chats.name), last_inbound_at=coalesce(excluded.last_inbound_at,institute_wa_chats.last_inbound_at)`, [row.chat_phone, row.chat_id, row.name, row.direction, row.body.slice(0, 200)]);
      try {
        const [m] = await q('insert into institute_wa_messages(chat_phone,direction,status,provider_id,body,type,mode,meta) values($1,$2,$3,$4,$5,$6,$7,$8) returning id', [row.chat_phone, row.direction, row.status, row.provider_id, row.body, row.type, row.mode, row.meta]);
        return { status: 'claimed', id: m.id, previous: prev && { ...prev, paused_until: prev.paused_until?.toISOString?.() ?? prev.paused_until } };
      } catch (e) { if (e.code === '23505') return { status: 'duplicate' }; throw e; }
    },
    recentBot: (c) => q("select id,reference_id,body from institute_wa_messages where chat_phone=$1 and direction='bot' and created_at>now()-interval '30 minutes'", [c]),
    async updateMessage(id, p) { await q('update institute_wa_messages set status=coalesce($2,status), send_id=coalesce($3,send_id), meta=meta||$4 where id=$1', [id, p.status ?? null, p.send_id ?? null, p.meta ?? {}]); },
    history: (c, n, ex) => q("select direction,body,status from (select * from institute_wa_messages where chat_phone=$1 and id<>$3 and direction in ('inbound','bot','staff') order by created_at desc limit $2) x order by created_at", [c, n, ex]),
    async pause(c, until, reason) { await q('update institute_wa_chats set paused_until=$2, paused_reason=$3 where chat_phone=$1', [c, until.toISOString(), reason]); },
    async flag(c, reason) { await q('update institute_wa_chats set needs_staff=true, staff_reason=$2 where chat_phone=$1', [c, reason]); },
    async reserve(a) { return (await q('select institute_wa_reserve_reply($1,$2,$3,$4,$5,$6,$7,$8) as r', [a.chat_phone, a.body, a.mode, a.type, a.chatCap, a.globalCap, a.windowMinutes, a.meta]))[0].r; },
  };
  const sent = [];
  const send = async (m) => { sent.push(m); return { ok: true, id: String(1000 + sent.length) }; };
  let modelCalls = 0;
  let modelOut = { reply: 'אפשר לפתוח תיק בקישור.', link_keys: ['adhd_registration'], needs_staff: false, reason: 'info' };
  const model = async (messages) => { modelCalls++; assert.equal(messages[0].role, 'system'); return typeof modelOut === 'function' ? modelOut(messages) : modelOut; };
  const deps = (over = {}) => ({ store, send, model, config: cfg({ mode: 'on' }), now: () => new Date('2026-11-17T10:00:00Z'), ...over });
  return { pg, q, store, sent, deps, setModel: (m) => { modelOut = m; }, calls: () => modelCalls };
}

test('dedupe: the same provider id (retry or received+create pair) replies once', async () => {
  const t = await setup();
  const p = payload({ id: 'false_972501234567@c.us_DUP1' });
  assert.equal((await processEvent(g.parseEvent(p), t.deps())).action, 'sent');
  assert.equal((await processEvent(g.parseEvent(p), t.deps())).action, 'duplicate');
  assert.equal((await processEvent(g.parseEvent({ ...p, event_type: 'message_create' }), t.deps())).action, 'duplicate');
  assert.equal(t.sent.length, 1);
  assert.equal(t.sent[0].toPhone, '+972501234567');
  assert.match(t.sent[0].referenceId, /^mkbot-[0-9a-f]{32}$/);
  assert.match(t.sent[0].body, /onboarding\/public/);
  const [row] = await t.q("select status,send_id from institute_wa_messages where direction='bot'");
  assert.deepEqual(row, { status: 'sent', send_id: '1001' });
});

test('modes: off logs only; shadow stores a draft and never sends', async () => {
  const t = await setup();
  const off = await processEvent(ev({ from: '972501111111@c.us' }), t.deps({ config: cfg({ mode: 'off' }) }));
  assert.equal(off.action, 'logged');
  assert.equal(t.calls(), 0);
  const sh = await processEvent(ev({ from: '972502222222@c.us' }), t.deps({ config: cfg({ mode: 'shadow' }) }));
  assert.equal(sh.action, 'shadow');
  assert.equal(t.sent.length, 0);
  const rows = await t.q("select direction,status,mode from institute_wa_messages order by created_at");
  assert.deepEqual(rows.map(x => `${x.direction}:${x.status}:${x.mode}`), ['inbound:received:off', 'inbound:received:shadow', 'bot:shadow:shadow']);
});

test('loop proof: our own reply echoes are never answered and do not pause the chat', async () => {
  const t = await setup();
  await processEvent(ev({ id: 'in1' }), t.deps());
  const reply = t.sent[0];
  // message_create echo of our reply (fromMe, carrying the referenceId and marker)
  assert.equal((await processEvent(ev({ event: 'message_create', fromMe: true, from: '972544020043@c.us', to: '972501234567@c.us', body: reply.body, referenceId: reply.referenceId }), t.deps())).action, 'bot_echo');
  // Echo without referenceId still recognised by marker / recorded body
  assert.equal((await processEvent(ev({ event: 'message_create', fromMe: true, from: '972544020043@c.us', to: '972501234567@c.us', body: reply.body.replace(g.BOT_MARKER, '') }), t.deps())).action, 'bot_echo');
  // Echo misreported as an incoming message from our own number / with our marker
  assert.equal((await processEvent(ev({ from: '972544020043@c.us', body: reply.body }), t.deps())).reason, 'internal_number');
  assert.equal((await processEvent(ev({ body: reply.body }), t.deps())).reason, 'bot_envelope');
  const [chat] = await t.q('select paused_until from institute_wa_chats');
  assert.equal(chat.paused_until, null);
  assert.equal(t.sent.length, 1);
  // Nothing was ever sent anywhere except the family that wrote.
  assert.ok(t.sent.every(m => m.toPhone === '+972501234567'));
});

test('human takeover: staff typing pauses the bot for 12h in that chat only', async () => {
  const t = await setup();
  await processEvent(ev({}), t.deps());
  const take = await processEvent(ev({ event: 'message_create', fromMe: true, from: '972544020043@c.us', to: '972501234567@c.us', body: 'היי, כאן נוואל מהמכון' }), t.deps());
  assert.equal(take.action, 'staff_takeover');
  assert.equal(take.reason, '2026-11-17T22:00:00.000Z');
  const later = await processEvent(ev({ body: 'תודה!' }), t.deps());
  assert.deepEqual(later, { action: 'skipped', reason: 'paused' });
  assert.equal((await processEvent(ev({ from: '972507777777@c.us' }), t.deps())).action, 'sent');
  assert.equal(t.sent.length, 2);
  // After the pause expires, the bot answers again.
  assert.equal((await processEvent(ev({ body: 'עוד שאלה' }), t.deps({ now: () => new Date('2026-11-18T10:00:00Z') }))).action, 'sent');
});

test('per-chat cap: 5 replies per window, then silent and flagged for staff', async () => {
  const t = await setup();
  const outcomes = [];
  for (let i = 0; i < 8; i++) outcomes.push((await processEvent(ev({ body: `שאלה ${i}` }), t.deps())).action + ':' + ((await t.q('select needs_staff from institute_wa_chats'))[0].needs_staff));
  assert.deepEqual(outcomes.slice(0, 5), Array(5).fill('sent:false'));
  assert.equal(outcomes[5], 'skipped:true');
  assert.deepEqual(outcomes.slice(6), ['skipped:true', 'skipped:true']);
  assert.equal(t.sent.length, 5);
  const [chat] = await t.q('select staff_reason from institute_wa_chats');
  assert.equal(chat.staff_reason, 'auto_reply_cap');
});

test('global cap per hour across chats', async () => {
  const t = await setup();
  const c = cfg({ mode: 'on', globalCap: 3 });
  const res = [];
  for (let i = 0; i < 5; i++) res.push((await processEvent(ev({ from: `97250000000${i}@c.us` }), t.deps({ config: c }))).reason ?? 'sent');
  assert.deepEqual(res, ['sent', 'sent', 'sent', 'global_cap', 'global_cap']);
  assert.equal(t.sent.length, 3);
});

test('AI failure sends nothing and flags; needs_staff and triggers flag with polite reply', async () => {
  const t = await setup();
  t.setModel(null);
  assert.deepEqual(await processEvent(ev({ from: '972501000001@c.us' }), t.deps()), { action: 'flagged', reason: 'ai_failed' });
  assert.equal(t.sent.length, 0);
  t.setModel({ reply: '', link_keys: [], needs_staff: true, reason: 'שאלה על תור קיים' });
  const s = await processEvent(ev({ from: '972501000002@c.us', body: 'מתי התור שלי?' }), t.deps());
  assert.equal(s.action, 'sent');
  assert.match(t.sent[0].body, /צוות המכון/);
  t.setModel({ reply: 'نعم', link_keys: [], needs_staff: false, reason: '' });
  await processEvent(ev({ from: '972501000003@c.us', body: 'بدي تقرير من الدكتور' }), t.deps());
  const flagged = await t.q('select chat_phone, staff_reason from institute_wa_chats where needs_staff order by chat_phone');
  assert.deepEqual(flagged.map(f => f.chat_phone), ['972501000001', '972501000002', '972501000003']);
  assert.match(flagged[2].staff_reason, /^document_request/);
  // Flagged chats stay silent until staff marks them handled.
  assert.equal((await processEvent(ev({ from: '972501000002@c.us', body: 'שוב' }), t.deps())).reason, 'needs_staff');
});

test('non-text messages get a short text request and are flagged; no model call', async () => {
  const t = await setup();
  const out = await processEvent(ev({ type: 'ptt', body: '' }), t.deps());
  assert.equal(out.action, 'sent');
  assert.equal(t.calls(), 0);
  assert.match(t.sent[0].body, /הודעות כתובות/);
  const [chat] = await t.q('select needs_staff, staff_reason from institute_wa_chats');
  assert.deepEqual(chat, { needs_staff: true, staff_reason: 'non_text:ptt' });
});

test('first message out of office hours mentions staff follow-up; history is passed to the model', async () => {
  const t = await setup();
  let seen;
  t.setModel((messages) => { seen = messages; return { reply: 'בשמחה', link_keys: [], needs_staff: false, reason: '' }; });
  const night = () => new Date('2026-11-20T21:00:00Z'); // Friday 23:00 Israel
  await processEvent(ev({ body: 'שאלה ראשונה' }), t.deps({ now: night }));
  await processEvent(ev({ body: 'שאלה שנייה' }), t.deps({ now: night }));
  assert.match(t.sent[0].body, /מחוץ לשעות הפעילות/);
  assert.doesNotMatch(t.sent[1].body, /מחוץ לשעות הפעילות/);
  assert.deepEqual(seen.slice(1).map(m => m.role), ['user', 'assistant', 'user']);
  assert.equal(seen.at(-1).content, 'שאלה שנייה');
  assert.equal(g.isOfficeHours(new Date('2026-11-17T10:00:00Z')), true);
});
