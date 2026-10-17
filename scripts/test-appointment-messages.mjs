process.env.APPOINTMENT_MESSAGES_ENABLED='true';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function compile(file,mocks={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in mocks)return mocks[n];throw Error(n);},m,m.exports);return m.exports;}
const p=compile('lib/appointment-messages/policy.ts');
const now=new Date('2026-10-16T06:00:00Z');
assert.equal(p.duePhase('2026-10-17T06:00:00Z',now),'day-before');
assert.equal(p.duePhase('2026-10-16T08:00:00Z',now),'same-day');
assert.equal(p.duePhase('2026-10-16T05:00:00Z',now),null);
assert.equal(p.duePhase('2026-10-16T06:30:00Z',now),null);
assert.equal(p.duePhase('2026-10-16T12:00:00Z',now),null);
assert.notEqual(p.messageKey('c','e','2026-10-16T08:00:00Z','same-day'),p.messageKey('c','e','2026-10-16T09:00:00Z','same-day'));
assert.equal(p.phoneNumber('054-1234567'),'+972541234567');
let status='confirmed',cancelled=false,consent=true,reads=0,change=false,sends=0;
const row={id:'id',status:'confirmed',starts_at:'2026-10-16T08:00:00Z',calendar_id:'cal',event_id:'event'};
const db={from(){const q={select(){return q},eq(){return q},async maybeSingle(){reads++;return {data:{...row,status:change&&reads>1?'released':status}}}};return q}};
const server=compile('lib/appointment-messages/server.ts',{
 '@/lib/supabase':{getSupabaseAdmin:()=>db},
 '@/lib/google-calendar':{getCalendarClient:()=>({events:{get:async()=>({data:{status:cancelled?'cancelled':'confirmed',start:{dateTime:row.starts_at},extendedProperties:{private:{websiteBooking:'id',reminderPhone:'+972541234567',reminderConsent:String(consent)}}}})}})},
 '@/lib/moxo/notification':{notifyOnce:async()=>{sends++;return 'accepted'}},'./policy':p,
});
assert.equal(await server.sendAppointmentMessage('website_bookings','id','same-day',now),'accepted');
assert.equal(sends,1);
cancelled=true;assert.equal(await server.sendAppointmentMessage('website_bookings','id','same-day',now),'calendar_mismatch');
cancelled=false;consent=false;assert.equal(await server.sendAppointmentMessage('website_bookings','id','same-day',now),'no_consent');
consent=true;change=true;reads=0;assert.equal(await server.sendAppointmentMessage('website_bookings','id','same-day',now),'changed');
assert.equal(sends,1);
console.log('Appointment messages: timing, reschedule keys, cancellation, consent and concurrent status change passed');
