import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
const db=new PGlite();
try{
 await db.exec('create role anon;create role authenticated;create role service_role;');
 for(const file of ['20260912062810_clinic_self_service.sql','20261002193341_therapists_and_treatment_workflow.sql','20261002201639_recruitment_and_therapist_removal.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 const id=randomUUID();const submit=async(i,ip)=>(await db.query("select submit_recruitment($1,'Test Person','test@example.com','0500000000',array['speech'],'Experience',$2) as r",[i,ip])).rows[0].r;
 assert.equal(await submit(id,'ip'),'received');assert.equal(await submit(id,'ip'),'received');
 for(let i=0;i<4;i++)assert.equal(await submit(randomUUID(),'ip'),'received');assert.equal(await submit(randomUUID(),'ip'),'rate_limited');
 const accept=async i=>(await db.query('select accept_recruitment($1) as id',[i])).rows[0].id;
 const tid=await accept(id);assert.equal(await accept(id),tid);assert.equal((await db.query('select active from therapists where id=$1',[tid])).rows[0].active,false);
 const remove=async i=>(await db.query('select remove_therapist($1) as r',[i])).rows[0].r;
 assert.equal(await remove(tid),'deleted');assert.equal((await db.query('select therapist_id from recruitment_candidates where id=$1',[id])).rows[0].therapist_id,null);
 const tid2=await accept(id),rid=randomUUID();
 await db.query('update therapists set active=true where id=$1',[tid2]);
 await db.query("insert into treatment_requests(id,patient_name,contact_name,phone,ip_hash,treatment,language,therapist_id) values($1,'Test Child','Test Parent','+972500000001','test','speech','he',$2)",[rid,tid2]);
 assert.equal(await remove(tid2),'has_open_treatments');
 await db.query("update treatment_requests set status='closed' where id=$1",[rid]);
 assert.equal(await remove(tid2),'archived');assert.equal((await db.query('select active from therapists where id=$1',[tid2])).rows[0].active,false);
 assert.equal((await db.query('select therapist_id from treatment_requests where id=$1',[rid])).rows[0].therapist_id,tid2);
 await assert.rejects(db.query("insert into treatment_requests(id,patient_name,contact_name,phone,ip_hash,treatment,language,therapist_id) values($1,'Test Child','Test Parent','+972500000001','test','speech','he',$2)",[randomUUID(),tid2]),/inactive_therapist/);
 await db.query('delete from recruitment_candidates where id=$1',[id]);assert.equal((await db.query('select count(*)::int as n from therapists where id=$1',[tid2])).rows[0].n,1);
 for(const role of ['anon','authenticated'])assert.equal((await db.query(`select has_table_privilege('${role}','recruitment_candidates','SELECT') or has_function_privilege('${role}','remove_therapist(uuid)','EXECUTE') as access`)).rows[0].access,false);
 console.log('PASS recruitment save, retry, rate limit, idempotent conversion, deletion, archive history, active-treatment guard and service-only access');
}finally{await db.close();}
// Endpoint authentication prevents reaching the database for anonymous or cross-origin requests.
const ts=await import('typescript');const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);
function compile(file,overrides={}){const m={exports:{}};new Function('require','module','exports',ts.default.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.default.ModuleKind.CommonJS,target:ts.default.ScriptTarget.ES2022}}).outputText)(n=>overrides[n]??require(n),m,m.exports);return m.exports;}
const schema=compile('lib/recruitment/schema.ts',{'@/lib/treatments/schema':{treatments:['speech','occupational','emotional','parent-guidance','groups','other']}});
let staff=null,calls=0;const route=compile('app/api/admin/recruitment/route.ts',{'@/lib/recruitment/schema':schema,'@/lib/admin/auth':{getCurrentStaff:async()=>staff},'@/lib/supabase':{getSupabaseAdmin:()=>{calls++;throw new Error('unexpected');}}});
const req={headers:new Headers({origin:'https://example.com'}),nextUrl:new URL('https://example.com/api/admin/recruitment'),text:async()=>JSON.stringify({action:'delete',id:randomUUID(),confirmed:true})};
assert.equal((await route.POST(req)).status,403);staff={id:randomUUID()};assert.equal((await route.POST({...req,headers:new Headers({origin:'https://other.example'})})).status,403);assert.equal(calls,0);
assert.equal(schema.publicCandidateSchema.safeParse({id:randomUUID(),name:'Test',email:'test@example.com',phone:'0500000000',treatments:['speech'],experience:'',consent:true,website:'',notes:'attempt to set internal notes'}).success,false);
console.log('PASS staff-only candidate mutations, same-origin enforcement and public field separation');
