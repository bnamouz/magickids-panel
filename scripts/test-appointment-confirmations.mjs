import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function compile(file, overrides={}) {
  const m={exports:{}};
  new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText)(name=>overrides[name]??require(name),m,m.exports);
  return m.exports;
}
const copy=compile('lib/appointments/confirmation-copy.ts');
const request={email:true,whatsapp:true,language:'he',consentConfirmed:true,expectedEmail:'parent@example.com',expectedPhone:'0501234567',expectedStart:'2099-10-21T13:00:00Z',expectedLocation:'מכון הבדיקה'};
function fixture(overrides={}) {
  let reads=0;
  const sends=[], states=new Map();
  const appointment={status:'scheduled',calendar_sync:'synced',scheduled_at:'2099-10-21T13:00:00Z',session_id:'case',location:'מכון הבדיקה',...overrides};
  const db={from(table){return {select(){return this},eq(){return this},async maybeSingle(){
    reads++; return {error:overrides.databaseError?new Error('unavailable'):null,data:table==='appointments'?appointment:{parents:overrides.parent??{email:request.expectedEmail,phone:request.expectedPhone}}};
  }}}};
  const once=async(id,...args)=>{
    if(states.has(id))return states.get(id);
    states.set(id,'sending');sends.push({id,args});await Promise.resolve();
    const state=overrides.emailFails&&id.endsWith(':email')?'unknown':'accepted';states.set(id,state);return state;
  };
  const mod=compile('lib/appointments/confirmation.ts',{
    '@/lib/supabase':{getSupabaseAdmin:()=>db},
    '@/lib/intake/progress':{firstRelated:v=>Array.isArray(v)?v[0]:v},
    '@/lib/appointments/magic-kids-whatsapp':{notifyMagicKidsOnce:once},
    '@/lib/therapists/mail':{emailOnce:once},
    './confirmation-copy':copy,
  });
  return {mod,sends,states,appointment,reads:()=>reads};
}
test('off by default: no database reads or provider calls', async()=>{
  delete process.env.APPOINTMENT_CONFIRMATIONS_MODE;
  const f=fixture();assert.deepEqual(await f.mod.sendAppointmentConfirmation('id',request),{email:'disabled',whatsapp:'disabled'});
  assert.equal(f.reads(),0);assert.equal(f.sends.length,0);
});
test('both channels isolated; repeat/concurrent requests use stable per-channel keys',async()=>{
  process.env.APPOINTMENT_CONFIRMATIONS_MODE='live';
  const f=fixture({emailFails:true});
  await Promise.all([f.mod.sendAppointmentConfirmation('id',request),f.mod.sendAppointmentConfirmation('id',request)]);
  const result=await f.mod.sendAppointmentConfirmation('id',request);
  assert.deepEqual(result,{email:'unknown',whatsapp:'accepted'});assert.equal(f.sends.length,2);
  assert.equal(f.sends[1].args[0],'+972501234567');
});
test('cancelled, unsynced and past appointments never send',async()=>{
  process.env.APPOINTMENT_CONFIRMATIONS_MODE='live';
  for(const o of [{status:'cancelled'},{calendar_sync:'failed'},{scheduled_at:'2000-01-01T00:00:00Z'}]){
    const f=fixture(o);assert.equal((await f.mod.sendAppointmentConfirmation('id',request)).email,'blocked');assert.equal(f.sends.length,0);
  }
});
test('changed recipient cannot be overridden by request',async()=>{
  const f=fixture();
  const r=await f.mod.sendAppointmentConfirmation('id',{...request,expectedEmail:'other@example.com',whatsapp:false});
  assert.equal(r.email,'contact_changed');assert.equal(f.sends.length,0);
});
test('stale time or location preview cannot send',async()=>{
  process.env.APPOINTMENT_CONFIRMATIONS_MODE='live';
  for(const o of [{expectedStart:'2099-10-22T13:00:00Z'},{expectedLocation:'other location'}]){
    const f=fixture();assert.equal((await f.mod.sendAppointmentConfirmation('id',{...request,...o})).email,'blocked');assert.equal(f.sends.length,0);
  }
});
test('test mode restricts each channel to an exact approved recipient',async()=>{
  process.env.APPOINTMENT_CONFIRMATIONS_MODE='test';
  delete process.env.APPOINTMENT_TEST_EMAIL;delete process.env.APPOINTMENT_TEST_PHONE;
  const f=fixture();assert.deepEqual(await f.mod.sendAppointmentConfirmation('id',request),{email:'test_blocked',whatsapp:'test_blocked'});
  process.env.APPOINTMENT_TEST_EMAIL=request.expectedEmail;
  process.env.APPOINTMENT_TEST_PHONE='+972501234567';
  assert.deepEqual(await f.mod.sendAppointmentConfirmation('id',request),{email:'accepted',whatsapp:'accepted'});
});
test('consent required and malicious/unknown options rejected',()=>{
  const f=fixture();assert.equal(f.mod.confirmationSchema.safeParse({...request,consentConfirmed:false}).success,false);
  assert.equal(f.mod.confirmationSchema.safeParse({...request,to:'other@example.com'}).success,false);
});
test('missing email leaves WhatsApp independent; database error sends nothing',async()=>{
  process.env.APPOINTMENT_CONFIRMATIONS_MODE='live';
  const f=fixture({parent:{email:'',phone:request.expectedPhone}});
  assert.deepEqual(await f.mod.sendAppointmentConfirmation('id',{...request,expectedEmail:''}),{email:'missing_contact',whatsapp:'accepted'});
  assert.equal(f.sends.length,1);
  const broken=fixture({databaseError:true});
  assert.equal((await broken.mod.sendAppointmentConfirmation('id',request)).email,'unavailable');
  assert.equal(broken.sends.length,0);
});
test('confirmation API requires staff and same origin',async()=>{
  let called=0;
  const NextResponse={json:(body,init={})=>({body,status:init.status??200})};
  const route=staff=>compile('app/api/admin/appointments/[id]/confirmation/route.ts',{
    'next/server':{NextResponse},
    '@/lib/admin/auth':{getCurrentStaff:async()=>staff},
    '@/lib/supabase':{getSupabaseAdmin:()=>{throw Error('must not read');}},
    '@/lib/appointments/confirmation':{
      confirmationSchema:fixture().mod.confirmationSchema,
      sendAppointmentConfirmation:async()=>{called++;return {email:'accepted',whatsapp:'accepted'};},
    },
  });
  const ctx={params:{id:'00000000-0000-4000-8000-000000000001'}};
  const req={headers:{get:()=> 'https://app.example.test'},nextUrl:{origin:'https://app.example.test'},json:async()=>request};
  assert.equal((await route(null).POST(req,ctx)).status,403);
  assert.equal((await route({id:'staff'}).POST({...req,headers:{get:()=> 'https://other.example.test'}},ctx)).status,403);
  assert.equal((await route({id:'staff'}).POST({...req,json:async()=>({...request,consentConfirmed:false})},ctx)).status,400);
  assert.equal(called,0);
  assert.equal((await route({id:'staff'}).POST(req,ctx)).status,200);assert.equal(called,1);
});
test('messages have Western digits, Israel timezone, and no child/clinical fields',()=>{
  for(const lang of ['he','ar']){
    const body=copy.confirmationMessage('2099-10-21T13:00:00Z','מכון\nבדיקה',lang);
    assert.match(body,/16:00/);assert.doesNotMatch(body,/[٠-٩۰-۹]/);assert.doesNotMatch(body,/ADHD|diagnosis|session_id/);
    assert.match(body,/magickids@magickidsinstitute.com/);
  }
});
test('existing provider helpers atomically claim and never reset uncertain sends',()=>{
  for(const file of ['lib/moxo/notification.ts','lib/therapists/mail.ts']){
    const code=fs.readFileSync(file,'utf8');
    assert.match(code,/ignoreDuplicates:true/);assert.match(code,/eq\('state','pending'\)/);
    assert.doesNotMatch(code,/update\(\{state:'pending'/);
  }
});
