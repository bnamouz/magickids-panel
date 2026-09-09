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
const parent=compile('questions/vanderbilt_parent.ts').VANDERBILT_PARENT_QUESTIONS;
const teacher=compile('questions/vanderbilt_teacher.ts').VANDERBILT_TEACHER_QUESTIONS;
const progress=compile('lib/intake/progress.ts');
const answers = type => Object.fromEntries((type==='vanderbilt_parent'?parent:teacher).map(q=>[q.id,q.section==='A'?0:1]));
const form = type => ({type,is_complete:true,submitted_at:'2026-09-07T12:00:00Z',responses:answers(type)});
test('ready means both full submissions; drafts, bad scales and legacy status are insufficient',()=>{
  const p=form('vanderbilt_parent'),t=form('vanderbilt_teacher');
  assert.equal(progress.intakeProgress([] ,[], 'profile_ready').readyToSchedule,false);
  assert.equal(progress.intakeProgress([p,{...t,is_complete:false}]).readyToSchedule,false);
  assert.equal(progress.intakeProgress([p,{...t,submitted_at:null}]).readyToSchedule,false);
  assert.equal(progress.intakeProgress([p,{...t,responses:{...t.responses,43:0}}]).readyToSchedule,false);
  assert.equal(progress.intakeProgress([p,{...t,responses:{...t.responses,1:4}}]).readyToSchedule,false);
  assert.equal(progress.intakeProgress([p,t]).readyToSchedule,true);
  assert.equal(progress.intakeProgress([t,p]).readyToSchedule,true);
  assert.equal(progress.intakeProgress([p,t],[{status:'scheduled'}]).stage,'scheduled');
  assert.equal(progress.intakeProgress([p,t],[{status:'cancelled'}]).readyToSchedule,true);
  assert.equal(progress.intakeProgress([p,t],[],'closed').readyToSchedule,false);
});

// PostgreSQL-backed Supabase adapter: exercises conditional writes rather than
// assuming that a late PATCH cannot overwrite a completed questionnaire.
function adapter(pg, failures) {
  return { from(table) {
    let action='select',columns='*',values,upsertOptions,filters=[],single=false;
    const q={
      select(value='*'){columns=value;return q;},
      eq(key,value){filters.push({key,op:'eq',value});return q;},
      in(key,value){filters.push({key,op:'in',value});return q;},
      or(value){assert.equal(value,'is_complete.is.null,is_complete.eq.false');filters.push({op:'incomplete'});return q;},
      insert(value){action='insert';values=value;return q;},
      upsert(value,options){action='upsert';values=value;upsertOptions=options;return q;},
      update(value){action='update';values=value;return q;},
      maybeSingle(){single=true;return q;},
      then(resolve,reject){return(async()=>{
        if(failures.write&&table==='questionnaires'&&action==='update')return {data:null,error:new Error('simulated write failure')};
        const params=[],param=value=>{params.push(typeof value==='object'&&value!==null?JSON.stringify(value):value);return '$'+params.length;};
        let sql;
        if(action==='select')sql='select '+columns+' from '+table;
        if(action==='update')sql='update '+table+' set '+Object.entries(values).map(([k,v])=>k+'='+param(v)).join(',');
        if(action==='insert'||action==='upsert'){
          sql='insert into '+table+'('+Object.keys(values).join(',')+') values('+Object.values(values).map(param).join(',')+')';
          if(action==='upsert'){assert.equal(upsertOptions.onConflict,'session_id,type,respondent');assert.equal(upsertOptions.ignoreDuplicates,true);sql+=' on conflict (session_id,type,respondent) do nothing';}
        }
        if(filters.length)sql+=' where '+filters.map(f=>f.op==='incomplete'?'(is_complete is null or is_complete=false)':f.op==='in'?f.key+' in ('+f.value.map(param).join(',')+')':f.key+'='+param(f.value)).join(' and ');
        if(action!=='select')sql+=' returning '+columns;
        try{const r=await pg.query(sql,params);return {data:single?r.rows[0]??null:r.rows,error:null};}catch(error){return {data:null,error};}
      })().then(resolve,reject);}
    };return q;
  }};
}
test('submission lifecycle persists both orders, ignores late drafts, and refuses failed saves',async t=>{
  const pg=new PGlite(),id=randomUUID(),parentToken=randomUUID(),teacherToken=randomUUID(),failures={write:false};
  await pg.exec('create table intake_sessions(id uuid primary key,status text,parent_token uuid,teacher_token uuid,parent_token_expires_at timestamptz,teacher_token_expires_at timestamptz);create table questionnaires(id uuid primary key default gen_random_uuid(),session_id uuid,type text,respondent text,responses jsonb,free_text text,intro_data jsonb,is_complete boolean,started_at timestamptz,submitted_at timestamptz,unique(session_id,type,respondent));create table scores(id uuid default gen_random_uuid(),session_id uuid,questionnaire_id uuid,scope text,raw_scores jsonb,flags jsonb,engine_version text,presentation text,confidence text,alerts jsonb);');
  const route=compile('app/api/questionnaire/route.ts',{'@/lib/supabase':{getSupabaseAdmin:()=>adapter(pg,failures)}});
  const send=(type,method='POST',responses=answers(type))=>route[method]({json:async()=>({token:type==='vanderbilt_parent'?parentToken:teacherToken,type,responses,complete:method==='POST'})});
  const reset=async()=>{failures.write=false;await pg.exec('truncate intake_sessions,questionnaires,scores;');await pg.query('insert into intake_sessions values($1,$2,$3,$4,$5,$5)',[id,'created',parentToken,teacherToken,'2099-01-01T00:00:00Z']);};
  try{
    for(const order of [['vanderbilt_parent','vanderbilt_teacher'],['vanderbilt_teacher','vanderbilt_parent']]) await t.test(order.join(' then '),async()=>{
      await reset();assert.equal((await send(order[0])).status,200);
      let rows=(await pg.query('select * from questionnaires')).rows;assert.equal(progress.intakeProgress(rows).readyToSchedule,false);
      assert.equal((await send(order[1])).status,200);
      rows=(await pg.query('select * from questionnaires')).rows;assert.equal(progress.intakeProgress(rows).readyToSchedule,true);
      assert.equal((await pg.query('select status from intake_sessions')).rows[0].status,'profile_ready');
      const before=JSON.stringify(rows);
      const late=await send(order[0],'PATCH',{1:3});assert.equal((await late.json()).already_submitted,true);
      assert.equal(JSON.stringify((await pg.query('select * from questionnaires')).rows),before);
      assert.equal((await pg.query('select status from intake_sessions')).rows[0].status,'profile_ready');
    });
    await t.test('partial drafts never qualify and incomplete POST is rejected',async()=>{
      await reset();assert.equal((await send('vanderbilt_parent','PATCH',{1:0})).status,200);
      assert.equal((await send('vanderbilt_parent','POST',{1:0})).status,400);
      assert.equal(progress.intakeProgress((await pg.query('select * from questionnaires')).rows).readyToSchedule,false);
    });
    await t.test('database failures and expired teacher links do not report success',async()=>{
      await reset();failures.write=true;assert.equal((await send('vanderbilt_parent')).status,503);failures.write=false;
      await pg.exec("update intake_sessions set teacher_token_expires_at='2020-01-01'");assert.equal((await send('vanderbilt_teacher')).status,403);
      assert.equal(progress.intakeProgress((await pg.query('select * from questionnaires')).rows).readyToSchedule,false);
    });
    await t.test('concurrent final submissions cannot downgrade ready; final beats simultaneous PATCH',async()=>{
      await reset();const results=await Promise.all([send('vanderbilt_parent'),send('vanderbilt_teacher'),send('vanderbilt_parent','PATCH',{1:2})]);assert.ok(results.every(r=>r.status===200));
      const rows=(await pg.query('select * from questionnaires')).rows;assert.equal(progress.intakeProgress(rows).readyToSchedule,true);assert.deepEqual(rows.find(q=>q.type==='vanderbilt_parent').responses,answers('vanderbilt_parent'));
      assert.equal((await pg.query('select status from intake_sessions')).rows[0].status,'profile_ready');
    });
  }finally{await pg.close();}
});

test('staff booking API enforces two submitted questionnaires and denies unauthenticated access',async()=>{
  let authorized=false,forms=[form('vanderbilt_parent')],appointments=[],readError=false,writes=0;
  const db={from(table){const q={select(){return q;},eq(){return q;},maybeSingle(){return q;},then(resolve){return Promise.resolve(table==='intake_sessions'?{data:{id:'case',patient_id:'patient',status:'profile_ready',patients:{first_name:'Test'},parents:{full_name:'Test'}},error:null}:{data:table==='questionnaires'?forms:appointments,error:readError?new Error('unavailable'):null}).then(resolve);},insert(){writes++;throw new Error('unexpected write');}};return q;}};
  const route=compile('app/api/admin/appointments/create/route.ts',{
    '@/lib/admin/auth':{getCurrentStaff:async()=>authorized?{id:'staff'}:null},
    '@/lib/supabase':{getSupabaseAdmin:()=>db},
    '@/lib/google-calendar':{checkAvailability:async()=>{throw new Error('unexpected calendar call');},createCalendarEvent:async()=>{throw new Error('unexpected calendar write');}}
  });
  const req={json:async()=>({session_id:'case',appointment_type:'assessment',scheduled_at:'2099-01-07T14:00:00Z'})};
  assert.equal((await route.POST(req)).status,403);authorized=true;
  assert.equal((await route.POST(req)).status,409);
  forms.push(form('vanderbilt_teacher'));appointments=[{status:'scheduled'}];assert.equal((await route.POST(req)).status,409);
  appointments=[];readError=true;assert.equal((await route.POST(req)).status,503);assert.equal(writes,0);
});
