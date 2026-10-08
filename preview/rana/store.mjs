import { PGlite } from '@electric-sql/pglite';
import { randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import { requestSlots, validateRequestAvailability, RANA_REQUEST_AVAILABILITY, RANA_CALENDAR_ID } from './generated/request-slots.mjs';

const token = () => randomBytes(32).toString('hex');
const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const matches = (a, b) => typeof a === 'string' && typeof b === 'string'
  && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export class Failure extends Error {
  constructor(code, status = 400) { super(code); this.status = status; }
}
const asISO = value => new Date(value).toISOString();
const publicRequest = r => ({
  id: r.id, family: r.family, start: asISO(r.starts_at), end: asISO(r.ends_at),
  duration: r.duration, status: r.status, expires: asISO(r.expires_at),
  eventId: r.event_id, created: asISO(r.created_at),
});

// Single-process, transaction-serialized sandbox. This is NOT a production auth
// or distributed calendar-sync implementation. Only synthetic fixtures accepted.
export async function openStore(dataDir, clock = () => new Date()) {
  const db = new PGlite(dataDir);
  await db.exec(`
    create table if not exists demo_settings (
      scope text primary key, availability jsonb not null, version integer not null default 1,
      parent_key text not null, staff_key text not null
    );
    create table if not exists demo_requests (
      id uuid primary key, scope text not null references demo_settings(scope),
      idem uuid not null, family text not null, starts_at timestamptz not null,
      ends_at timestamptz not null, duration integer not null,
      status text not null check(status in ('pending','confirmed','rejected','expired')),
      expires_at timestamptz not null, event_id text, created_at timestamptz not null,
      unique(scope,idem)
    );
    create table if not exists demo_events (
      request_id uuid primary key references demo_requests(id),
      scope text not null, calendar_id text not null,
      starts_at timestamptz not null, ends_at timestamptz not null, event_id text not null
    );
    create table if not exists demo_external_busy (
      scope text not null, starts_at timestamptz not null, ends_at timestamptz not null
    );
  `);
  let tail = Promise.resolve();
  const serial = fn => {
    const next = tail.then(() => db.transaction(fn));
    tail = next.catch(() => {});
    return next;
  };
  async function settings(tx, scope) {
    await tx.query(`insert into demo_settings(scope,availability,parent_key,staff_key)
      values($1,$2,$3,$4) on conflict do nothing`,
    [scope, JSON.stringify(RANA_REQUEST_AVAILABILITY), token(), token()]);
    return (await tx.query('select * from demo_settings where scope=$1', [scope])).rows[0];
  }
  function authorize(s, key, role) {
    if (!matches(s[role + '_key'], key)) throw new Failure('unauthorized', 403);
  }
  async function expire(tx, scope) {
    await tx.query(`update demo_requests set status='expired' where scope=$1
      and status='pending' and (expires_at<=$2 or starts_at<=$2)`, [scope, clock()]);
  }
  async function busy(tx, scope, exclude = null) {
    const rows = (await tx.query(`select starts_at,ends_at from demo_requests
      where scope=$1 and status in ('pending','confirmed') and ($2::uuid is null or id<>$2)
      union all select starts_at,ends_at from demo_external_busy where scope=$1`, [scope, exclude])).rows;
    return rows.map(r => ({ start: asISO(r.starts_at), end: asISO(r.ends_at) }));
  }
  return {
    close: () => db.close(),
    bootstrap: scope => serial(async tx => {
      const s = await settings(tx, scope);
      return { parentKey: s.parent_key, demoStaffKey: s.staff_key, mode: 'isolated-demo' };
    }),
    slots: scope => serial(async tx => {
      const s = await settings(tx, scope); await expire(tx, scope);
      return { slots: requestSlots(s.availability, await busy(tx, scope), clock()), version: s.version };
    }),
    mine: (scope, key) => serial(async tx => {
      const s = await settings(tx, scope); authorize(s, key, 'parent'); await expire(tx, scope);
      return (await tx.query('select * from demo_requests where scope=$1 order by created_at desc', [scope])).rows.map(publicRequest);
    }),
    create: (scope, key, body) => serial(async tx => {
      const s = await settings(tx, scope); authorize(s, key, 'parent'); await expire(tx, scope);
      if (!body || !uuid(body.idem)
        || !['משפחת בדיקה א', 'משפחת בדיקה ב', 'משפחת בדיקה ג'].includes(body.family)
        || typeof body.start !== 'string') throw new Failure('invalid_request');
      const old = (await tx.query('select * from demo_requests where scope=$1 and idem=$2', [scope, body.idem])).rows[0];
      if (old) {
        if (asISO(old.starts_at) !== body.start || old.family !== body.family) throw new Failure('idempotency_mismatch', 409);
        return publicRequest(old);
      }
      const count = (await tx.query("select count(*)::integer as n from demo_requests where scope=$1 and status='pending'", [scope])).rows[0].n;
      if (count >= 20) throw new Failure('too_many_requests', 429);
      const slot = requestSlots(s.availability, await busy(tx, scope), clock()).find(v => v.start === body.start);
      if (!slot) throw new Failure('slot_unavailable', 409);
      const row = (await tx.query(`insert into demo_requests
        (id,scope,idem,family,starts_at,ends_at,duration,status,expires_at,created_at)
        values($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9) returning *`,
      [randomUUID(), scope, body.idem, body.family, slot.start, slot.end, slot.duration,
        new Date(Math.min(clock().getTime() + 86400000, Date.parse(slot.start))), clock()])).rows[0];
      return publicRequest(row);
    }),
    staff: (scope, key) => serial(async tx => {
      const s = await settings(tx, scope); authorize(s, key, 'staff'); await expire(tx, scope);
      return { availability: s.availability, version: s.version, calendarId: RANA_CALENDAR_ID,
        requests: (await tx.query('select * from demo_requests where scope=$1 order by starts_at,created_at', [scope])).rows.map(publicRequest),
        events: (await tx.query('select event_id from demo_events where scope=$1', [scope])).rows.length };
    }),
    decide: (scope, key, body) => serial(async tx => {
      const s = await settings(tx, scope); authorize(s, key, 'staff'); await expire(tx, scope);
      if (!['approve', 'reject'].includes(body?.action) || !uuid(body?.id)) throw new Failure('invalid_request');
      const r = (await tx.query('select * from demo_requests where scope=$1 and id=$2', [scope, body.id])).rows[0];
      if (!r) throw new Failure('not_found', 404);
      if ((body.action === 'approve' && r.status === 'confirmed')
        || (body.action === 'reject' && r.status === 'rejected')) return publicRequest(r);
      if (r.status !== 'pending') throw new Failure('request_not_pending', 409);
      let event = null;
      if (body.action === 'approve') {
        const slot = requestSlots(s.availability, await busy(tx, scope, r.id), clock(), 0)
          .find(x => x.start === asISO(r.starts_at) && x.end === asISO(r.ends_at));
        if (!slot) throw new Failure('slot_unavailable', 409);
        // Deliberate fake adapter: failure occurs before any event/confirmation.
        if (body.simulateFailure === true) throw new Failure('demo_calendar_failure', 503);
        event = 'demo' + r.id.replaceAll('-', '');
        await tx.query(`insert into demo_events(request_id,scope,calendar_id,starts_at,ends_at,event_id)
          values($1,$2,$3,$4,$5,$6) on conflict(request_id) do nothing`,
        [r.id, scope, RANA_CALENDAR_ID, r.starts_at, r.ends_at, event]);
      }
      return publicRequest((await tx.query(`update demo_requests set status=$1,event_id=$2
        where id=$3 returning *`, [body.action === 'approve' ? 'confirmed' : 'rejected', event, r.id])).rows[0]);
    }),
    availability: (scope, key, body) => serial(async tx => {
      const s = await settings(tx, scope); authorize(s, key, 'staff');
      if (body?.version !== s.version) throw new Failure('stale_settings', 409);
      let value;
      try { value = validateRequestAvailability(body.availability); }
      catch (e) { throw new Failure(e.message); }
      await tx.query('update demo_settings set availability=$1,version=version+1 where scope=$2', [JSON.stringify(value), scope]);
      return { version: s.version + 1 };
    }),
    // Test harness only; never exposed by the HTTP router.
    addExternalBusy: (scope, start, end) => serial(tx => tx.query(
      'insert into demo_external_busy(scope,starts_at,ends_at) values($1,$2,$3)', [scope, start, end])),
  };
}
