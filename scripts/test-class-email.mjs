import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
function compile(file,overrides={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>overrides[n]??require(n),m,m.exports);return m.exports;}
const db=new PGlite();
await db.exec('create role anon;create role authenticated;create role service_role;');
await db.exec(fs.readFileSync('supabase/migrations/20261002221819_class_interest_lists.sql','utf8'));
await db.query("insert into public.class_interests(id,class_type,patient,contact,phone,language) values ('00000000-0000-4000-8000-000000000099','art','Old Child','Parent','+972500000099','he')");
const migration=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_class_interest_parent_email.sql'));
await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
assert.equal((await db.query('select email from public.class_interests')).rows[0].email,null);
let writes=0;
const catalog=compile('lib/classes/catalog.ts'),schema=compile('lib/treatments/schema.ts');
const route=compile('app/api/classes/route.ts',{
 '@/lib/classes/catalog':catalog,'@/lib/treatments/schema':schema,
 '@/lib/supabase':{getSupabaseAdmin:()=>({rpc:async(name,p)=>{
  writes++;assert.equal(name,'submit_class_interest_email');
  try{const r=await db.query('select public.submit_class_interest_email($1,$2,$3,$4,$5,$6,$7) result',[p.p_id,p.p_class,p.p_patient,p.p_contact,p.p_phone,p.p_language,p.p_email]);return {data:r.rows[0].result};}catch(error){return {error};}
 }})}
});
const body={id:'00000000-0000-4000-8000-000000000001',patient:'Test Child',contact:'Test Parent',phone:'0500000001',email:'Parent@Example.COM',classType:'art',language:'he',consent:true,website:''};
const req=(b,origin='https://example.com')=>({headers:new Headers({origin}),nextUrl:new URL('https://example.com/api/classes'),text:async()=>JSON.stringify(b)});
for(const email of [undefined,'','bad','a@example.com\nBcc:evil@example.com'])assert.equal((await route.POST(req({...body,email}))).status,400);
assert.equal(writes,0);
assert.equal((await route.POST(req(body,'https://evil.invalid'))).status,403);
assert.equal((await route.POST(req({...body,consent:false}))).status,400);
assert.equal((await route.POST(req(body))).status,200);
assert.equal((await route.POST(req(body))).status,200);
assert.equal((await db.query('select count(*)::int n from public.class_interests')).rows[0].n,2);
assert.equal((await db.query('select email from public.class_interests where id=$1',[body.id])).rows[0].email,'parent@example.com');
assert.equal((await route.POST(req({...body,email:'replacement@example.com'}))).status,409);
assert.equal((await db.query('select email from public.class_interests where id=$1',[body.id])).rows[0].email,'parent@example.com');
assert.equal((await route.POST(req({...body,patient:'Old Child',phone:'0500000099'}))).status,409);
assert.equal((await db.query("select email from public.class_interests where patient='Old Child'")).rows[0].email,null);
await db.exec('set role anon;');
await assert.rejects(db.query('select email from public.class_interests'),/permission denied/);
await assert.rejects(db.query('select public.submit_class_interest_email($1,$2,$3,$4,$5,$6,$7)',[body.id,'art','X','Y','Z','he','a@b.com']),/permission denied/);
await db.exec('reset role;');
await db.close();
console.log('PASS email validation, consent, origin, SQL persistence, deduplication, no overwrite, old rows preserved and RLS.');
