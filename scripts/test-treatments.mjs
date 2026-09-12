import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const db=new PGlite();
try{
 await db.exec('create role anon;create role authenticated;create role service_role;');
 await db.exec(fs.readFileSync('supabase/migrations/20260912062810_clinic_self_service.sql','utf8'));
 const submit=async(id,phone='+972500000001',type='speech')=>(await db.query('select public.submit_treatment_request($1,$2,$3,$4,$5,$6,$7,$8) as result',[id,'Test Child','Test Parent',phone,'test-ip',type,'he','Monday'])).rows[0].result;
 const id=randomUUID(),id2=randomUUID();assert.equal(await submit(id),'received');assert.equal(await submit(id),'received');assert.equal(await submit(id,'+972500000002'),'invalid_retry');assert.equal(await submit(id2,'+972500000002'),'received');
 const at=new Date(Date.now()+86400000).toISOString(),staff=randomUUID();
 const schedule=async(id,who='Therapist A')=>(await db.query('select public.schedule_treatment_request($1,$2,$3,$4,$5) as result',[id,at,60,who,staff])).rows[0].result;
 assert.equal(await schedule(id),'scheduled');assert.equal(await schedule(id),'scheduled');assert.equal(await schedule(id2),'slot_taken');assert.equal(await schedule(id2,'Therapist B'),'scheduled');
 for(const role of ['anon','authenticated']){const r=(await db.query(`select has_table_privilege('${role}','public.treatment_requests','SELECT') as r,has_table_privilege('${role}','public.treatment_requests','INSERT') as w,has_function_privilege('${role}','public.submit_treatment_request(uuid,text,text,text,text,text,text,text)','EXECUTE') as f`)).rows[0];assert.deepEqual(r,{r:false,w:false,f:false});}
 await submit(randomUUID());await submit(randomUUID());assert.equal(await submit(randomUUID()),'rate_limited');
 assert.equal((await db.query('select count(*)::int as n from treatment_requests where status=\'scheduled\'')).rows[0].n,2);
 console.log('PASS treatment queue: idempotency, limits, therapist overlap, staff-only privileges');
}finally{await db.close();}
