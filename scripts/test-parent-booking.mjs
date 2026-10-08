import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {randomUUID,randomBytes} from 'node:crypto';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
function compile(file,overrides={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>overrides[n]??require(n),m,m.exports);return m.exports;}
const pg=new PGlite(),schedule=compile('lib/booking/schedule.ts');
const slots=compile('lib/therapists/request-slots.ts',{'../booking/schedule':schedule});
const names={
 submit_therapy_booking:['p_id','p_slug','p_hash','p_patient','p_contact','p_phone','p_ip','p_start','p_end'],
 claim_therapy_booking:['p_id','p_therapist','p_action','p_lease'],
 finish_therapy_booking:['p_id','p_lease','p_result'],
 save_therapy_booking_hours:['p_therapist','p_version','p_availability'],
 therapy_booking_valid_slot:['p_therapist','p_start','p_end'],
 schedule_treatment_request:['p_id','p_start','p_duration','p_therapist','p_staff'],
};
const db={
 async rpc(name,args){try{const keys=names[name];const r=await pg.query(`select ${name}(${keys.map((_,i)=>'$'+(i+1)).join(',')}) as value`,keys.map(k=>args[k]!==null&&typeof args[k]==='object'?JSON.stringify(args[k]):args[k]));return {data:r.rows[0].value,error:null};}catch(error){return {data:null,error};}},
 from(table){let columns='*',single=false,filters=[],order='',limit='',updates=null;
  const q={select(v='*'){columns=v;return q;},update(v){updates=v;return q;},neq(k,v){filters.push([k,'<>',v]);return q;},eq(k,v){filters.push([k,'=',v]);return q;},gt(k,v){filters.push([k,'>',v]);return q;},gte(k,v){filters.push([k,'>=',v]);return q;},lt(k,v){filters.push([k,'<',v]);return q;},in(k,v){filters.push([k,'in',v]);return q;},order(k,opts){order=` order by ${k} ${opts?.ascending===false?'desc':'asc'}`;return q;},limit(n){limit=` limit ${Number(n)}`;return q;},single(){single=true;return q;},maybeSingle(){single=true;return q;},
   then(resolve,reject){return (async()=>{try{const params=[];const param=v=>{params.push(v);return '$'+params.length;};const where=filters.map(([k,op,v])=>op==='in'?`${k} in (${v.map(param).join(',')})`:`${k}${op}${param(v)}`).join(' and ');
    const update=updates?Object.entries(updates).map(([k,v])=>`${k}=${param(v)}`).join(','):'';
    const r=await pg.query(updates?`update ${table} set ${update}${where?' where '+where:''} returning ${columns}`:`select ${columns} from ${table}${where?' where '+where:''}${order}${limit}`,params);
    const rows=r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v instanceof Date?v.toISOString():v])));return {data:single?rows[0]??null:rows,error:null};}catch(error){return {data:null,error};}})().then(resolve,reject);}
  };return q;
 }
};
let calendarFailure=false,afterWriteFailure=false,externalBusy=[],writes=0;
const events=new Map();
const google={
 freebusy:{async query({requestBody:b}){if(calendarFailure)throw new Error('calendar failed');return {data:{calendars:{[b.items[0].id]:{busy:externalBusy}}}};}},
 events:{
  async get({eventId}){if(calendarFailure)throw new Error('failed');if(!events.has(eventId))throw {code:404};return {data:events.get(eventId)};},
  async insert({calendarId,requestBody,sendUpdates}){assert.equal(calendarId,slots.RANA_CALENDAR_ID);assert.equal(sendUpdates,'none');assert.equal(requestBody.attendees,undefined);assert.deepEqual(requestBody.reminders,{useDefault:false,overrides:[]});writes++;events.set(requestBody.id,requestBody);if(afterWriteFailure)throw new Error('uncertain');return {data:requestBody};},
  async delete({eventId,sendUpdates}){assert.equal(sendUpdates,'none');if(calendarFailure)throw new Error('uncertain delete');events.delete(eventId);return {};},
 }
};
process.env.BOOKING_HASH_SECRET='not-a-real-secret-test-only';
const service=compile('lib/therapists/parent-booking.ts',{
 '@/lib/supabase':{getSupabaseAdmin:()=>db},'@/lib/google-calendar':{getCalendarClient:()=>google},
 '@/lib/booking/schedule':schedule,'./request-slots':slots,
});
let passed=0;
function pass(s){passed++;console.log('PASS',s);}
try{
 await pg.exec('create role anon;create role authenticated;create role service_role;');
 for(const file of ['20260912062810_clinic_self_service.sql','20261002193341_therapists_and_treatment_workflow.sql','20261008052117_therapist_parent_booking.sql'])await pg.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 const tid=randomUUID();
 await pg.query("insert into therapists(id,name,email,treatments,hours) values($1,'Rana Test','test@example.com',array['emotional'],$2)",[tid,JSON.stringify([{day:5,start:510,end:900}])]);
 await pg.query('insert into therapist_booking_profiles(therapist_id,slug,calendar_id,enabled,availability) values($1,$2,$3,true,$4)',[tid,'rana',slots.RANA_CALENDAR_ID,JSON.stringify(slots.RANA_REQUEST_AVAILABILITY)]);
 const available=await service.publicBookingSlots();
 assert.equal(available.slots.length,28);assert.deepEqual(available.slots.slice(0,7).map(s=>s.duration),[60,60,60,60,60,45,45]);pass('live slots use correct Google calendar and mixed durations');
 const make=(i=0)=>({id:randomUUID(),token:randomBytes(32).toString('hex'),patient:'Test Child',contact:'Test Parent',phone:'+9725'+String(Math.floor(Math.random()*1e8)).padStart(8,'0'),start:available.slots[i].start});
 const b=make();
 await service.submitBooking(b,'ip-a');assert.equal((await service.bookingStatus(b.id,b.token)).status,'pending');assert.equal(writes,0);
 await service.submitBooking(b,'ip-a');assert.equal((await pg.query('select count(*)::integer as n from therapist_booking_requests')).rows[0].n,1);pass('pending and idempotent submit; no Google write');
 await assert.rejects(service.bookingStatus(b.id,'0'.repeat(64)),e=>e.message==='not_found');pass('parent capability enforced');
 const race=await Promise.allSettled([service.submitBooking(make(1),'ip-b'),service.submitBooking(make(1),'ip-c')]);assert.equal(race.filter(x=>x.status==='fulfilled').length,1);pass('SQL race blocks duplicate slot');
 const pendingId=(await pg.query("select id from therapist_booking_requests where id<>$1",[b.id])).rows[0].id;
 const legacy=randomUUID();
 await pg.query("insert into treatment_requests(id,patient_name,contact_name,phone,ip_hash,treatment,language,therapist_id) values($1,'Test','Test','+972500000001','test','emotional','he',$2)",[legacy,tid]);
 await assert.rejects(pg.query('select schedule_assigned_treatment($1,$2,$3,null)',[legacy,tid,b.start]),/slot_taken/);pass('legacy and parent request paths share overlap protection');
 calendarFailure=true;await service.submitBooking(b,'ip-a');await assert.rejects(service.publicBookingSlots(),e=>e.message==='calendar_unavailable');await assert.rejects(service.decideBooking(b.id,tid,'approve'),e=>e.message==='sync_pending');
 assert.equal((await service.bookingStatus(b.id,b.token)).status,'syncing');assert.equal(writes,0);calendarFailure=false;pass('calendar failure never confirms');
 afterWriteFailure=true;await assert.rejects(service.decideBooking(b.id,tid,'approve'),e=>e.message==='sync_pending');assert.equal(writes,1);
 afterWriteFailure=false;assert.equal((await service.decideBooking(b.id,tid,'approve')).status,'confirmed');assert.equal(writes,1);
 await service.decideBooking(b.id,tid,'approve');assert.equal(writes,1);pass('uncertain insert reconciles without duplicate event');
 assert.equal((await service.decideBooking(pendingId,tid,'reject')).status,'rejected');pass('rejection releases held slot');
 const short=make(5);await service.submitBooking(short,'ip-short');
 externalBusy=[{start:available.slots[5].start,end:available.slots[5].end}];
 await assert.rejects(service.decideBooking(short.id,tid,'approve'),e=>e.message==='slot_taken');
 assert.equal((await service.bookingStatus(short.id,short.token)).status,'pending');externalBusy=[];
 assert.equal((await service.decideBooking(short.id,tid,'approve')).status,'confirmed');assert.equal((await service.bookingStatus(short.id,short.token)).duration,45);pass('conflict recheck then 45-minute Google event');
 calendarFailure=true;await assert.rejects(service.decideBooking(short.id,tid,'cancel'),e=>e.message==='sync_pending');
 assert.equal((await service.bookingStatus(short.id,short.token)).status,'cancelling');calendarFailure=false;
 assert.equal((await service.decideBooking(short.id,tid,'cancel')).status,'cancelled');pass('cancellation is recoverable and releases only own event');
 const referralData=await service.therapistBookingData(tid);
 assert.ok(referralData.referrals.some(r=>r.id===legacy&&r.status==='pending'));pass('general referrals appear in Rana queue without copying records');
 let syncFails=true,referralSyncCalls=0;
 const referralService=compile('lib/therapists/referral-booking.ts',{'@/lib/supabase':{getSupabaseAdmin:()=>db},'./parent-booking':service,'./calendar':{syncTreatment:async id=>{
  referralSyncCalls++;const row=(await pg.query('select duration_minutes,calendar_id from treatment_requests where id=$1',[id])).rows[0];
  assert.equal(row.duration_minutes,45);assert.equal(row.calendar_id,slots.RANA_CALENDAR_ID);
  await pg.query('update treatment_requests set calendar_sync=$1 where id=$2',[syncFails?'failed':'synced',id]);return syncFails?'failed':'synced';
 }}});
 await assert.rejects(referralService.scheduleReferral(legacy,randomUUID(),available.slots[6].start,null),e=>e.message==='forbidden');
 await assert.rejects(referralService.scheduleReferral(legacy,tid,b.start,null),e=>e.message==='slot_taken');pass('referral approval enforces therapist assignment and live availability');
 await assert.rejects(referralService.scheduleReferral(legacy,tid,available.slots[6].start,null),e=>e.message==='sync_pending');
 const failedReferral=(await service.therapistBookingData(tid)).referrals.find(r=>r.id===legacy);assert.equal(failedReferral.calendar_sync,'failed');pass('referral Google failure is not represented as confirmed');
 syncFails=false;assert.equal((await referralService.scheduleReferral(legacy,tid,available.slots[6].start,null)).status,'confirmed');
 assert.equal((await referralService.scheduleReferral(legacy,tid,available.slots[6].start,null)).status,'confirmed');assert.equal(referralSyncCalls,2);
 assert.equal((await pg.query('select count(*)::integer as n from treatment_requests where id=$1',[legacy])).rows[0].n,1);pass('general referral supports 45-minute slot and idempotent retry without duplication');
 const data=await service.therapistBookingData(tid);
 await service.saveBookingHours(tid,data.version,{windows:[],closedDates:[]});
 assert.equal((await service.bookingStatus(b.id,b.token)).status,'confirmed');
 assert.equal((await service.publicBookingSlots()).slots.length,0);
 await assert.rejects(service.saveBookingHours(tid,data.version,slots.RANA_REQUEST_AVAILABILITY),e=>e.message==='stale_settings');pass('hours update versioned; confirmed appointment preserved');
 for(const role of ['anon','authenticated']){
  const a=(await pg.query(`select has_table_privilege('${role}','therapist_booking_requests','SELECT') as r,has_function_privilege('${role}','claim_therapy_booking(uuid,uuid,text,uuid)','EXECUTE') as f`)).rows[0];assert.deepEqual(a,{r:false,f:false});
 }pass('RLS and grants: no anonymous or authenticated database access');
 const treatmentSchema=compile('lib/treatments/schema.ts');
 const publicRoute=compile('app/api/therapy/rana/route.ts',{'@/lib/treatments/schema':treatmentSchema,'@/lib/therapists/parent-booking':{...service,submitBooking:async()=>({received:true})}});
 const req=(body,origin='https://example.com')=>({ip:'test',headers:new Headers({origin}),nextUrl:new URL('https://example.com/api/therapy/rana'),text:async()=>JSON.stringify(body)});
 assert.equal((await publicRoute.POST(req({...make(),action:'request',consent:true,website:''}))).status,200);
 assert.equal((await publicRoute.POST(req({...make(),action:'request',consent:false,website:''}))).status,400);
 assert.equal((await publicRoute.POST(req({},'https://evil.example'))).status,403);pass('public endpoint validates fields, consent and same-origin');
 const staffRoute=compile('app/api/therapist/rana/route.ts',{'@/lib/admin/auth':{getCurrentStaff:async()=>null},'@/lib/therapists/server':{authenticateTherapist:async()=>null},'@/lib/therapists/parent-booking':service,'@/lib/therapists/referral-booking':referralService});
 assert.equal((await staffRoute.POST(req({action:'read'}))).status,403);pass('staff API rejects unauthenticated requests');
 console.log(`SUCCESS ${passed} production-path checks, real SQL and mocked Google only`);
}finally{await pg.close();}
