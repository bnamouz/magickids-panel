import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
function compile(file,overrides={}){
 const js=ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const mod={exports:{}};new Function('require','module','exports',js)(n=>n in overrides?overrides[n]:require(n),mod,mod.exports);return mod.exports;
}
const schedule=compile('lib/booking/schedule.ts');
test('15-minute cutoff is inclusive, 14:59 is closed; ADHD remains two hours',()=>{
 const at=schedule.localToUTC('2026-10-19',600);
 assert.ok(schedule.candidateSlots('pediatrics',new Date(+at-15*60000)).includes(at.toISOString()));
 assert.ok(!schedule.candidateSlots('pediatrics',new Date(+at-15*60000+1000)).includes(at.toISOString()));
 const adhd=schedule.localToUTC('2026-10-21',960);
 assert.ok(!schedule.candidateSlots('adhd',new Date(+adhd-15*60000)).includes(adhd.toISOString()));
 assert.ok(schedule.candidateSlots('adhd',new Date(+adhd-120*60000)).includes(adhd.toISOString()));
});
test('real ledger SQL, private calendar writes, retry recovery and validation',async()=>{
 const pg=new PGlite();
 try{
 await pg.exec('create role anon; create role authenticated; create role service_role bypassrls;');
 await pg.exec(fs.readFileSync(new URL('../supabase/migrations/20261012202735_pediatric_doctor_requests.sql',import.meta.url),'utf8'));
 const db={rpc:async(_n,a)=>{try{return {data:(await pg.query('select public.reserve_pediatrics_doctor_request($1,$2,$3,$4,$5,$6) as r',[a.p_id,a.p_fingerprint,a.p_phone,a.p_ip,a.p_day,a.p_calendar])).rows[0].r,error:null};}catch(error){return{error};}}};
 let inserts=0,fail=false,timeoutAfterWrite=false;const saved=new Map();
 const events={get:async({eventId})=>{if(fail)throw Error('down');if(!saved.has(eventId))throw{code:404};return{data:saved.get(eventId)};},insert:async({requestBody,sendUpdates})=>{inserts++;assert.equal(sendUpdates,'none');if(fail)throw Error('down');saved.set(requestBody.id,requestBody);if(timeoutAfterWrite)throw Error('timeout');return{data:requestBody};}};
 class BookingError extends Error{constructor(code,status=503){super(code);this.code=code;this.status=status;}}
 process.env.BOOKING_HASH_SECRET='test-only-doctor-request-key-32-characters';
 const mod=compile('lib/booking/doctor-requests.ts',{'@/lib/supabase':{getSupabaseAdmin:()=>db},'@/lib/google-calendar':{getCalendarClient:()=>({events})},'./server':{BookingError,bookingSettings:()=>({pediatrics:'clinic-test'})},'./schedule':schedule});
 assert.equal(mod.requestDay(schedule.localToUTC('2026-10-17',800)),'2026-10-19');
 assert.equal(mod.requestDay(schedule.localToUTC('2026-10-19',929)),'2026-10-19');
 assert.equal(mod.requestDay(schedule.localToUTC('2026-10-19',930)),'2026-10-20');
 const body={requestId:randomUUID(),childName:'Test Child',parentName:'Test Parent',phone:'0500000000',childId:'123456782',cardlessVisitConfirmed:true,message:'Synthetic nonclinical test',consent:true,language:'he',website:''};
 const receipt=await mod.submitDoctorRequest(body,'test-ip');
 assert.equal(receipt.received,true);const event=[...saved.values()][0];
 assert.equal(event.visibility,'private');assert.equal(event.transparency,'transparent');assert.ok(event.start.date);assert.ok(!event.start.dateTime);assert.equal(event.attendees,undefined);
 assert.ok(event.description.includes(body.childId));assert.ok(event.description.includes('דיווח עצמי'));assert.ok(!event.summary.includes(body.childId));
 for(const missing of [{childId:undefined},{childId:''},{childId:'123'},{childId:'12345678x'},{childId:'000000000'},{cardlessVisitConfirmed:undefined},{cardlessVisitConfirmed:false}]){await assert.rejects(()=>mod.submitDoctorRequest({...body,...missing},'test-ip'),e=>e.code==='invalid_body');}
 await assert.rejects(()=>mod.submitDoctorRequest({...body,childId:'234567890'},'test-ip'),e=>e.code==='invalid_retry');
 assert.deepEqual(await mod.submitDoctorRequest(body,'test-ip'),receipt);assert.equal(inserts,1);
 await assert.rejects(()=>mod.submitDoctorRequest({...body,message:'Changed content'},'test-ip'),e=>e.code==='invalid_retry');
 await assert.rejects(()=>mod.submitDoctorRequest({...body,consent:false},'test-ip'),e=>e.code==='invalid_body');
 await assert.rejects(()=>mod.submitDoctorRequest({...body,website:'bot'},'test-ip'),e=>e.code==='invalid_body');
 fail=true;const retry={...body,requestId:randomUUID()};await assert.rejects(()=>mod.submitDoctorRequest(retry,'test-ip'),e=>e.status===503);
 fail=false;timeoutAfterWrite=true;assert.equal((await mod.submitDoctorRequest(retry,'test-ip')).received,true);assert.equal(inserts,2);
 assert.equal((await mod.submitDoctorRequest({...body,requestId:randomUUID()},'test-ip')).received,true);
 await assert.rejects(()=>mod.submitDoctorRequest({...body,requestId:randomUUID()},'test-ip'),e=>e.code==='rate_limited');
 assert.equal((await pg.query('select count(*)::int as n from public.pediatrics_doctor_requests')).rows[0].n,3);
 assert.equal((await pg.query("select has_function_privilege('anon','public.reserve_pediatrics_doctor_request(uuid,text,text,text,date,text)','execute') as allowed")).rows[0].allowed,false);
 assert.equal((await pg.query("select has_table_privilege('authenticated','public.pediatrics_doctor_requests','select') as allowed")).rows[0].allowed,false);
 }finally{await pg.close();}
});
test('public route rejects cross-origin and malformed submissions before calling Google',async()=>{
 let calls=0;class BookingError extends Error{}
 const route=compile('app/api/booking/doctor-request/route.ts',{'next/server':{NextResponse:{json:(body,opts)=>({body,...opts})}},'@/lib/booking/doctor-requests':{submitDoctorRequest:async()=>{calls++;return{received:true};}},'@/lib/booking/server':{BookingError}});
 const req=(origin,raw='{}')=>({headers:new Headers({'origin':origin,'content-type':'application/json'}),nextUrl:{origin:'https://clinic.example'},text:async()=>raw});
 assert.equal((await route.POST(req('https://evil.example'))).status,403);
 assert.equal((await route.POST(req('https://clinic.example','{'))).status,400);
 assert.equal((await route.POST(req('https://clinic.example','x'.repeat(8193)))).status,413);
 assert.equal(calls,0);
});
