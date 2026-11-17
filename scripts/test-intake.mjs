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
test('a new assessment is blocked only by an upcoming active visit',()=>{
  const p=form('vanderbilt_parent'),t=form('vanderbilt_teacher');
  const past='2026-01-07T14:00:00Z',future=new Date(Date.now()+7*86400000).toISOString();
  assert.equal(progress.intakeProgress([p,t],[{status:'scheduled',scheduled_at:future}]).canBookAssessment,false);
  assert.equal(progress.intakeProgress([p,t],[{status:'scheduled',scheduled_at:past}]).canBookAssessment,true);
  assert.equal(progress.intakeProgress([p,t],[{status:'attended',scheduled_at:past}]).canBookAssessment,true);
  assert.equal(progress.intakeProgress([p,t],[{status:'no_show',scheduled_at:past}]).canBookAssessment,true);
  assert.equal(progress.intakeProgress([p,t],[{status:'cancelled',scheduled_at:future}]).canBookAssessment,true);
  assert.equal(progress.intakeProgress([p,{...t,is_complete:false}],[]).canBookAssessment,false);
  assert.equal(progress.intakeProgress([p,t],[{status:'scheduled',scheduled_at:past}]).stage,'scheduled');
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
  const pg=new PGlite(),id=randomUUID(),failures={write:false};
  let parentToken=randomUUID(),teacherToken=randomUUID();
  await pg.exec('create table intake_sessions(id uuid primary key,status text,parent_token text,teacher_token text,parent_token_expires_at timestamptz,teacher_token_expires_at timestamptz);create table questionnaires(id uuid primary key default gen_random_uuid(),session_id uuid,type text,respondent text,responses jsonb,free_text text,intro_data jsonb,is_complete boolean,started_at timestamptz,submitted_at timestamptz,unique(session_id,type,respondent));create table scores(id uuid default gen_random_uuid(),session_id uuid,questionnaire_id uuid,scope text,raw_scores jsonb,flags jsonb,engine_version text,presentation text,confidence text,alerts jsonb);');
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
    await t.test('production-format text links save drafts and final answers for both respondents',async()=>{
      for(const [p,tok] of [
        ['p_'+'Ab9_-'.repeat(6)+'Xy','t_'+'Zy8_-'.repeat(6)+'Ab'],
        ['a'.repeat(48),'b'.repeat(48)],
      ]){
        parentToken=p;teacherToken=tok;await reset();
        for(const type of ['vanderbilt_parent','vanderbilt_teacher']){
          assert.equal((await send(type,'PATCH',{1:2})).status,200);
          assert.equal((await send(type)).status,200);
        }
        const rows=(await pg.query('select * from questionnaires')).rows;
        assert.equal(progress.intakeProgress(rows).readyToSchedule,true);
        assert.deepEqual(rows.find(q=>q.type==='vanderbilt_parent').responses,answers('vanderbilt_parent'));
        const before=JSON.stringify(rows);
        assert.equal((await (await send('vanderbilt_parent','PATCH',{1:3})).json()).already_submitted,true);
        assert.equal(JSON.stringify((await pg.query('select * from questionnaires')).rows),before);
      }
    });
    await t.test('text-link compatibility never bypasses lookup, expiry or respondent separation',async()=>{
      parentToken='p_'+'a'.repeat(32);teacherToken='t_'+'b'.repeat(32);await reset();
      const request=token=>route.PATCH({json:async()=>({token,type:'vanderbilt_parent',responses:{1:0}})});
      for(const token of ['p_'+'c'.repeat(32),teacherToken,'not-a-token','p_'+'a'.repeat(31),'p_'+'a'.repeat(32)+'?', 'a'.repeat(1000)]){
        assert.equal((await request(token)).status,403);
      }
      assert.equal((await pg.query('select count(*)::int as n from questionnaires')).rows[0].n,0);
      await pg.exec("update intake_sessions set parent_token_expires_at='2020-01-01'");
      const expired=await request(parentToken);
      assert.equal(expired.status,403);assert.equal((await expired.json()).error,'expired_token');
      assert.equal((await pg.query('select count(*)::int as n from questionnaires')).rows[0].n,0);
    });
  }finally{await pg.close();}
});

test('staff booking API enforces two submitted questionnaires and denies unauthenticated access',async()=>{
  let authorized=false,forms=[form('vanderbilt_parent')],appointments=[],readError=false,writes=0,status='profile_ready';
  const db={from(table){const q={select(){return q;},eq(){return q;},maybeSingle(){return q;},then(resolve){return Promise.resolve(table==='intake_sessions'?{data:{id:'case',patient_id:'patient',status,patients:{first_name:'Test'},parents:{full_name:'Test'}},error:null}:{data:table==='questionnaires'?forms:appointments,error:readError?new Error('unavailable'):null}).then(resolve);},insert(){writes++;return {select(){return {single:async()=>({data:{id:'test-appointment'},error:null})};}};}};return q;}};
  const route=compile('app/api/admin/appointments/create/route.ts',{
    '@/lib/admin/auth':{getCurrentStaff:async()=>authorized?{id:'staff'}:null},
    '@/lib/supabase':{getSupabaseAdmin:()=>db},
    '@/lib/calendar-consistency':{syncAppointment:async()=> 'synced'},
    '@/lib/google-calendar':{getCalendarId:()=> 'test-calendar',checkAvailability:async()=>{throw new Error('unexpected calendar call');},createCalendarEvent:async()=>{throw new Error('unexpected calendar write');}}
  });
  const req={headers:new Headers({origin:'https://app.test'}),nextUrl:new URL('https://app.test/api/admin/appointments/create'),json:async()=>({session_id:'case',appointment_type:'assessment',scheduled_at:'2099-01-07T14:00:00Z'})};
  assert.equal((await route.POST(req)).status,403);authorized=true;
  assert.equal((await route.POST(req)).status,409);
  forms.push(form('vanderbilt_teacher'));appointments=[{status:'scheduled'}];assert.equal((await route.POST(req)).status,409);
  appointments=[];readError=true;assert.equal((await route.POST(req)).status,503);assert.equal(writes,0);
  readError=false;
  for (status of ['closed','completed','reported','cancelled']) {
    forms=[form('vanderbilt_parent')]; assert.equal((await route.POST(req)).status,409);
    forms.push(form('vanderbilt_teacher')); appointments=[{status:'scheduled'}]; assert.equal((await route.POST(req)).status,409);
    appointments=[]; const result=await route.POST(req); assert.equal(result.status,200); assert.equal((await result.json()).ok,true);
  }
  assert.equal(writes,4);
});

test('the public onboarding form collects every field the intake API requires',()=>{
  // Regression: the API began requiring child_id while this form did not ask for it, so every submission failed with a generic error.
  const api=fs.readFileSync(path.join(root,'app/api/intake/route.ts'),'utf8'), form=fs.readFileSync(path.join(root,'components/intake/OnboardingForm.tsx'),'utf8');
  const schema=api.slice(api.indexOf('z.object({'),api.indexOf('export async function POST'));
  const required=[...schema.matchAll(/^\s*([a-z_]+)\s*:(.*)$/gm)].filter(([, ,rule])=>!/optional\(\)|default\(/.test(rule)).map(([,key])=>key);
  assert.ok(required.includes('child_id')&&required.includes('parent_phone'),'schema parsing found the required fields');
  const state=form.match(/useState<Data>\(\{([^}]*)\}\)/)[1];
  for(const key of required)assert.match(state,new RegExp('(^|,)'+key+':'),`OnboardingForm state is missing ${key}`);
});

// A child who already has a file continues it instead of receiving a second one.
function intakeDb(pg, failures = {}) {
  const run = async (sql, params) => { try { return { rows: (await pg.query(sql, params)).rows, error: null }; } catch (error) { return { rows: null, error }; } };
  return {
    async rpc(name, a) {
      assert.equal(name, 'create_intake_session');
      const patient = (await pg.query('insert into patients(first_name,last_name,birth_date) values($1,$2,$3) returning id', [a.p_first_name, a.p_last_name, a.p_birth_date])).rows[0].id;
      const parent = (await pg.query('insert into parents(patient_id,full_name,phone) values($1,$2,$3) returning id', [patient, a.p_parent_name, a.p_parent_phone])).rows[0].id;
      const token = 'p_' + randomUUID().replace(/-/g, '');
      const session = (await pg.query("insert into intake_sessions(patient_id,primary_parent_id,parent_token,parent_token_expires_at) values($1,$2,$3,now()+interval '30 days') returning id", [patient, parent, token])).rows[0].id;
      return { data: session, error: null };
    },
    from(table) {
      let action = 'select', columns = '*', values, filters = [], one = false;
      const q = {
        select(value = '*') { columns = value; return q; },
        eq(key, value) { filters.push([key + '=', value]); return q; },
        in(key, value) { filters.push([key + '= any', value]); return q; },
        is(key, value) { assert.equal(value, null); filters.push([key + ' is null']); return q; },
        insert(value) { action = 'insert'; values = value; return q; },
        update(value) { action = 'update'; values = value; return q; },
        single() { one = true; return q; }, maybeSingle() { one = true; return q; },
        then(resolve, reject) { return (async () => {
          if (failures.lookup && action === 'select' && table === 'patients') return { data: null, error: new Error('simulated lookup failure') };
          const params = [], param = v => { params.push(v !== null && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v); return '$' + params.length; };
          let sql = action === 'select' ? `select ${columns} from ${table}` : action === 'update' ? `update ${table} set ${Object.entries(values).map(([k, v]) => `${k}=${param(v)}`).join(',')}`
            : `insert into ${table}(${Object.keys(values).join(',')}) values(${Object.values(values).map(param).join(',')})`;
          if (filters.length) sql += ' where ' + filters.map(([op, v]) => v === undefined ? op : op.endsWith('any') ? `${op}(${param(v)})` : op + param(v)).join(' and ');
          if (action !== 'select') sql += ' returning ' + columns;
          const r = await run(sql, params);
          return r.error ? { data: null, error: r.error } : { data: one ? r.rows[0] ?? null : r.rows, error: null };
        })().then(resolve, reject); },
      };
      return q;
    },
  };
}
test('the intake form continues an existing file instead of opening a second one', async t => {
  const pg = new PGlite(), failures = {};
  await pg.exec(`
    create table patients(id uuid primary key default gen_random_uuid(),first_name text,last_name text,birth_date text,national_id text,gender text,grade text,school text,medical_notes text,archived_at timestamptz);
    create table parents(id uuid primary key default gen_random_uuid(),patient_id uuid,full_name text,phone text,relation text,email text,consent_given boolean,consent_at timestamptz,consent_version text,consent_ip text);
    create table intake_sessions(id uuid primary key default gen_random_uuid(),patient_id uuid,primary_parent_id uuid,status text default 'created',parent_token text,parent_token_expires_at timestamptz,reason_for_referral text,teacher_name text,teacher_phone text,created_at timestamptz default now());
    create table dashboard_case_archive(session_id uuid primary key);
    create table audit_log(id serial primary key,actor_type text,action text,entity_type text,entity_id uuid,metadata jsonb);
    create table notifications(id serial primary key,session_id uuid,recipient_type text,channel text,template text,scheduled_for timestamptz,status text,payload jsonb);`);
  const route = compile('app/api/intake/route.ts', { '@/lib/supabase': { getSupabaseAdmin: () => intakeDb(pg, failures) } });
  const base = { child_first_name: 'نور', child_last_name: 'Test', child_id: '123456782', birth_date: '2015-03-04', parent_name: 'Parent One', parent_phone: '050-111-2233', relation: 'mother', consent: true };
  const post = async body => { const r = await route.POST({ headers: new Headers({ origin: 'https://app.test' }), json: async () => ({ ...base, ...body }) }); return { status: r.status, body: await r.json() }; };
  const count = async table => (await pg.query(`select count(*)::int n from ${table}`)).rows[0].n;
  const outcomes = async () => (await pg.query("select metadata->>'outcome' o from audit_log where action='intake_repeat_attempt' order by id")).rows.map(r => r.o);
  try {
    const first = await post({});
    assert.equal(first.status, 200); assert.equal(first.body.existing, undefined); assert.equal(await count('patients'), 1);

    await t.test('same child and a phone on the file: same link, nothing new is created', async () => {
      for (const parent_phone of ['0501112233', '+972 50 111 2233', '٠٥٠١١١٢٢٣٣']) {
        const again = await post({ parent_phone, child_first_name: 'Nour', birth_date: '2015-03-05' });
        assert.equal(again.status, 200); assert.equal(again.body.existing, true); assert.equal(again.body.parent_token, first.body.parent_token);
        assert.equal(again.body.parent_url, 'https://app.test/questionnaire/parent/' + first.body.parent_token); assert.equal('session_id' in again.body, false);
      }
      assert.equal(await count('patients'), 1); assert.equal(await count('intake_sessions'), 1); assert.equal(await count('parents'), 1);
      assert.deepEqual(await outcomes(), ['continued', 'continued', 'continued']);
    });
    await t.test('a lapsed link is renewed without changing it', async () => {
      await pg.exec("update intake_sessions set parent_token_expires_at='2020-01-01'");
      const again = await post({});
      assert.equal(again.body.parent_token, first.body.parent_token);
      assert.equal((await pg.query('select parent_token_expires_at>now() ok from intake_sessions')).rows[0].ok, true);
    });
    await t.test('another phone never receives the link and learns of the file only with the birth date', async () => {
      const other = await post({ parent_phone: '0529998877' });
      assert.equal(other.status, 409); assert.equal(other.body.code, 'existing_file');
      const guess = await post({ parent_phone: '0529998877', birth_date: '2014-01-01' });
      assert.equal(guess.status, 409); assert.equal(guess.body.code, 'details_mismatch');
      for (const reply of [other, guess]) { assert.equal(typeof reply.body.error, 'string'); assert.equal(JSON.stringify(reply.body).includes(first.body.parent_token), false); assert.equal('parent_token' in reply.body, false); }
      assert.equal(await count('patients'), 1);
      const logged = (await pg.query("select entity_id,metadata from audit_log order by id desc limit 1")).rows[0];
      assert.equal(logged.entity_id, first.body.session_id); assert.equal(logged.metadata.parent_phone, '0529998877');
    });
    await t.test('a finished file is not reopened or duplicated', async () => {
      await pg.exec("update intake_sessions set status='reported'");
      const ended = await post({});
      assert.equal(ended.status, 409); assert.equal(ended.body.code, 'existing_file_ended'); assert.equal(await count('patients'), 1);
      await pg.exec("update intake_sessions set status='booked'");
    });
    await t.test('of two files for one child, the parent is sent to the one further along', async () => {
      const patient = (await pg.query("insert into patients(first_name,last_name,birth_date,national_id) values('نور','Test','2015-03-04','123456782') returning id")).rows[0].id;
      await pg.query("insert into parents(patient_id,full_name,phone) values($1,'Parent One','0501112233')", [patient]);
      await pg.query("insert into intake_sessions(patient_id,status,parent_token,parent_token_expires_at) values($1,'created','p_newer_empty_file',now()+interval '30 days')", [patient]);
      assert.equal((await post({})).body.parent_token, first.body.parent_token);
      await pg.query('delete from intake_sessions where patient_id=$1', [patient]); await pg.query('delete from parents where patient_id=$1', [patient]); await pg.query('delete from patients where id=$1', [patient]);
    });
    await t.test('cancelled, staff-archived and archived-patient files do not block a new file', async () => {
      await pg.exec("update intake_sessions set status='cancelled'");
      const afterCancel = await post({});
      assert.equal(afterCancel.status, 200); assert.equal(afterCancel.body.existing, undefined); assert.notEqual(afterCancel.body.parent_token, first.body.parent_token); assert.equal(await count('patients'), 2);
      await pg.query('insert into dashboard_case_archive(session_id) values($1)', [afterCancel.body.session_id]);
      const afterArchive = await post({});
      assert.equal(afterArchive.status, 200); assert.equal(afterArchive.body.existing, undefined); assert.equal(await count('patients'), 3);
      await pg.exec('update patients set archived_at=now()');
      assert.equal((await post({})).body.existing, undefined); assert.equal(await count('patients'), 4);
    });
    await t.test('files opened before the ID was collected match on phone, birth date and first name; a twin still gets a file', async () => {
      await pg.exec('truncate patients,parents,intake_sessions,dashboard_case_archive,audit_log');
      const old = await post({ child_first_name: 'מֹשֶׁה', child_id: '000000018' });
      await pg.exec('update patients set national_id=null');
      const again = await post({ child_first_name: ' משה ', child_id: '000000026' });
      assert.equal(again.status, 200); assert.equal(again.body.existing, true); assert.equal(again.body.parent_token, old.body.parent_token);
      assert.equal((await post({ child_first_name: 'משה', child_id: '000000026', parent_phone: '0529998877' })).body.existing, undefined);
      assert.equal((await post({ child_first_name: 'אהרן', child_id: '000000034' })).body.existing, undefined);
      assert.equal(await count('patients'), 3);
    });
    await t.test('a failed lookup does not stop a family from opening a file', async () => {
      await pg.exec('truncate patients,parents,intake_sessions,dashboard_case_archive,audit_log');
      failures.lookup = true;
      const opened = await post({});
      assert.equal(opened.status, 200); assert.equal(typeof opened.body.parent_token, 'string'); assert.equal(await count('patients'), 1);
      failures.lookup = false;
    });
  } finally { await pg.close(); }
});
test('the status page accepts every personal-link format the system issues', () => {
  const { intakeLinkTokenSchema } = compile('lib/intake/tokens.ts');
  for (const token of ['p_' + 'Ab9_-'.repeat(6) + 'Xy', 't_' + 'Zy8_-'.repeat(6) + 'Ab', 'a'.repeat(48), randomUUID()]) assert.equal(intakeLinkTokenSchema.safeParse(token).success, true);
  for (const token of ['', 'p_short', 'x_' + 'a'.repeat(32), 'a'.repeat(47), 'p_' + 'a'.repeat(32) + '/']) assert.equal(intakeLinkTokenSchema.safeParse(token).success, false);
  const page = fs.readFileSync(path.join(root, 'app/onboarding/status/[token]/page.tsx'), 'utf8');
  assert.match(page, /intakeLinkTokenSchema\.safeParse\(params\.token\)/); assert.doesNotMatch(page, /uuid\(\)\.safeParse\(params\.token\)/);
});
