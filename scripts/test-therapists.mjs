import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
function compile(file,overrides={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>overrides[n]??require(n),m,m.exports);return m.exports;}
const slots=compile('lib/therapists/slots.ts',{'@/lib/booking/schedule':compile('lib/booking/schedule.ts')});
const profile={id:randomUUID(),name:'Test',active:true,duration:60,hours:[{day:3,start:960,end:1200}],leave_dates:[]};
const available=slots.therapistSlots(profile,[],new Date('2026-10-03T00:00:00Z'));
assert.ok(available.includes('2026-10-07T13:00:00.000Z'));
assert.ok(!slots.therapistSlots({...profile,leave_dates:[{start:'2026-10-07',end:'2026-10-07'}]},[],new Date('2026-10-03T00:00:00Z')).includes('2026-10-07T13:00:00.000Z'));
assert.ok(!slots.therapistSlots(profile,[{id:'busy',scheduled_at:'2026-10-07T13:00:00Z',duration_minutes:60}],new Date('2026-10-03T00:00:00Z')).includes('2026-10-07T13:15:00.000Z'));
const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role;');
 await db.exec(fs.readFileSync('supabase/migrations/20260912062810_clinic_self_service.sql','utf8'));
 const migration=process.argv[2]||'supabase/migrations/20261002193341_therapists_and_treatment_workflow.sql';await db.exec(fs.readFileSync(migration,'utf8'));
 const tid=randomUUID(),tid2=randomUUID(),rid=randomUUID(),rid2=randomUUID();
 const date=new Date(Date.now()+7*86400000).toISOString().slice(0,10),day=new Date(date+'T12:00:00Z').getUTCDay();
 const start=compile('lib/booking/schedule.ts').localToUTC(date,960).toISOString();
 await db.query('insert into therapists(id,name,email,treatments,hours) values ($1,$2,$3,$4,$5),($6,$7,$8,$4,$5)',[tid,'Therapist One','one@example.com',['speech'],JSON.stringify([{day,start:960,end:1200}]),tid2,'Therapist Two','two@example.com']);
 for(const id of [rid,rid2])await db.query("insert into treatment_requests(id,patient_name,contact_name,phone,ip_hash,treatment,language,therapist_id) values($1,'Test Child','Test Parent','+972500000001','test','speech','he',$2)",[id,tid]);
 const book=async(id,t,at)=>(await db.query('select schedule_assigned_treatment($1,$2,$3,null) as result',[id,t,at])).rows[0].result;
 assert.equal(await book(rid,tid2,start),'not_assigned');
 assert.equal(await book(rid,tid,new Date(Date.parse(start)-3600000).toISOString()),'outside_hours');
 const results=await Promise.all([book(rid,tid,start),book(rid2,tid,start)]);assert.equal(results.filter(x=>x==='scheduled').length,1);assert.equal(results.filter(x=>x==='slot_taken').length,1);
 await db.query('update therapists set leave_dates=$1 where id=$2',[JSON.stringify([{start:date,end:date}]),tid]);assert.equal(await book(rid,tid,start),'on_leave');
 for(const role of ['anon','authenticated']){const row=(await db.query(`select has_table_privilege('${role}','therapists','SELECT') as r,has_function_privilege('${role}','schedule_assigned_treatment(uuid,uuid,timestamptz,uuid)','EXECUTE') as f`)).rows[0];assert.deepEqual(row,{r:false,f:false});}
 console.log('PASS therapist hours, holidays, overlap, assignment, concurrent scheduling and service-only access');
}finally{await db.close();}
