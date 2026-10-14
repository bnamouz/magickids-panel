import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
function compile(file,bindings={}){
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};new Function('require','module','exports',js)(n=>bindings[n]??{},m,m.exports);return m.exports;
}
const {ensureCalendarEvent}=compile('lib/calendar-consistency.ts');
const body={start:{dateTime:'2099-01-01T10:00:00Z'},end:{dateTime:'2099-01-01T11:00:00Z'}};
test('Google conflict, transparent events, and uncertain successful writes',async()=>{
 let saved,insertions=0;
 const c={events:{get:async()=>{if(!saved)throw {code:404};return {data:saved}},list:async()=>({data:{items:[{id:'request',transparency:'transparent'}]}}),insert:async p=>{insertions++;saved=p.requestBody;throw Error('timeout')}}};
 await ensureCalendarEvent(c,'calendar','stableid',body);await ensureCalendarEvent(c,'calendar','stableid',body);assert.equal(insertions,1);
 saved=undefined;c.events.list=async()=>({data:{items:[{id:'busy'}]}});
 await assert.rejects(ensureCalendarEvent(c,'calendar','newid',body),/slot_taken/);assert.equal(insertions,1);
 saved={...body,status:'cancelled'};await assert.rejects(ensureCalendarEvent(c,'calendar','stableid',body),/slot_taken/);
});
test('agenda removes mirrored appointments but keeps separate events and unsynced records',()=>{
 const {deduplicateAgenda}=compile('lib/calendar-agenda.ts');
 const rows=[{key:'a',start:'2099-01-01',eventKey:'cal:1'},{key:'w',start:'2099-01-01',eventKey:'cal:1'},{key:'t',start:'2099-01-02',eventKey:null},{key:'m',start:'2099-01-03',eventKey:'cal:2'}];
 assert.deepEqual(deduplicateAgenda(rows).map(x=>x.key),['a','t','m']);
});
test('database guards cross-table doctor, calendar and therapist collisions; permits mirroring and adjacent slots',async()=>{
 const pg=new PGlite();
 await pg.exec(`create role anon;create role authenticated;create role service_role;
 create table public.appointments(id uuid primary key,scheduled_at timestamptz,duration_minutes int,gcal_calendar_id text,gcal_event_id text,appointment_type text,status text);
 create table public.website_bookings(id uuid primary key,starts_at timestamptz,ends_at timestamptz,calendar_id text,event_id text,status text);
 create table public.moxo_requests(id uuid primary key,scheduled_at timestamptz,duration_minutes int,google_calendar_id text,google_event_id text,status text);
 create table public.therapists(id uuid primary key,name text);
 create table public.treatment_requests(id uuid primary key,scheduled_at timestamptz,duration_minutes int,calendar_id text,calendar_event_id text,therapist_id uuid,therapist text,status text);
 create table public.therapist_booking_requests(id uuid primary key,starts_at timestamptz,ends_at timestamptz,calendar_id text,event_id text,therapist_id uuid,status text,expires_at timestamptz);`);
 await pg.exec(fs.readFileSync('supabase/migrations/20261014002916_calendar_consistency.sql','utf8'));
 const id=i=>`00000000-0000-0000-0000-${String(i).padStart(12,'0')}`;
 await pg.query(`insert into website_bookings values($1,'2099-01-01 10:00Z','2099-01-01 11:00Z','kids','event1','confirmed')`,[id(1)]);
 await assert.rejects(pg.query(`insert into appointments(id,scheduled_at,duration_minutes,gcal_calendar_id,gcal_event_id,appointment_type,status) values($1,'2099-01-01 10:30Z',15,'adhd','event2','followup','scheduled')`,[id(2)]),/slot_taken/);
 await pg.query(`insert into appointments(id,scheduled_at,duration_minutes,gcal_calendar_id,gcal_event_id,appointment_type,status) values($1,'2099-01-01 10:00Z',60,'kids','event1','assessment','scheduled')`,[id(3)]);
 await pg.query(`insert into appointments(id,scheduled_at,duration_minutes,gcal_calendar_id,gcal_event_id,appointment_type,status) values($1,'2099-01-01 11:00Z',15,'adhd','event3','followup','scheduled')`,[id(4)]);
 await assert.rejects(pg.query(`insert into moxo_requests values($1,'2099-01-01 11:00Z',60,'adhd','moxo1','approved')`,[id(5)]),/slot_taken/);
 await pg.query(`insert into therapists values($1,'Therapist')`,[id(6)]);
 await pg.query(`insert into therapist_booking_requests values($1,'2099-01-02 10:00Z','2099-01-02 11:00Z','therapy','tb1',$2,'confirmed','2099-01-02 09:00Z')`,[id(7),id(6)]);
 await assert.rejects(pg.query(`insert into treatment_requests values($1,'2099-01-02 10:30Z',60,'other','t1',$2,'Therapist','scheduled')`,[id(8),id(6)]),/slot_taken/);
 await pg.close();
});
