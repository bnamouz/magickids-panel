import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const id='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
const original=fs.readFileSync('supabase/migrations/20261014123430_permanent_case_delete.sql','utf8');
const fix=fs.readFileSync('supabase/migrations/20261016040000_case_delete_audit_compatibility.sql','utf8');
async function fixture() {
 const db=new PGlite();
 await db.exec(`
 create role anon;create role authenticated;create role service_role;
 create table users(id uuid primary key,email text,is_active boolean,role text);
 create view staff_users as select * from users;
 create table patients(id uuid primary key,first_name text,last_name text);
 create table parents(id uuid primary key,patient_id uuid references patients(id) on delete cascade);
 create table intake_sessions(id uuid primary key,patient_id uuid references patients(id) on delete cascade,primary_parent_id uuid references parents(id));
 create table appointments(id uuid primary key,session_id uuid references intake_sessions(id) on delete cascade,patient_id uuid references patients(id) on delete cascade,scheduled_at timestamptz,duration_minutes int,status text,calendar_sync text);
 create table reports(id uuid primary key,session_id uuid references intake_sessions(id) on delete cascade,pdf_storage_path text);
 create table moxo_tests(session_id uuid references intake_sessions(id) on delete cascade,results_pdf_path text);
 create table questionnaires(session_id uuid references intake_sessions(id) on delete cascade);
 create table audit_log(id bigint generated always as identity primary key,actor_id uuid,actor_type text not null check(actor_type in ('user','system','parent','teacher','external')),action text,entity_type text,entity_id uuid,metadata jsonb);
 create function prevent_audit_modification() returns trigger language plpgsql as $$begin raise exception 'audit_log is immutable';end$$;
 create trigger audit_log_no_update before delete or update on audit_log for each row execute function prevent_audit_modification();
 insert into users values('${id}','synthetic@example.test',true,'admin');
 insert into patients values('${id}','Synthetic','Case');
 insert into parents values('${id}','${id}');
 insert into intake_sessions values('${id}','${id}','${id}');
 insert into questionnaires values('${id}');
 `);
 await db.exec(original);
 return db;
}
const del=db=>db.query('select delete_intake_case($1,$2,$3)',[id,id,'Synthetic Case']);
const count=async(db,table)=>(await db.query(`select count(*)::int n from ${table}`)).rows[0].n;
test('reproduces invalid actor_type; transaction leaves case and jobs unchanged',async()=>{
 const db=await fixture();try {
  await assert.rejects(del(db),/actor_type_check/);
  assert.equal(await count(db,'intake_sessions'),1);assert.equal(await count(db,'questionnaires'),1);assert.equal(await count(db,'case_deletion_jobs'),0);
 }finally{await db.close();}
});
test('reproduces immutable audit failure with existing history',async()=>{
 const db=await fixture();try {
  await db.exec(`insert into audit_log(actor_type,entity_id,action) values('user','${id}','existing_event')`);
  await assert.rejects(del(db),/audit_log is immutable/);
  assert.equal(await count(db,'intake_sessions'),1);assert.equal(await count(db,'audit_log'),1);
 }finally{await db.close();}
});
test('fix installation is non-destructive; explicit deletion preserves audit and retries safely',async()=>{
 const db=await fixture();try {
  await db.exec(`insert into audit_log(actor_type,entity_id,action,metadata) values('user','${id}','existing_event','{"safe":"unchanged"}')`);
  await db.exec(fix);
  assert.equal(await count(db,'intake_sessions'),1);assert.equal(await count(db,'audit_log'),1);assert.equal(await count(db,'case_deletion_jobs'),0);
  await del(db);await del(db);
  assert.equal(await count(db,'intake_sessions'),0);assert.equal(await count(db,'questionnaires'),0);
  assert.equal(await count(db,'case_deletion_jobs'),1);
  const audit=(await db.query('select actor_type,action,metadata from audit_log order by id')).rows;
  assert.deepEqual(audit,[{actor_type:'user',action:'existing_event',metadata:{safe:'unchanged'}},{actor_type:'user',action:'case_permanently_deleted',metadata:{}}]);
  await assert.rejects(db.exec('delete from audit_log'),/audit_log is immutable/);
  assert.equal((await db.query("select has_function_privilege('authenticated','delete_intake_case(uuid,uuid,text)','execute') ok")).rows[0].ok,false);
 }finally{await db.close();}
});
test('authorization, name, future and syncing appointments remain protected',async()=>{
 const db=await fixture();try {
  await db.exec(fix);
  await db.exec("update users set role='assistant'");await assert.rejects(del(db),/admin_required/);
  await db.exec("update users set role='admin',is_active=false");await assert.rejects(del(db),/admin_required/);
  await db.exec("update users set is_active=true");
  await assert.rejects(db.query('select delete_intake_case($1,$2,$3)',[id,id,'Other Name']),/case_changed/);
  await db.exec(`insert into appointments values('${id}','${id}','${id}',now()+interval '1 day',60,'scheduled','synced')`);
  await assert.rejects(del(db),/active_appointment/);
  await db.exec("update appointments set status='cancelled',calendar_sync='syncing'");await assert.rejects(del(db),/active_appointment/);
  assert.equal(await count(db,'case_deletion_jobs'),0);assert.equal(await count(db,'intake_sessions'),1);
 }finally{await db.close();}
});
test('external/shared documents block deletion and another case preserves patient',async()=>{
 const db=await fixture();try {
  await db.exec(fix);
  await db.exec(`insert into moxo_tests values('${id}','external.pdf')`);await assert.rejects(del(db),/external_document/);
  await db.exec('delete from moxo_tests');
  await db.exec(`insert into intake_sessions values('${other}','${id}','${id}');
   insert into reports values('${id}','${id}','shared.pdf'),('${other}','${other}','shared.pdf');`);
  await assert.rejects(del(db),/shared_document/);
  await db.exec(`update reports set pdf_storage_path='other.pdf' where id='${other}'`);
  await del(db);
  assert.equal(await count(db,'patients'),1);assert.equal(await count(db,'parents'),1);assert.equal(await count(db,'intake_sessions'),1);
  assert.deepEqual((await db.query('select report_paths from case_deletion_jobs')).rows[0].report_paths,['shared.pdf']);
 }finally{await db.close();}
});
