// Offline tests for therapist appointment edits (reschedule / cancel / remove).
// In-memory Postgres (PGlite) with the real migrations, a PG-backed fake of the
// Supabase client, a fake Google Calendar and a fake WhatsApp sender.
// Nothing here contacts Supabase, Google or UltraMsg.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
function compile(file,overrides={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>overrides[n]??(n==='@/lib/shared/national-id'?compile('lib/shared/national-id.ts'):require(n)),m,m.exports);return m.exports;}
let passed=0;const pass=s=>{passed++;console.log('PASS',s);};

// ---------- pure: messages and note validation ----------
const reasons=compile('lib/therapists/change-reasons.ts');
const msg=compile('lib/therapists/change-message.ts',{'./change-reasons':reasons});
const prev='2026-12-02T14:00:00.000Z',next='2026-12-09T15:30:00.000Z'; // Wed 16:00 -> Wed 17:30 Israel time
const base={language:'he',contactName:'דנה כהן',patientName:'יואב',therapistName:'רנא חלבי',previousAt:prev,newAt:next,note:null};
assert.equal(msg.buildChangeMessage({...base,kind:'reschedule',reason:'therapist_personal'}),
 'שלום דנה כהן,\nהטיפול של יואב עם רנא במכון ילדי הקסם, שנקבע ליום רביעי, 2.12.2026 בשעה 16:00, הועבר ליום רביעי, 9.12.2026 בשעה 17:30 מסיבות אישיות של המטפלת.\nלשאלות או לשינוי נוסף השיבו להודעה זו או התקשרו 054-402-0043.');
assert.equal(msg.buildChangeMessage({...base,kind:'cancel',reason:'holiday',note:'נתראה בשבוע הבא'}),
 'שלום דנה כהן,\nהטיפול של יואב עם רנא במכון ילדי הקסם, שנקבע ליום רביעי, 2.12.2026 בשעה 16:00, בוטל עקב חג או חופשה במכון. עמכם הסליחה.\nהודעה מהמטפלת: נתראה בשבוע הבא\nנתאם איתכם מועד חדש. לשאלות השיבו להודעה זו או התקשרו 054-402-0043.');
pass('Hebrew reschedule/cancel text exactly as in the brief (no double "יום", note line only with a note)');
const heCancel={therapist_personal:'בוטל מסיבות אישיות של המטפלת. עמכם הסליחה.',therapist_absence:'בוטל עקב היעדרות המטפלת. עמכם הסליחה.',parent_request:'בוטל לבקשתכם.\n',child_sick:'בוטל לבקשתכם.\n',holiday:'בוטל עקב חג או חופשה במכון. עמכם הסליחה.',no_show:'16:00, בוטל.\n',other:'16:00, בוטל. עמכם הסליחה.'};
const heMove={therapist_personal:'17:30 מסיבות אישיות של המטפלת.',therapist_absence:'17:30 עקב היעדרות המטפלת.',parent_request:'17:30 לבקשתכם.',child_sick:'17:30 לבקשתכם.',holiday:'17:30 עקב חג או חופשה במכון.',no_show:'17:30.\n',other:'17:30.\n'};
for(const {key} of reasons.CHANGE_REASONS){
 assert.ok(msg.buildChangeMessage({...base,kind:'cancel',reason:key}).includes(heCancel[key]),key);
 assert.ok(msg.buildChangeMessage({...base,kind:'reschedule',reason:key}).includes(heMove[key]),key);
 for(const language of ['he','ar','en'])for(const kind of ['reschedule','cancel']){
  const t=msg.buildChangeMessage({...base,language,kind,reason:key,note:'test note'});
  assert.ok(t.includes('054-402-0043')&&t.includes('test note')&&t.includes('דנה כהן')&&t.includes('יואב'));
  assert.ok(!/מחלה|مرض|\b(sick|ill|illness)\b/i.test(t),'no health details: '+key);
  assert.ok(!/https?:|www\./.test(t));
  if(language!=='he')assert.ok(!/[\u0590-\u05ff]/.test(t.replace(/דנה כהן|יואב|רנא/g,'')),'no Hebrew in '+language);
  const sorry={he:'עמכם הסליחה',ar:'نعتذر',en:'apologise'}[language];
  if(kind==='cancel')assert.equal(t.includes(sorry),!['parent_request','child_sick','no_show'].includes(key),language+key);else assert.ok(!t.includes(sorry));
 }
}
assert.ok(!msg.buildChangeMessage({...base,kind:'cancel',reason:'no_show'}).includes('הודעה מהמטפלת'));
pass('every reason x language x kind: phrase, apology rule, note line, no health details, no Hebrew in ar/en');
const ar=msg.buildChangeMessage({...base,language:'ar',kind:'reschedule',reason:'parent_request'});
assert.match(ar,/^مرحبًا דנה כהן،\nتم نقل جلسة יואב مع רנא في معهد أطفال السحر، التي كانت محددة يوم الأربعاء 2\.12\.2026 الساعة 16:00، إلى يوم الأربعاء 9\.12\.2026 الساعة 17:30 بناءً على طلبكم\.\n/);
const en=msg.buildChangeMessage({...base,language:'en',kind:'cancel',reason:'therapist_absence'});
assert.equal(en.split('\n')[1],"יואב's session with רנא at the Magic Kids Institute, scheduled for Wednesday 2 December 2026 at 16:00, has been cancelled due to the therapist's absence. We apologise for the inconvenience.");
assert.equal(msg.buildChangeMessage({...base,language:'xx',kind:'cancel',reason:'other'}).split('\n')[0],'שלום דנה כהן,');
assert.throws(()=>msg.buildChangeMessage({...base,kind:'reschedule',newAt:null,reason:'other'}),/invalid_request/);
pass('Arabic and English wording, Israel time, Western digits; unknown language falls back to Hebrew');

const bad=['ראו https://x.co','www.example.org','wa.me/972544020043','כתבו ל-example.com','magickids.co.il/booking','mail a@b.io','t.me/abc','javascript:alert(1)','tel:0544020043','x\u202eabc','zero\u200bwidth','bell\u0007','a'.repeat(301),42];
for(const n of bad)assert.throws(()=>msg.validateNote(n,false),e=>e.message==='note_invalid',String(n));
assert.equal(msg.validateNote('  נתראה ביום ראשון בשעה 16.30, תודה  ',false),'נתראה ביום ראשון בשעה 16.30, תודה');
assert.equal(msg.validateNote('שורה\nשנייה',false),'שורה שנייה');
assert.equal(msg.validateNote('אפשר להתקשר 054-402-0043',false),'אפשר להתקשר 054-402-0043');
assert.equal(msg.validateNote('א'.repeat(300),false).length,300);
assert.equal(msg.validateNote('   ',false),null);assert.equal(msg.validateNote(undefined,false),null);
assert.throws(()=>msg.validateNote('  ',true),e=>e.message==='note_required');
assert.throws(()=>msg.validateChange('other',''),e=>e.message==='note_required');
assert.throws(()=>msg.validateChange('not_interested','x'),e=>e.message==='invalid_reason');
assert.throws(()=>msg.validateRemoval('child_sick','x'),e=>e.message==='invalid_reason');
assert.throws(()=>msg.validateRemoval('other',null),e=>e.message==='note_required');
assert.deepEqual(msg.validateChange('child_sick',''),{reason:'child_sick',note:null});
assert.deepEqual(msg.validateRemoval('duplicate',undefined),{reason:'duplicate',note:null});
pass('note rules: links/schemes/domains, control, bidi and zero-width rejected; 300 max; "other" needs a note; reason enums');

const schedule=compile('lib/booking/schedule.ts');
const slotsMod=compile('lib/therapists/request-slots.ts',{'../booking/schedule':schedule});
assert.deepEqual(slotsMod.subtractBusy([{start:'2026-01-01T10:00:00.000Z',end:'2026-01-01T13:00:00.000Z'},{start:'2026-01-01T14:00:00.000Z',end:'2026-01-01T15:00:00.000Z'}],{start:'2026-01-01T11:00:00.000Z',end:'2026-01-01T12:00:00.000Z'}),
 [{start:'2026-01-01T10:00:00.000Z',end:'2026-01-01T11:00:00.000Z'},{start:'2026-01-01T12:00:00.000Z',end:'2026-01-01T13:00:00.000Z'},{start:'2026-01-01T14:00:00.000Z',end:'2026-01-01T15:00:00.000Z'}]);
pass('own appointment interval is removed from Google busy time, other busy time kept');

// ---------- database + server logic ----------
const pg=new PGlite();
const names={
 reschedule_treatment_request:['p_id','p_therapist','p_start','p_mode','p_change','p_reason','p_note','p_actor','p_staff','p_whatsapp'],
 cancel_treatment_appointment:['p_id','p_therapist','p_change','p_reason','p_note','p_actor','p_staff','p_whatsapp'],
 remove_treatment_patient:['p_id','p_therapist','p_change','p_reason','p_note','p_actor','p_staff'],
 schedule_assigned_treatment:['p_id','p_therapist','p_start','p_staff'],
};
let failTable=null;
const db={
 async rpc(name,args){try{const keys=names[name];const r=await pg.query(`select ${name}(${keys.map((_,i)=>'$'+(i+1)).join(',')}) as value`,keys.map(k=>args[k]??null));return {data:r.rows[0].value,error:null};}catch(error){return {data:null,error};}},
 from(table){let columns='*',single=false,filters=[],order='',limit='',updates=null;
  const q={select(v='*'){columns=v;return q;},update(v){updates=v;return q;},neq(k,v){filters.push([k,'<>',v]);return q;},eq(k,v){filters.push([k,'=',v]);return q;},gt(k,v){filters.push([k,'>',v]);return q;},gte(k,v){filters.push([k,'>=',v]);return q;},lt(k,v){filters.push([k,'<',v]);return q;},lte(k,v){filters.push([k,'<=',v]);return q;},in(k,v){filters.push([k,'in',v]);return q;},order(k,opts){order=` order by ${k} ${opts?.ascending===false?'desc':'asc'}`;return q;},limit(n){limit=` limit ${Number(n)}`;return q;},single(){single=true;return q;},maybeSingle(){single=true;return q;},
   then(resolve,reject){return (async()=>{try{if(failTable===table)throw new Error('relation does not exist');const params=[];const param=v=>{params.push(v);return '$'+params.length;};const where=filters.map(([k,op,v])=>op==='in'?`${k} in (${v.map(param).join(',')})`:`${k}${op}${param(v)}`).join(' and ');
    const update=updates?Object.entries(updates).map(([k,v])=>`${k}=${param(v)}`).join(','):'';
    const r=await pg.query(updates?`update ${table} set ${update}${where?' where '+where:''} returning ${columns}`:`select ${columns} from ${table}${where?' where '+where:''}${order}${limit}`,params);
    const rows=r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v instanceof Date?v.toISOString():v])));return {data:single?rows[0]??null:rows,error:null};}catch(error){return {data:null,error};}})().then(resolve,reject);}
  };return q;
 }
};
// Google Calendar fake with tombstones: a deleted event id stays as status 'cancelled'.
const events=new Map();let externalBusy=[],deletes=[];
const google={
 freebusy:{async query({requestBody:b}){return {data:{calendars:{[b.items[0].id]:{busy:externalBusy}}}};}},
 events:{
  async get({eventId}){if(!events.has(eventId))throw {code:404};return {data:events.get(eventId)};},
  async list(){return {data:{items:[]}};},
  async insert({requestBody}){if(events.has(requestBody.id))throw {code:409};events.set(requestBody.id,{...requestBody,status:'confirmed'});return {data:requestBody};},
  async patch({eventId,requestBody}){const e={...events.get(eventId),...requestBody};events.set(eventId,e);return {data:e};},
  async delete({eventId,sendUpdates}){assert.equal(sendUpdates,'none');deletes.push(eventId);if(!events.has(eventId)||events.get(eventId).status==='cancelled')throw {code:410};events.get(eventId).status='cancelled';return {};},
 }
};
const sent=[];
const notifyOnce=async(key,phone,text,opts)=>{sent.push({key,phone,text,opts});return 'accepted';};
process.env.GOOGLE_SERVICE_ACCOUNT_JSON='{}';process.env.GOOGLE_CALENDAR_ID='test-calendar';process.env.BOOKING_HASH_SECRET='not-a-real-secret-test-only';
const supa={'@/lib/supabase':{getSupabaseAdmin:()=>db}},gcal={'@/lib/google-calendar':{getCalendarClient:()=>google,getCalendarId:()=>'test-calendar'}};
const consistency=compile('lib/calendar-consistency.ts',{...supa,...gcal,'@/lib/calendar-title':{eventTitle:()=>'t'},'@/lib/pediatrics-calendar':{getPediatricsCalendarId:()=>'p'}});
const calendar=compile('lib/therapists/calendar.ts',{...supa,...gcal,'@/lib/calendar-consistency':consistency});
const booking=compile('lib/therapists/parent-booking.ts',{...supa,...gcal,'@/lib/booking/schedule':schedule,'./request-slots':slotsMod,'@/lib/treatments/schema':compile('lib/treatments/schema.ts')});
const changes=compile('lib/therapists/appointment-changes.ts',{...supa,'@/lib/moxo/notification':{notifyOnce},'./calendar':calendar,'./parent-booking':booking,'./change-reasons':reasons,'./change-message':msg});
try{
 await pg.exec(`create role anon;create role authenticated;create role service_role;
  create table public.appointments(id uuid primary key,scheduled_at timestamptz,duration_minutes int,gcal_calendar_id text,gcal_event_id text,appointment_type text,status text);
  create table public.website_bookings(id uuid primary key,starts_at timestamptz,ends_at timestamptz,calendar_id text,event_id text,status text);`);
 await pg.exec(fs.readFileSync('db/migrations/20260909_moxo_requests.sql','utf8'));
 for(const f of ['20260912062810_clinic_self_service.sql','20261002193341_therapists_and_treatment_workflow.sql','20261002201639_recruitment_and_therapist_removal.sql','20261002213054_moxo_tuesday_thursday_hourly.sql','20261002214754_moxo_google_calendar_sync.sql','20261008052117_therapist_parent_booking.sql','20261014002916_calendar_consistency.sql','20261105120000_therapist_booking_mode.sql','20261106150000_booking_profile_contact_phone.sql','20261111110000_request_national_ids.sql','20261127090000_treatment_request_changes.sql'])
  await pg.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 pass('migration applies on top of the existing schema (PGlite)');
 for(const role of ['anon','authenticated']){const r=(await pg.query(`select has_table_privilege('${role}','treatment_request_changes','SELECT') as t,has_function_privilege('${role}','reschedule_treatment_request(uuid,uuid,timestamptz,text,uuid,text,text,text,uuid,text)','EXECUTE') as a,has_function_privilege('${role}','cancel_treatment_appointment(uuid,uuid,uuid,text,text,text,uuid,text)','EXECUTE') as b,has_function_privilege('${role}','remove_treatment_patient(uuid,uuid,uuid,text,text,text,uuid)','EXECUTE') as c`)).rows[0];assert.deepEqual(r,{t:false,a:false,b:false,c:false});}
 assert.equal((await pg.query("select relrowsecurity from pg_class where relname='treatment_request_changes'")).rows[0].relrowsecurity,true);
 pass('new table has RLS and no anon/authenticated access; functions are service-only');

 const tid=randomUUID(),other=randomUUID();
 const dayIn=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
 const d1=dayIn(7),d2=dayIn(14),dow=new Date(d1+'T12:00:00Z').getUTCDay();
 const at=(d,min)=>schedule.localToUTC(d,min).toISOString();
 await pg.query("insert into therapists(id,name,email,treatments,hours,duration) values($1,'Rana Test','r@example.com',array['emotional'],$2,60),($3,'Other T','o@example.com',array['emotional'],$2,60)",[tid,JSON.stringify([{day:dow,start:900,end:1200}]),other]);
 const req=async(lang='he')=>{const id=randomUUID();await pg.query("insert into treatment_requests(id,patient_name,contact_name,phone,ip_hash,treatment,language,therapist_id) values($1,'Yoav','Dana','+972501234567','t','emotional',$2,$3)",[id,lang,tid]);return id;};
 const row=async id=>(await pg.query('select status,scheduled_at,duration_minutes,calendar_sync,calendar_event_id from treatment_requests where id=$1',[id])).rows[0];
 const changeRows=async id=>(await pg.query('select * from treatment_request_changes where request_id=$1 order by created_at',[id])).rows;
 const book=async(id,start)=>{assert.equal((await db.rpc('schedule_assigned_treatment',{p_id:id,p_therapist:tid,p_start:start,p_staff:null})).data,'scheduled');assert.equal(await calendar.syncTreatment(id),'synced');};
 const portal={therapistId:tid,staffId:null};

 // General portal: reschedule against therapists.hours
 const a=await req(),b=await req('ar');
 await book(a,at(d1,960));await book(b,at(d1,1080));
 const evA=(await row(a)).calendar_event_id;assert.ok(events.get(evA));
 const sentBefore=sent.length;
 const before=await row(a);
 await assert.rejects(changes.rescheduleTreatment(a,portal,{start:at(d1,1200),reason:'holiday',note:'',notify:true}),e=>e.message==='slot_taken');
 await assert.rejects(changes.rescheduleTreatment(a,portal,{start:at(d1,1050),reason:'holiday',note:'',notify:true}),e=>e.message==='slot_taken'); // overlaps b
 await assert.rejects(changes.rescheduleTreatment(a,portal,{start:at(d1,960),reason:'holiday',note:'',notify:true}),e=>e.message==='invalid_state');
 await assert.rejects(changes.rescheduleTreatment(a,{therapistId:other,staffId:null},{start:at(d1,1020),reason:'holiday',notify:true}),e=>e.message==='not_assigned');
 await assert.rejects(changes.rescheduleTreatment(a,portal,{start:at(d1,1020),reason:'other',note:'',notify:true}),e=>e.message==='note_required');
 await assert.rejects(changes.rescheduleTreatment(a,portal,{start:at(d1,1020),reason:'holiday',note:'www.x.com',notify:true}),e=>e.message==='note_invalid');
 await assert.rejects(changes.rescheduleTreatment(a,portal,{start:at(d1,1020),reason:'holiday',notify:'yes'}),e=>e.message==='invalid_request');
 assert.deepEqual(await row(a),before);assert.equal((await changeRows(a)).length,0);assert.equal(sent.length,sentBefore);
 pass('failed reschedule (outside hours, overlap, same time, other therapist, bad note) leaves the appointment, history and parents untouched');

 const preview=await changes.previewChange(a,portal,{kind:'reschedule',reason:'therapist_absence',start:at(d1,1020),note:'נתראה'});
 assert.deepEqual(await row(a),before);assert.equal(sent.length,sentBefore);
 const moved=await changes.rescheduleTreatment(a,portal,{start:at(d1,1020),reason:'therapist_absence',note:'נתראה',notify:true});
 assert.deepEqual(moved,{status:'rescheduled',calendar:'synced',whatsapp:'accepted'});
 const after=await row(a);assert.equal(Date.parse(after.scheduled_at),Date.parse(at(d1,1020)));assert.equal(after.duration_minutes,60);assert.equal(after.calendar_event_id,evA);
 assert.equal(Date.parse(events.get(evA).start.dateTime),Date.parse(at(d1,1020)));
 const [ch]=await changeRows(a);assert.equal(ch.kind,'rescheduled');assert.equal(ch.reason,'therapist_absence');assert.equal(ch.whatsapp,'accepted');assert.equal(ch.actor,'therapist');
 assert.equal(Date.parse(ch.previous_at),Date.parse(at(d1,960)));assert.equal(Date.parse(ch.new_at),Date.parse(at(d1,1020)));
 const last=sent.at(-1);assert.equal(last.key,'treatment-change:'+ch.id);assert.equal(last.phone,'+972501234567');assert.deepEqual(last.opts,{sender:'institute'});assert.equal(last.text,preview.text);
 pass('portal reschedule: same calendar event moved, history row, WhatsApp from institute after the DB change, text equals preview');

 // notify=false never sends
 const n0=sent.length;
 assert.deepEqual(await changes.rescheduleTreatment(b,portal,{start:at(d1,1140),reason:'parent_request',notify:false}),{status:'rescheduled',calendar:'synced',whatsapp:'skipped'});
 assert.equal(sent.length,n0);assert.equal((await changeRows(b))[0].whatsapp,'skipped');
 pass('notify=false: no message, history records "skipped"');

 // Concurrency: two requests to the same new slot, exactly one wins.
 const c=await req(),d=await req();await book(c,at(d2,900));await book(d,at(d2,1020));
 const race=await Promise.allSettled([changes.rescheduleTreatment(c,portal,{start:at(d2,1140),reason:'holiday',notify:false}),changes.rescheduleTreatment(d,portal,{start:at(d2,1140),reason:'holiday',notify:false})]);
 assert.equal(race.filter(x=>x.status==='fulfilled').length,1);assert.equal(race.filter(x=>x.status==='rejected'&&x.reason.message==='slot_taken').length,1);
 pass('concurrent reschedules into the same slot: one succeeds, the other gets slot_taken');

 // A held parent booking request blocks via the existing trigger; old slot stays.
 await pg.query("insert into therapist_booking_profiles(therapist_id,slug,calendar_id,enabled,availability) values($1,'rana',$3,true,$2)",[tid,JSON.stringify({windows:[{day:dow,start:900,end:1200,duration:60}],closedDates:[]}),slotsMod.RANA_CALENDAR_ID]);
 const e=await req();await book(e,at(d2,960));
 await pg.query("insert into therapist_booking_requests(id,therapist_id,parent_hash,patient_name,contact_name,phone,ip_hash,starts_at,ends_at,duration,status,expires_at,calendar_id,event_id) values($1,$2,$3,'Kid','Parent','+972501111111','ip',$4,$5,60,'confirmed',now()+interval '1 day',$6,'ev1')",[randomUUID(),tid,'a'.repeat(64),at(d2,1080),at(d2,1140),slotsMod.RANA_CALENDAR_ID]);
 const eBefore=await row(e);
 await assert.rejects(changes.rescheduleTreatment(e,portal,{start:at(d2,1080),reason:'holiday',notify:true}),x=>x.message==='slot_taken');
 assert.deepEqual(await row(e),eBefore);assert.equal((await changeRows(e)).length,0);
 pass('overlap trigger (parent booking request) aborts the whole reschedule; old appointment intact');

 // Diary (slug): booking-profile slots; own slot does not block itself.
 const diary={therapistId:tid,staffId:randomUUID(),slug:'rana'};
 const f=await req('en');await book(f,at(d1,900));
 externalBusy=[{start:at(d1,900),end:at(d1,960)}]; // Google shows f's own event
 const without=(await booking.publicBookingSlots('rana',60)).slots.map(s=>s.start),withSelf=(await booking.publicBookingSlots('rana',60,f)).slots.map(s=>s.start);
 assert.ok(!without.includes(at(d1,900))&&withSelf.includes(at(d1,900)));
 await assert.rejects(changes.rescheduleTreatment(f,diary,{start:at(d1,915),reason:'holiday',notify:false}),x=>x.message==='slot_taken'); // not a profile slot
 await assert.rejects(changes.rescheduleTreatment(f,diary,{start:at(d1,1020),reason:'holiday',notify:false}),x=>x.message==='slot_taken'); // a's new time
 externalBusy=[{start:at(d2,900),end:at(d2,960)}];
 await assert.rejects(changes.rescheduleTreatment(f,diary,{start:at(d2,900),reason:'holiday',notify:false}),x=>x.message==='slot_taken'); // busy in Google
 externalBusy=[];
 const fr=await changes.rescheduleTreatment(f,diary,{start:at(dayIn(21),1080),reason:'child_sick',note:'Get well soon',notify:true});
 assert.equal(fr.status,'rescheduled');assert.equal(fr.whatsapp,'accepted');
 const fc=(await changeRows(f))[0];assert.equal(fc.actor,'staff');assert.equal(fc.staff_id,diary.staffId);
 assert.ok(sent.at(-1).text.startsWith('Hello Dana,\nYoav\'s session with Rana'));
 pass('diary reschedule: validated against booking-profile slots and Google busy time, own slot excluded, staff recorded as actor');

 // Cancel: patient stays (contacted), time cleared, duration kept, event deleted, fresh event id.
 const n1=sent.length;
 const cancelled=await changes.cancelAppointment(a,portal,{reason:'no_show',note:'',notify:true});
 assert.deepEqual(cancelled,{status:'cancelled',calendar:'synced',whatsapp:'accepted'});
 const ac=await row(a);assert.equal(ac.status,'contacted');assert.equal(ac.scheduled_at,null);assert.equal(ac.duration_minutes,60);
 assert.ok(deletes.includes(evA));assert.equal(events.get(evA).status,'cancelled');assert.notEqual(ac.calendar_event_id,evA);assert.match(ac.calendar_event_id,/^[a-v0-9]{5,1024}$/);
 assert.equal(sent.length,n1+1);assert.ok(sent.at(-1).text.includes('בוטל.')&&!sent.at(-1).text.includes('עמכם הסליחה'));
 const cc=(await changeRows(a)).at(-1);assert.equal(cc.kind,'cancelled');assert.equal(Date.parse(cc.previous_at),Date.parse(at(d1,1020)));assert.equal(cc.new_at,null);
 await assert.rejects(changes.cancelAppointment(a,portal,{reason:'no_show',notify:true}),x=>x.message==='invalid_state');
 await assert.rejects(changes.previewChange(a,portal,{kind:'cancel',reason:'no_show'}),x=>x.message==='invalid_state');
 assert.equal(sent.length,n1+1);
 pass('cancel: status contacted, time cleared, duration kept, calendar event deleted, history row, one message');
 await book(a,at(dayIn(21),960));assert.equal((await row(a)).calendar_sync,'synced');assert.equal(events.get((await row(a)).calendar_event_id).status,'confirmed');
 pass('a cancelled request can be booked again (no Google tombstone conflict)');
 const g=await req();await book(g,at(dayIn(21),900));
 await pg.query("update treatment_requests set calendar_event_id=null,calendar_sync='none' where id=$1",[g]);
 assert.equal((await changes.cancelAppointment(g,portal,{reason:'holiday',notify:false})).calendar,'none');
 pass('cancel without a stored calendar event reports calendar "none"');

 // Remove patient: closed, event deleted, no message, works for any open status.
 const n2=sent.length,evB=(await row(b)).calendar_event_id;
 assert.deepEqual(await changes.removePatient(b,portal,{reason:'not_interested'}),{status:'removed',calendar:'synced'});
 assert.equal((await row(b)).status,'closed');assert.equal(events.get(evB).status,'cancelled');assert.equal(events.get((await row(a)).calendar_event_id).status,'confirmed');
 const h=await req();assert.equal((await changes.removePatient(h,portal,{reason:'other',note:'רישום כפול מהאתר'})).status,'removed');
 await assert.rejects(changes.removePatient(h,portal,{reason:'duplicate'}),x=>x.message==='invalid_state');
 await assert.rejects(changes.removePatient(c,portal,{reason:'other',note:''}),x=>x.message==='note_required');
 await assert.rejects(changes.removePatient(c,portal,{reason:'holiday'}),x=>x.message==='invalid_reason');
 await assert.rejects(changes.removePatient(c,{therapistId:other,staffId:null},{reason:'duplicate'}),x=>x.message==='not_assigned');
 assert.equal(sent.length,n2);const rc=(await changeRows(h))[0];assert.equal(rc.kind,'removed');assert.equal(rc.whatsapp,null);assert.equal(rc.note,'רישום כפול מהאתר');
 pass('remove patient: closed, calendar event deleted, reason/note recorded, never messages parents');

 // Busy (mid calendar sync) rows are not touched.
 await pg.query("update treatment_requests set calendar_sync='syncing' where id=$1",[c]);
 await assert.rejects(changes.cancelAppointment(c,portal,{reason:'holiday',notify:true}),x=>x.message==='busy');
 assert.equal((await db.rpc('cancel_treatment_appointment',{p_id:c,p_therapist:tid,p_change:randomUUID(),p_reason:'holiday',p_note:null,p_actor:'therapist',p_staff:null,p_whatsapp:'skipped'})).data,'busy');
 pass('rows in calendar sync are refused (busy) in TS and under the SQL lock');

 // History list
 const list=await changes.listTreatmentChanges([a,b,h,randomUUID()]);
 assert.equal(list[a].length,2);assert.equal(list[a][0].kind,'cancelled');assert.equal(list[a][0].reason_label,'המטופל/ת לא הגיע/ה');assert.equal(list[a][1].kind,'rescheduled');
 assert.equal(list[h][0].reason_label,'אחר (יש לפרט בהערה)');assert.equal(list[h][0].by,'therapist');
 assert.deepEqual(Object.values(await changes.listTreatmentChanges([])),[]);
 for(let i=0;i<7;i++)await pg.query("insert into treatment_request_changes(id,request_id,therapist_id,kind,reason,actor,created_at) values($1,$2,$3,'removed','duplicate','therapist',now()+make_interval(secs=>$4))",[randomUUID(),b,tid,i+1]);
 assert.equal((await changes.listTreatmentChanges([b]))[b].length,5);
 failTable='treatment_request_changes';assert.deepEqual(await changes.listTreatmentChanges([a]),{[a]:[]});failTable=null;
 pass('listTreatmentChanges: newest first, max 5, labels, empty input, fail-soft before migration');

 // Legacy close still works and still deletes the event.
 const k=await req();await book(k,at(dayIn(21),1140));const evK=(await row(k)).calendar_event_id;
 const workflow=compile('lib/therapists/workflow.ts',{...supa,'./calendar':calendar,'./mail':{emailOnce:async()=>'accepted'},'./server':{},'./parent-booking':{},'@/lib/moxo/notification':{notifyOnce}});
 assert.deepEqual(await workflow.closeTreatment(k,tid),{saved:true,calendar:'synced'});assert.equal((await row(k)).status,'closed');assert.equal(events.get(evK).status,'cancelled');
 pass('existing close action unchanged: closed + event deleted');
 console.log(`${passed} checks passed`);
}finally{await pg.close();}
