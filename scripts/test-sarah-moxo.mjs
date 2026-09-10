import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const require = createRequire(import.meta.url), root = path.resolve(import.meta.dirname,'..');
function compile(relative, overrides = {}) {
  const filename = path.join(root,relative), source = fs.readFileSync(filename,'utf8');
  const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const module={exports:{}};
  new Function('require','module','exports',js)(name=>{
    if(name in overrides)return overrides[name];
    if(name.startsWith('@/')||name.startsWith('./')){
      const base=name.startsWith('@/')?name.slice(2):path.relative(root,path.resolve(path.dirname(filename),name));
      return compile(fs.existsSync(path.join(root,base+'.ts'))?base+'.ts':base+'/index.ts',overrides);
    }
    return require(name);
  },module,module.exports);
  return module.exports;
}
const schedule=compile('lib/booking/schedule.ts');
test('assessment window: exact hourly Wednesday starts, future only, Israel DST',()=>{
 const now=new Date('2026-01-01T00:00:00Z');
 for(const day of ['2026-09-16','2026-12-16'])for(const hour of [16,17,18,19])assert.equal(schedule.isAssessmentSlot(schedule.localToUTC(day,hour*60).toISOString(),now),true);
 for(const [day,minute] of [['2026-09-16',19*60+30],['2026-09-16',20*60],['2026-09-16',15*60],['2026-09-17',16*60]])assert.equal(schedule.isAssessmentSlot(schedule.localToUTC(day,minute).toISOString(),now),false);
 assert.equal(schedule.isAssessmentSlot('not-a-date',now),false);
 assert.equal(schedule.isAssessmentSlot('2025-01-01T14:00:00Z',now),false);
});
test('Sarah gates actual submitted forms, verifies the case phone, and fails closed on database errors',async()=>{
 class BookingError extends Error{constructor(code,status=503){super(code);this.code=code;this.status=status;}}
 const p=compile('questions/vanderbilt_parent.ts').VANDERBILT_PARENT_QUESTIONS,t=compile('questions/vanderbilt_teacher.ts').VANDERBILT_TEACHER_QUESTIONS;
 const make=(type,questions)=>({type,is_complete:true,submitted_at:'2026-09-01T12:00:00Z',responses:Object.fromEntries(questions.map(q=>[q.id,q.section==='A'?0:1]))});
 let forms=[make('vanderbilt_parent',p)],error=false,status='profile_ready';
 const db={from(table){const q={select(){return q;},eq(){return q;},maybeSingle(){return q;},then(resolve){return Promise.resolve({data:table==='intake_sessions'?{id:'case',status,parents:{phone:'+972500000001'},parent_completed_at:'2026-09-01',teacher_completed_at:'2026-09-01'}:table==='questionnaires'?forms:[],error:error?{}:null}).then(resolve);}};return q;}};
 const api=compile('lib/voice/intake.ts',{'@/lib/supabase':{getSupabaseAdmin:()=>db},'@/lib/booking/server':{BookingError}});
 const id=randomUUID();
 let result=await api.voiceCase(id,'0500000001');assert.throws(()=>api.requireReady(result.progress),/intake_incomplete/);
 forms.push(make('vanderbilt_teacher',t));result=await api.voiceCase(id,'0500000001');assert.doesNotThrow(()=>api.requireReady(result.progress));
 forms[1].is_complete=false;result=await api.voiceCase(id,'0500000001');assert.throws(()=>api.requireReady(result.progress),/intake_incomplete/);
 forms[1].is_complete=true;status='closed';result=await api.voiceCase(id,'0500000001');assert.throws(()=>api.requireReady(result.progress),/case_not_ready/);
 await assert.rejects(api.voiceCase(id,'0500000002'),/case_not_found/);
 error=true;await assert.rejects(api.voiceCase(id,'0500000001'),/unavailable/);
});
test('MOXO persists pending requests, guards retries/rate limits, approves once and blocks overlaps with RLS',async()=>{
 const pg=new PGlite();try{
 await pg.exec('create role anon; create role authenticated; create role service_role;');
 await pg.exec(fs.readFileSync(path.join(root,'db/migrations/20260909_moxo_requests.sql'),'utf8'));
 const submit=async(id,phone='+972500000001')=>(await pg.query("select submit_moxo_request($1,'Synthetic patient','Synthetic parent',$2,'he',null) as status",[id,phone])).rows[0].status;
 const id=randomUUID();assert.equal(await submit(id),'pending');assert.equal(await submit(id),'pending');
 assert.equal(await submit(id,'+972500000002'),'invalid_retry');
 const other=randomUUID();assert.equal(await submit(other),'pending');assert.equal(await submit(randomUUID()),'pending');assert.equal(await submit(randomUUID()),'rate_limited');
 assert.equal((await pg.query('select status,scheduled_at from moxo_requests where id=$1',[id])).rows[0].status,'pending');
 const staff=randomUUID();const approve=async(id,start='2099-01-01T10:00:00Z')=>(await pg.query('select approve_moxo_request($1,$2,30,$3) as status',[id,start,staff])).rows[0].status;
 assert.equal(await approve(id),'approved');assert.equal(await approve(id),'approved');assert.equal(await approve(id,'2099-01-01T11:00:00Z'),'already_approved');assert.equal(await approve(other),'slot_taken');assert.equal(await approve(other,'2099-01-01T10:30:00Z'),'approved');
 assert.equal((await pg.query('select count(*)::int as n from clinic_notifications')).rows[0].n,0);
 for(const role of ['anon','authenticated']){
 await pg.exec(`set role ${role}`);
 await assert.rejects(pg.query('select * from moxo_requests'),/permission denied/);
 await assert.rejects(pg.query('select approve_moxo_request($1,$2,30,$3)',[id,'2099-01-01T10:00:00Z',staff]),/permission denied/);
 await pg.exec('reset role');
 }
 }finally{await pg.close();}
});
test('MOXO approval requires staff and explicit phone verification; never sends for a rejected approval',async()=>{
 let staff=null,approved='slot_taken',sends=0;
 const db={rpc:async()=>({data:approved,error:null})};
 const route=compile('app/api/admin/moxo/route.ts',{'@/lib/admin/auth':{getCurrentStaff:async()=>staff},'@/lib/supabase':{getSupabaseAdmin:()=>db},'@/lib/moxo/notification':{notifyOnce:async()=>{sends++;return 'accepted';}}});
 const body={id:randomUUID(),start:'2099-01-01T10:00:00Z',duration:30,phone_verified:true};
 const req={headers:new Headers({origin:'https://clinic.test'}),nextUrl:new URL('https://clinic.test/api/admin/moxo'),json:async()=>body};
 assert.equal((await route.POST(req)).status,403);staff={id:randomUUID()};
 body.phone_verified=false;assert.equal((await route.POST(req)).status,400);body.phone_verified=true;
 assert.equal((await route.POST(req)).status,409);assert.equal(sends,0);
});
test('notification retries do not blindly resend after provider acceptance or uncertain result',async()=>{
 process.env.ULTRAMSG_INSTANCE_ID='synthetic';process.env.ULTRAMSG_TOKEN='synthetic';
 let state=null,sends=0,ok=true;
 const db={from(){let update,claim=false;const q={upsert(){state??='pending';return Promise.resolve({error:null});},select(){return q;},eq(k,v){if(k==='state'&&v==='pending')claim=true;return q;},update(v){update=v;return q;},maybeSingle(){return q;},then(resolve){let data;if(update){if(!claim||state==='pending'){state=update.state;data={id:'id'};}else data=null;}else data={state};return Promise.resolve({data,error:null}).then(resolve);}};return q;}};
 const notify=compile('lib/moxo/notification.ts',{'@/lib/supabase':{getSupabaseAdmin:()=>db},'@/lib/whatsapp-ultramsg':{sendWhatsAppText:async()=>{sends++;return {ok,id:ok?'synthetic':undefined};}}}).notifyOnce;
 assert.equal(await notify('id','+972500000001','Synthetic'),'accepted');assert.equal(await notify('id','+972500000001','Synthetic'),'accepted');assert.equal(sends,1);
 state=null;ok=false;assert.equal(await notify('id2','+972500000001','Synthetic'),'unknown');assert.equal(await notify('id2','+972500000001','Synthetic'),'unknown');assert.equal(sends,2);
 delete process.env.ULTRAMSG_INSTANCE_ID;delete process.env.ULTRAMSG_TOKEN;
});
test('Sarah booking route cannot bypass missing forms and confirms only after the shared booking engine',async()=>{
 class BookingError extends Error{constructor(code,status=503){super(code);this.code=code;this.status=status;}}
 let authorized=false,ready=false,booked=0,notified=0,failBooking=false,ids=[];
 const route=compile('app/api/voice/book-maccabi/route.ts',{
 '@/lib/voice-auth':{assertVoiceAuth:()=>authorized?null:new Response(null,{status:401}),normalisePhone:s=>s},
 '@/lib/voice/intake':{voiceCase:async()=>({session:{parent_token:randomUUID()},parent:{full_name:'Synthetic parent',phone:'+972500000001'},patient:{first_name:'Synthetic',last_name:'child'},progress:{ready}}),requireReady:p=>{if(!p.ready)throw new BookingError('intake_incomplete',409);}},
 '@/lib/booking/server':{BookingError,book:async(clinic,body)=>{booked++;ids.push(body.requestId);if(failBooking)throw new BookingError('unavailable');return {confirmed:true};}},
 '@/lib/moxo/notification':{notifyOnce:async()=>{notified++;return 'accepted';}}
 });
 const body={case_id:randomUUID(),parent_phone:'+972500000001',slot_iso:'2099-01-07T14:00:00Z'};
 const req={json:async()=>body};assert.equal((await route.POST(req)).status,401);authorized=true;
 assert.equal((await route.POST(req)).status,409);assert.equal(booked,0);assert.equal(notified,0);
 ready=true;body.slot_iso='2099-01-07T17:30:00Z';assert.equal((await route.POST(req)).status,400);assert.equal(booked,0);
 body.slot_iso='2099-01-07T14:00:00Z';failBooking=true;assert.equal((await route.POST(req)).status,503);assert.equal(notified,0);
 failBooking=false;assert.equal((await route.POST(req)).status,200);assert.equal((await route.POST(req)).status,200);assert.equal(new Set(ids).size,1);
});

test('booking accepts real 48-hex intake tokens and legacy UUIDs without accepting malformed tokens',()=>{
 const server=compile('lib/booking/server.ts');
 assert.equal(server.intakeTokenSchema.safeParse('a'.repeat(48)).success,true);
 assert.equal(server.intakeTokenSchema.safeParse(randomUUID()).success,true);
 for(const token of ['a'.repeat(47),'z'.repeat(48),'','not-a-token'])assert.equal(server.intakeTokenSchema.safeParse(token).success,false);
});
