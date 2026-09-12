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
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => name in overrides ? overrides[name] : require(name), module, module.exports);
  return module.exports;
}
const schedule = compile('lib/booking/schedule.ts');
const parentQuestions = compile('questions/vanderbilt_parent.ts');
const teacherQuestions = compile('questions/vanderbilt_teacher.ts');
const progress = compile('lib/intake/progress.ts', { '@/questions/vanderbilt_parent': parentQuestions, '@/questions/vanderbilt_teacher': teacherQuestions });
const fullForms = () => [parentQuestions.VANDERBILT_PARENT_QUESTIONS,teacherQuestions.VANDERBILT_TEACHER_QUESTIONS].map((questions,index)=>({ type:index===0?'vanderbilt_parent':'vanderbilt_teacher', is_complete:true, submitted_at:new Date().toISOString(), responses:Object.fromEntries(questions.map(q=>[q.id,q.section==='A'?0:1])) }));

test('Israel daylight saving and clinic windows', () => {
  assert.equal(schedule.localToUTC('2026-07-08', 960).toISOString(), '2026-07-08T13:00:00.000Z');
  assert.equal(schedule.localToUTC('2026-12-09', 960).toISOString(), '2026-12-09T14:00:00.000Z');
  const candidates = schedule.candidateSlots('adhd', new Date('2026-10-20T00:00:00Z'));
  assert.ok(candidates.some(slot => slot.endsWith('13:00:00.000Z')));
  assert.ok(candidates.some(slot => slot.endsWith('14:00:00.000Z')));
  for (const slot of candidates) {
    const local = schedule.localParts(new Date(slot));
    assert.equal(new Date(`${local.date}T12:00:00Z`).getUTCDay(), 3);
    assert.ok([960, 1020, 1080, 1140].includes(local.minutes));
  }
  const peds = schedule.candidateSlots('pediatrics', new Date('2026-09-07T06:00:00Z'));
  assert.ok(peds.every(slot => Date.parse(slot) >= Date.parse('2026-09-07T08:00:00Z')));
  assert.ok(!peds.some(slot => schedule.localParts(new Date(slot)).date === '2026-09-13'));
  const friday = peds.filter(slot => schedule.localParts(new Date(slot)).date === '2026-09-11');
  assert.equal(friday.length, 18);
  assert.deepEqual(friday.map(slot => schedule.localParts(new Date(slot)).minutes), Array.from({length:18}, (_,i) => 570+i*10));
  assert.equal(schedule.durationFor('pediatrics'), 10);
  assert.equal(schedule.durationFor('adhd'), 60);
  // Existing half-hour visits must still block all three new ten-minute slots.
  assert.deepEqual(schedule.freeSlots('pediatrics', friday, [{start:friday[0],end:friday[3]}]), friday.slice(3));
});
test('Busy boundaries, all-day events and calendar errors fail closed', () => {
  const candidates = ['2026-09-09T13:00:00.000Z', '2026-09-09T13:30:00.000Z'];
  assert.deepEqual(schedule.freeSlots('pediatrics', candidates, [{ start: candidates[0], end: candidates[1] }]), [candidates[1]]);
  assert.deepEqual(schedule.freeSlots('pediatrics', candidates, [{ start: '2026-09-09T00:00:00Z', end: '2026-09-10T00:00:00Z' }]), []);
  assert.throws(() => schedule.parseFreeBusy({ peds: { busy: [] }, adhd: { errors: [{ reason: 'notFound' }] } }, ['peds', 'adhd']));
  assert.throws(() => schedule.parseFreeBusy({ peds: { busy: [] } }, ['peds', 'adhd']));
  assert.throws(() => schedule.parseFreeBusy({ peds: { busy: [{ start: 'broken', end: 'broken' }] } }, ['peds']));
});

// SQL-backed Supabase adapter: exercises the actual migration/RPC in PostgreSQL.
function adapter(pg, intake) {
  return {
    async rpc(_name, args) {
      try {
        const keys = ['p_id','p_clinic','p_start','p_end','p_fingerprint','p_phone_hash','p_ip_hash','p_session_id','p_calendar_id','p_event_id','p_attempt_id'];
        const result = await pg.query(`select public.reserve_website_booking(${keys.map((_,i) => `$${i+1}`).join(',')}) as result`, keys.map(key => args[key]));
        return { data: result.rows[0].result, error: null };
      } catch (error) { return { data: null, error }; }
    },
    from(table) {
      let columns = '*', action = 'select', values, limit, single = false, filters = [], ignore = false;
      const q = {
        select(v = '*') { columns = v; return q; },
        eq(key,v) { filters.push([key,'=',v]); return q; }, neq(key,v) { filters.push([key,'<>',v]); return q; },
        lte(key,v) { filters.push([key,'<=',v]); return q; },
        gt(key,v) { filters.push([key,'>',v]); return q; }, gte(key,v) { filters.push([key,'>=',v]); return q; }, lt(key,v) { filters.push([key,'<',v]); return q; },
        limit(v) { limit = v; return q; },
        insert(v) { action = 'insert'; values = v; return q; }, update(v) { action = 'update'; values = v; return q; },
        upsert(v) { action = 'insert'; values = v; ignore = true; return q; },
        maybeSingle() { single = true; return q; }, single() { single = true; return q; },
        then(resolve,reject) {
          return (async () => {
            if (table === 'questionnaires') return { data: intake.forms, error: null };
            if (table === 'intake_sessions') return { data: intake && filters.some(([key,,v]) => key === 'parent_token' && v === intake.token) ? intake : null, error: null };
            const params = [];
            const param = value => { params.push(value); return `$${params.length}`; };
            let sql;
            if (action === 'select') sql = `select ${columns} from ${table}`;
            if (action === 'update') sql = `update ${table} set ${Object.entries(values).map(([key,v]) => `${key}=${param(v)}`).join(',')}`;
            if (action === 'insert') sql = `insert into ${table}(${Object.keys(values).join(',')}) values(${Object.values(values).map(param).join(',')})${ignore ? ' on conflict (id) do nothing' : ''}`;
            if (filters.length) sql += ` where ${filters.map(([key,op,v]) => `${key}${op}${param(v)}`).join(' and ')}`;
            if (action === 'select' && limit) sql += ` limit ${limit}`;
            if (action !== 'select') sql += ` returning ${columns}`;
            try { const result = await pg.query(sql, params); return { data: single ? result.rows[0] ?? null : result.rows, error: null }; }
            catch (error) { return { data: null, error }; }
          })().then(resolve,reject);
        },
      };
      return q;
    },
  };
}

test('Public booking integration with SQL reservations and mocked Google', async t => {
  const pg = new PGlite();
  await pg.exec('create role anon; create role authenticated; create role service_role;');
  await pg.exec(fs.readFileSync(path.join(root, 'db/migrations/20260907_website_bookings.sql'), 'utf8'));
  await pg.exec('create table appointments(id uuid primary key, session_id uuid, patient_id uuid, appointment_type text, scheduled_at timestamptz, duration_minutes int, status text, gcal_event_id text, gcal_calendar_id text, location text, notes text);');
  const intake = { id: randomUUID(), patient_id: randomUUID(), token: randomUUID(), parent_token_expires_at: '2099-01-01T00:00:00Z', forms: fullForms(), patients: { first_name: 'Test', last_name: 'Child' } };
  const envBefore = { ...process.env };
  process.env.PUBLIC_BOOKING_ENABLED = 'true'; process.env.BOOKING_HASH_SECRET = 'local-test-secret-that-is-never-deployed';
  const events = new Map(); let writes = [], busy = [], failWrite = false, missingCalendar = false, accessRole = 'writer';
  const google = {
    calendarList: { async get() { return { data: { accessRole } }; } },
    freebusy: { async query() { return { data: { calendars: { peds: { busy }, adhd: missingCalendar ? { errors: [{ reason: 'forbidden' }] } : { busy } } } }; } },
    events: {
      async delete({calendarId,eventId}) { if(failWrite)throw new Error('timeout'); events.delete(`${calendarId}/${eventId}`); return {}; },
      async get({ calendarId, eventId }) { const event = events.get(`${calendarId}/${eventId}`); if (!event) throw Object.assign(new Error('not found'), { code: 404 }); return { data: event }; },
      async insert({ calendarId, requestBody, sendUpdates }) {
        writes.push({ calendarId, requestBody, sendUpdates });
        if (failWrite) throw new Error('simulated timeout');
        const key = `${calendarId}/${requestBody.id}`;
        if (events.has(key)) throw Object.assign(new Error('duplicate'), { code: 409 });
        events.set(key, requestBody); return { data: requestBody };
      },
    },
  };
  const service = compile('lib/booking/server.ts', {
    '@/lib/intake/progress': progress,
    '@/lib/google-calendar': { getCalendarClient: () => google, getCalendarId: () => 'adhd' },
    '@/lib/pediatrics-calendar': { getPediatricsCalendarId: () => 'peds' },
    '@/lib/supabase': { getSupabaseAdmin: () => adapter(pg, intake) }, './schedule': schedule,
  });
  async function reset() { await pg.exec('truncate website_bookings, appointments;'); events.clear(); writes = []; busy = []; failWrite = false; missingCalendar = false; accessRole = 'writer'; }
  const body = (clinic, start = schedule.candidateSlots(clinic)[0]) => ({ requestId: randomUUID(), start, childName: 'Test Child', parentName: 'Test Parent', phone: '0501234567', consent: true, website: '', ...(clinic === 'adhd' ? { parentToken: intake.token } : {}) });
  const rejects = (promise, code) => assert.rejects(promise, error => error.code === code);
  try {
    await t.test('writes pediatrics exclusively to pediatrics; no invitations', async () => {
      await reset(); const result = await service.book('pediatrics', body('pediatrics'), 'test-ip');
      assert.equal(result.confirmed, true); assert.equal(writes.length, 1); assert.equal(writes[0].calendarId, 'peds'); assert.equal(writes[0].sendUpdates, 'none');
      assert.equal(writes[0].requestBody.visibility, 'private'); assert.equal(writes[0].requestBody.attendees, undefined);
    });
    await t.test('ADHD uses ADHD calendar and persists the existing appointment schema', async () => {
      await reset(); const request = body('adhd'); await service.book('adhd', request, 'test-ip');
      assert.equal(writes[0].calendarId, 'adhd');
      const rows = (await pg.query('select * from appointments')).rows;
      assert.equal(rows.length, 1); assert.equal(rows[0].session_id, intake.id); assert.equal(rows[0].gcal_calendar_id, 'adhd');
      assert.equal(Date.parse(writes[0].requestBody.end.dateTime) - Date.parse(request.start), 3600000);
    });
    await t.test('missing and incomplete intake cannot create an event', async () => {
      await reset(); await rejects(service.book('adhd', { ...body('adhd'), parentToken: randomUUID() }, 'test-ip'), 'invalid_intake');
      const previous = intake.forms; intake.forms = [previous[0]];
      await rejects(service.book('adhd', body('adhd'), 'test-ip'), 'intake_incomplete'); intake.forms = previous;
      const expiry = intake.parent_token_expires_at; intake.parent_token_expires_at = '2020-01-01T00:00:00Z';
      await rejects(service.book('adhd', body('adhd'), 'test-ip'), 'invalid_intake'); intake.parent_token_expires_at = expiry;
      assert.equal(writes.length, 0);
    });
    await t.test('two clinics cannot reserve the same doctor at the same time', async () => {
      await reset(); const start = schedule.candidateSlots('adhd')[0];
      const results = await Promise.allSettled([service.book('pediatrics', body('pediatrics', start), 'one'), service.book('adhd', body('adhd', start), 'two')]);
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal(results.find(result => result.status === 'rejected').reason.code, 'slot_taken'); assert.equal(writes.length, 1);
    });
    await t.test('concurrent retries of one request write only once', async () => {
      await reset(); const request = body('pediatrics');
      const results = await Promise.allSettled([service.book('pediatrics', request, 'test-ip'), service.book('pediatrics', request, 'test-ip')]);
      assert.ok(results.some(result => result.status === 'fulfilled')); assert.equal(writes.length, 1);
      const replay = await service.book('pediatrics', request, 'test-ip'); assert.equal(replay.confirmed, true); assert.equal(writes.length, 1);
      await rejects(service.book('pediatrics', { ...request, childName: 'Different Child' }, 'test-ip'), 'invalid_retry');
    });
    await t.test('Google conflicts and permissions never become available appointments', async () => {
      await reset(); const request = body('pediatrics'); busy = [{ start: request.start, end: new Date(Date.parse(request.start) + 3600000).toISOString() }];
      await rejects(service.book('pediatrics', request, 'test-ip'), 'slot_taken'); assert.equal(writes.length, 0);
      missingCalendar = true; await assert.rejects(service.getSlots('pediatrics'));
    });
    await t.test('read-only calendar access cannot enable booking', async () => {
      await reset(); accessRole = 'reader';
      await rejects(service.getSlots('pediatrics'), 'unavailable');
      await rejects(service.book('pediatrics', body('pediatrics'), 'test-ip'), 'unavailable'); assert.equal(writes.length, 0);
    });
    await t.test('an uncertain write keeps its reservation and can be retried safely', async () => {
      await reset(); const request = body('pediatrics'); failWrite = true;
      await rejects(service.book('pediatrics', request, 'test-ip'), 'processing');
      assert.equal((await pg.query('select status from website_bookings')).rows[0].status, 'pending');
      await rejects(service.book('pediatrics', body('pediatrics', request.start), 'other-ip'), 'slot_taken');
      await pg.exec("update website_bookings set attempt_expires_at=now()-interval '1 second';"); failWrite = false;
      const result = await service.book('pediatrics', request, 'test-ip'); assert.equal(result.confirmed, true); assert.equal(events.size, 1);
    });
    await t.test('availability exposes only timestamps and observes both calendars and reservations', async () => {
      await reset(); const request = body('pediatrics'); await service.book('pediatrics', request, 'test-ip');
      const slots = await service.getSlots('pediatrics'); assert.ok(!slots.includes(request.start));
      assert.ok(slots.every(slot => typeof slot === 'string' && Number.isFinite(Date.parse(slot))));
    });
    await t.test('cancelling a confirmed Google event releases the public slot', async () => {
      await reset(); const request = body('pediatrics'); await service.book('pediatrics', request, 'test-ip');
      events.clear(); const slots = await service.getSlots('pediatrics'); assert.ok(slots.includes(request.start));
      assert.equal((await pg.query('select status from website_bookings')).rows[0].status, 'released');
    });
    await t.test('personal cancellation requires a capability; preview does not delete; retries release exactly one slot', async () => {
      await reset(); const request = body('pediatrics'); const result = await service.book('pediatrics', request, 'test-ip');
      assert.match(result.cancellationToken, /^[a-f0-9]{64}$/);
      await rejects(service.cancelPediatrics(request.requestId, '0'.repeat(64)), 'invalid_link');
      assert.equal(events.size, 1);
      const preview = await service.cancelPediatrics(request.requestId, result.cancellationToken, true);
      assert.equal(preview.cancelled, false); assert.equal(events.size, 1);
      failWrite = true;
      await rejects(service.cancelPediatrics(request.requestId, result.cancellationToken), 'processing');
      assert.equal((await pg.query('select status from website_bookings')).rows[0].status, 'confirmed');
      failWrite = false;
      assert.equal((await service.cancelPediatrics(request.requestId, result.cancellationToken)).cancelled, true);
      assert.equal(events.size, 0);
      assert.equal((await service.cancelPediatrics(request.requestId, result.cancellationToken)).cancelled, true);
      assert.ok((await service.getSlots('pediatrics')).includes(request.start));
    });
    await t.test('cancellation cannot touch another clinic or an unrelated Google event', async () => {
      await reset(); const request = body('adhd'); const result = await service.book('adhd', request, 'test-ip');
      assert.equal(result.cancellationToken, undefined);
      await rejects(service.cancelPediatrics(request.requestId, service.cancellationToken(request.requestId)), 'invalid_link');
      await reset(); const peds = body('pediatrics'); const receipt = await service.book('pediatrics', peds, 'test-ip');
      [...events.values()][0].extendedProperties.private.websiteBooking = randomUUID();
      await rejects(service.cancelPediatrics(peds.requestId, receipt.cancellationToken), 'unavailable');
      assert.equal(events.size, 1);
    });
    await t.test('reminders observe consent, 30-minute window, cancellation and once-only delivery', async () => {
      await reset();
      await pg.exec("create table clinic_notifications(id text primary key,state text default 'pending',provider_id text,updated_at timestamptz default now());");
      const sent = [];
      const notifications = compile('lib/moxo/notification.ts', { '@/lib/supabase': { getSupabaseAdmin: () => adapter(pg, intake) }, '@/lib/whatsapp-ultramsg': { sendWhatsAppText: async message => { sent.push(message); return {ok:true,id:'mock'}; } } });
      const reminders = compile('lib/booking/reminders.ts', { '@/lib/supabase': {getSupabaseAdmin: () => adapter(pg,intake)}, '@/lib/google-calendar': {getCalendarClient:()=>google}, '@/lib/moxo/notification':notifications, './server':service,'./schedule':schedule });
      process.env.BOOKING_REMINDERS_ENABLED='true';process.env.ULTRAMSG_INSTANCE_ID='test';process.env.ULTRAMSG_TOKEN='test';
      const request={...body('pediatrics'),reminderConsent:true,language:'ar'};
      const receipt=await service.book('pediatrics',request,'test-ip');
      const due=new Date(Date.parse(request.start)-30*60000);
      await reminders.sendDueReminders(new Date(due.getTime()-60000));assert.equal(sent.length,0);
      await Promise.all([reminders.sendDueReminders(due),reminders.sendDueReminders(due)]);assert.equal(sent.length,1);assert.match(sent[0].body,/تذكير/);assert.match(sent[0].body,/book\/cancel/);
      await reminders.sendDueReminders(due);assert.equal(sent.length,1);
      await reset(); await pg.exec('delete from clinic_notifications');
      const noConsent=body('pediatrics');await service.book('pediatrics',noConsent,'test-ip');
      await reminders.sendDueReminders(new Date(Date.parse(noConsent.start)-30*60000));assert.equal(sent.length,1);
      await reset();const cancel={...body('pediatrics'),reminderConsent:true};const c=await service.book('pediatrics',cancel,'test-ip');await service.cancelPediatrics(cancel.requestId,c.cancellationToken);
      await reminders.sendDueReminders(new Date(Date.parse(cancel.start)-30*60000));assert.equal(sent.length,1);
    });
    await t.test('booking limits are enforced in the database', async () => {
      await reset(); const starts = schedule.candidateSlots('pediatrics');
      for (let i = 0; i < 3; i++) await service.book('pediatrics', body('pediatrics', starts[i]), 'test-ip');
      await rejects(service.book('pediatrics', body('pediatrics', starts[3]), 'test-ip'), 'rate_limited'); assert.equal(writes.length, 3);
    });
    await t.test('anonymous roles cannot read or reserve bookings', async () => {
      const permissions = (await pg.query("select has_table_privilege('anon','public.website_bookings','SELECT') as readable, has_function_privilege('anon','public.reserve_website_booking(uuid,text,timestamptz,timestamptz,text,text,text,uuid,text,text,uuid)','EXECUTE') as executable")).rows[0];
      assert.equal(permissions.readable, false); assert.equal(permissions.executable, false);
    });
    await t.test('public APIs reject wrong clinic, cross-origin POST and disabled configuration', async () => {
      const route = compile('app/api/booking/[clinic]/route.ts', { '@/lib/booking/server': service, '@/lib/booking/schedule': schedule });
      const { NextRequest } = require('next/server');
      const invalid = await route.GET(new NextRequest('https://app.magickidsinstitute.com/api/booking/other'), { params: { clinic: 'other' } });
      assert.equal(invalid.status, 404);
      const cross = await route.POST(new NextRequest('https://app.magickidsinstitute.com/api/booking/pediatrics', { method: 'POST', headers: { origin: 'https://other.example' } }), { params: { clinic: 'pediatrics' } });
      assert.equal(cross.status, 403);
      process.env.PUBLIC_BOOKING_ENABLED = 'false';
      const disabled = await route.GET(new NextRequest('https://app.magickidsinstitute.com/api/booking/pediatrics'), { params: { clinic: 'pediatrics' } });
      assert.equal(disabled.status, 503); assert.deepEqual(await disabled.json(), { error: 'unavailable' });
      assert.match(disabled.headers.get('cache-control'), /no-store/);
    });
  } finally { process.env = envBefore; await pg.close(); }
});
