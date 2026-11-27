// Secretary desk – imaging approval requests to the Maccabi imaging center: recipients, wording, mandatory recommendation document, manual-only approval.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'fs'; import ts from 'typescript'; import { createRequire } from 'module';
const require=createRequire(import.meta.url);
function compile(file,overrides={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((n)=>overrides[n]??require(n),m,m.exports);return m.exports;}
const mail={sender:'magickids@magickidsinstitute.com',credentials:()=>({client_email:'sa@x.iam.gserviceaccount.com',private_key:'k',client_id:'123'})};
const sendFiles=compile('lib/maccabi/send-files.ts',{'googleapis':{google:{}},'@/lib/therapists/mail':mail});
const shared=compile('lib/maccabi/commitment-shared.ts');
const lib=compile('lib/maccabi/commitments.ts',{'@/lib/therapists/mail':mail,'@/lib/maccabi/send-files':sendFiles,'@/lib/maccabi/commitment-shared':shared});
const c={...shared,...lib};
const BOTH='DimutRequest@mac.org.il, ImageConsult@mac.org.il';
const input={kind:'imaging',reference:'MK-261125-AB12',patientName:'אחמד חדאד',nationalId:'123456782',birthDate:'2018-03-05',phone:'0521234567',service:'MRI – מוח, ללא חומר ניגוד',note:'המלצת נוירולוג ילדים',staffName:'נטלי'};
const bodyOf=(raw)=>Buffer.from(raw.split('\r\n\r\n')[2].split('\r\n--')[0].replace(/\r\n/g,''),'base64').toString('utf8');
const pdf={filename:'המלצה.pdf',contentType:'application/pdf',content:Buffer.from('%PDF-1.4 test')};

/** In-memory stand-ins for Supabase, Gmail and WhatsApp so the service can run without any network. */
function harness({hasKind=true}={}){
  const rows=[], audits=[], mails=[], wa=[]; let replies=[];
  const table=(name)=>{
    const run=(op,ctx)=>{
      if(name==='audit_log'){ if(op==='insert') audits.push(ctx.payload); return {data:null,error:null}; }
      if(op==='select'&&ctx.cols==='kind') return hasKind?{data:[],error:null}:{data:null,error:{code:'42703'}};
      if(op==='insert'){ const r={id:'id'+(rows.length+1),reminders_count:0,sent_at:new Date().toISOString(),last_reminder_at:null,last_reply_at:null,ready_at:null,patient_notified_at:null,notify_provider_id:null,...ctx.payload}; rows.push(r); return {data:r,error:null}; }
      if(op==='update'){ const r=rows.find((x)=>x.id===ctx.id); Object.assign(r,ctx.payload); return {data:null,error:null}; }
      return {data:rows.filter((r)=>!ctx.statuses||ctx.statuses.includes(r.status)),error:null};
    };
    const q=(op,ctx)=>({ select(cols){return q(op==='insert'?'insert':'select',{...ctx,cols});}, limit(){return Promise.resolve(run(op,ctx));}, single(){return Promise.resolve(run(op,ctx));}, eq(_k,id){return Promise.resolve(run(op,{...ctx,id}));}, in(_k,statuses){return q(op,{...ctx,statuses});}, order(){return Promise.resolve(run(op,ctx));}, then(res,rej){return Promise.resolve(run(op,ctx)).then(res,rej);} });
    return { select:(cols)=>q('select',{cols}), insert:(payload)=>q('insert',{payload}), update:(payload)=>q('update',{payload}) };
  };
  const gmail={ readAccess:async()=>'ok', sendRaw:async(raw,threadId)=>{mails.push({raw,threadId:threadId??null});return {id:'g'+mails.length,threadId:threadId??'t1'};}, threadMessages:async()=>replies };
  const classified=[];
  const svc=compile('lib/maccabi/commitment-service.ts',{'@/lib/supabase':{getSupabaseAdmin:()=>({from:table})},'@/lib/whatsapp-clinic':{sendClinicPreferred:async(a)=>{wa.push(a);return {ok:true,id:'w1',sender:'clinic',fallbackReason:null};}},'@/lib/therapists/mail':mail,'@/lib/maccabi/gmail':gmail,
    '@/lib/maccabi/commitments':{...c,classifyReply:async(t)=>{classified.push(t);return {verdict:c.classifyByKeywords(t),reason:'keywords',model:false};}}});
  return {svc,rows,audits,mails,wa,classified,setReplies:(r)=>{replies=r;}};
}
const person={patientName:'אחמד חדאד',nationalId:'123456782',birthDate:'2018-03-05',phone:'0521234567',staffName:'נטלי',createdBy:'staff1'};
const to=(raw)=>raw.match(/\r\nTo: (.*)\r\n/)[1];

test('imaging request goes in one mail to both Maccabi imaging mailboxes, never to the branch', () => {
  assert.deepEqual([...c.MACCABI_IMAGING_EMAILS],['DimutRequest@mac.org.il','ImageConsult@mac.org.il']);
  assert.equal(c.recipientFor('imaging'),BOTH);
  assert.equal(c.recipientFor('commitment'),'shfaram@mac.org.il'); assert.equal(c.recipientFor(undefined),'shfaram@mac.org.il'); assert.equal(c.recipientFor(null),'shfaram@mac.org.il');
  const raw=c.buildRequestRaw(input,[pdf]);
  assert.equal(to(raw),BOTH); assert.equal(raw.includes('shfaram'),false);
  assert.match(raw,/Message-ID: <MK-261125-AB12@magickidsinstitute\.com>/);
  assert.equal(to(c.buildRequestRaw(input,[pdf],mail.sender)),mail.sender); // test mode: our own mailbox only
});

test('subject and body ask for approval of the recommended test and list the attached recommendation', () => {
  assert.equal(c.requestSubject(input),'בקשה לאישור בדיקת דימות – אחמד חדאד ת.ז. 123456782 – MRI – מוח, ללא חומר ניגוד [MK-261125-AB12]');
  const body=bodyOf(c.buildRequestRaw(input,[pdf]));
  for (const s of ['אישורכם לביצוע בדיקת דימות שהומלצה','מסמך ההמלצה מצורף','שם: אחמד חדאד','ת.ז.: 123456782','תאריך לידה: 5.3.2018','טלפון ליצירת קשר: 0521234567','הבדיקה המבוקשת: MRI – מוח, ללא חומר ניגוד','המלצת נוירולוג ילדים','מסמכים מצורפים:','1. המלצה.pdf','MK-261125-AB12','נטלי · מזכירות מרפאת הילדים','054-349-6656']) assert.ok(body.includes(s),s);
  assert.equal(body.includes('טופס 17'),false); assert.equal(body.includes('התחייבות'),false);
  assert.match(c.buildRequestRaw(input,[pdf]),/Content-Type: application\/pdf/);
});

test('imaging type and area are combined into one requested-test line', () => {
  assert.equal(c.imagingService('MRI',' מוח '),'MRI – מוח');
  assert.equal(c.imagingService('אחר',' אקו לב '),'אקו לב');
  assert.ok(c.IMAGING_TYPES.includes('MRI')&&c.IMAGING_TYPES.includes('CT')&&c.IMAGING_TYPES.at(-1)==='אחר');
});

test('imaging reminder stays in the thread, goes to both mailboxes and waits longer than a branch reminder', () => {
  const raw=c.buildReminderRaw({...input,sentAt:new Date('2026-11-15T08:00:00Z'),nth:1});
  assert.equal(to(raw),BOTH);
  assert.match(raw,/In-Reply-To: <MK-261125-AB12@magickidsinstitute\.com>\r\nReferences: <MK-261125-AB12@magickidsinstitute\.com>/);
  assert.match(bodyOf(raw),/תזכורת לבקשה לאישור בדיקת דימות שנשלחה ב־15\.11\.2026 עבור אחמד חדאד, ת\.ז\. 123456782\. הבדיקה המבוקשת: MRI – מוח/);
  assert.equal(to(c.buildReminderRaw({...input,sentAt:new Date(),nth:1,to:null})),BOTH);
  assert.equal(c.reminderAfter('imaging'),6); assert.equal(c.reminderAfter('commitment'),3); assert.equal(c.reminderAfter(undefined),3);
});

test('family WhatsApp for an approved imaging test, Hebrew and Arabic, without commitment wording', () => {
  const he=c.readyWhatsApp({kind:'imaging',patientName:'אחמד',service:'MRI – מוח'});
  assert.match(he,/התקבל ממכבי אישור לביצוע בדיקת הדימות עבור אחמד \(MRI – מוח\)/); assert.ok(he.includes('054-349-6656')); assert.equal(he.includes('טופס 17'),false);
  const ar=c.readyWhatsApp({kind:'imaging',patientName:'أحمد',service:'MRI',lang:'ar'});
  assert.match(ar,/موافقة مكابي على إجراء فحص التصوير لـأحمد \(MRI\)/);
});

test('status labels follow the kind; commitment labels and wording are unchanged', () => {
  assert.equal(c.statusLabel('imaging','sent'),'נשלח למרכז הדימות'); assert.equal(c.statusLabel('imaging','ready'),'הבדיקה אושרה'); assert.equal(c.statusLabel('imaging','rejected'),'נדחה / חסר');
  assert.equal(c.statusLabel('commitment','ready'),'ההתחייבות מוכנה'); assert.equal(c.statusLabel(null,'sent'),'נשלח למכבי');
  const old={reference:'MK-261027-AB12',patientName:'אחמד חדאד',nationalId:'123456782',service:'מבדק MOXO'};
  assert.equal(c.requestSubject(old),'בקשה להתחייבות – אחמד חדאד ת.ז. 123456782 – מבדק MOXO [MK-261027-AB12]');
  assert.equal(c.requestSubject({...old,kind:'commitment'}),c.requestSubject(old));
  assert.equal(to(c.buildRequestRaw({...old,phone:'0521234567'},[])),'shfaram@mac.org.il');
  assert.match(c.readyWhatsApp({patientName:'אחמד',service:'מבדק MOXO'}),/ההתחייבות ממכבי \(טופס 17\)/);
});

test('service: imaging request is mailed to both mailboxes and tracked with its kind and recipients', async () => {
  const h=harness();
  const row=await h.svc.createCommitment({...person,kind:'imaging',service:'MRI – מוח',files:[pdf]});
  assert.equal(h.mails.length,1); assert.equal(to(h.mails[0].raw),BOTH);
  assert.equal(row.kind,'imaging'); assert.equal(row.recipient_email,BOTH); assert.equal(row.status,'sent'); assert.deepEqual(row.attachments,[{filename:'המלצה.pdf'}]);
  assert.equal(h.audits[0].action,'maccabi_imaging_requested'); assert.equal(h.audits[0].metadata.to,BOTH); assert.equal(h.audits[0].metadata.test,false);
  const t=await h.svc.createCommitment({...person,kind:'imaging',service:'CT – בטן',files:[pdf],testToSelf:true});
  assert.equal(to(h.mails[1].raw),mail.sender); assert.equal(t.recipient_email,mail.sender); assert.equal(h.audits[1].metadata.test,true);
  // A reminder for a test row stays in our own mailbox; a real row reminds both imaging mailboxes in the same thread.
  await h.svc.sendReminder(t,'staff1'); assert.equal(to(h.mails[2].raw),mail.sender);
  await h.svc.sendReminder(row,'staff1'); assert.equal(to(h.mails[3].raw),BOTH); assert.equal(h.mails[3].threadId,'t1'); assert.equal(h.rows[0].status,'reminded');
});

test('service: commitment requests keep going to the branch, before and after the new columns exist', async () => {
  const h=harness();
  const row=await h.svc.createCommitment({...person,service:'מבדק MOXO'});
  assert.equal(to(h.mails[0].raw),'shfaram@mac.org.il'); assert.equal(row.kind,'commitment'); assert.equal(row.recipient_email,'shfaram@mac.org.il'); assert.equal(h.audits[0].action,'maccabi_commitment_requested');
  const old=harness({hasKind:false});
  const legacy=await old.svc.createCommitment({...person,service:'מבדק MOXO'});
  assert.equal(to(old.mails[0].raw),'shfaram@mac.org.il'); assert.equal('kind' in legacy,false); assert.equal('recipient_email' in legacy,false);
  await old.svc.sendReminder(legacy,null); assert.equal(to(old.mails[1].raw),'shfaram@mac.org.il'); // rows without the columns default to the branch
});

test('service: without the new columns an imaging request is refused before any mail is sent', async () => {
  const h=harness({hasKind:false});
  await assert.rejects(()=>h.svc.createCommitment({...person,kind:'imaging',service:'MRI – מוח',files:[pdf]}),/imaging_not_ready/);
  assert.equal(h.mails.length,0); assert.equal(h.rows.length,0);
});

test('service: a Maccabi answer on an imaging request never notifies the family by itself; the desk confirms it', async () => {
  const h=harness();
  const row=await h.svc.createCommitment({...person,kind:'imaging',service:'MRI – מוח',files:[pdf]});
  h.setReplies([{id:'r1',from:'מרכז דימות <DimutRequest@mac.org.il>',date:new Date(Date.now()+60000),subject:'Re',text:'הבקשה אושרה. ההתחייבות הונפקה ונמצאת במערכת.',isOurs:false}]);
  const res=await h.svc.checkOne(row,'staff1');
  assert.equal(res.action,'reply_unclear'); assert.equal(h.wa.length,0); assert.equal(h.classified.length,0); // not even sent for classification
  assert.equal(h.rows[0].status,'reply_received'); assert.match(h.rows[0].last_reply_snippet,/הבקשה אושרה/);
  const done=await h.svc.markReady(h.rows[0],'manual','staff1');
  assert.equal(done.row.status,'ready'); assert.equal(h.wa.length,1); assert.equal(h.wa[0].toPhone,'0521234567'); assert.match(h.wa[0].body,/אישור לביצוע בדיקת הדימות עבור אחמד חדאד \(MRI – מוח\)/);
  // The same answer on a commitment request still notifies the family automatically, as before.
  const k=harness(); const cr=await k.svc.createCommitment({...person,service:'מבדק MOXO'});
  k.setReplies([{id:'r1',from:'סניף <shfaram@mac.org.il>',date:new Date(Date.now()+60000),subject:'Re',text:'ההתחייבות הונפקה ונמצאת במערכת.',isOurs:false}]);
  assert.equal((await k.svc.checkOne(cr,null)).action,'ready_notified'); assert.equal(k.wa.length,1); assert.match(k.wa[0].body,/טופס 17/);
});

test('daily check: imaging is reminded on the 6th business day, a commitment on the 3rd', async () => {
  const h=harness();
  const img=await h.svc.createCommitment({...person,kind:'imaging',service:'MRI – מוח',files:[pdf]});
  const com=await h.svc.createCommitment({...person,service:'מבדק MOXO'});
  const sent=new Date('2026-11-15T07:00:00Z'); // Sunday
  for (const r of h.rows) r.sent_at=sent.toISOString();
  const day3=await h.svc.runDailyCheck({now:new Date('2026-11-18T07:00:00Z')}); // Wednesday: 3 business days
  assert.deepEqual(day3.reminders,[com.reference]);
  const day5=await h.svc.runDailyCheck({now:new Date('2026-11-22T07:00:00Z')}); // Sunday: 5 business days for imaging
  assert.equal(day5.reminders.includes(img.reference),false);
  const day6=await h.svc.runDailyCheck({now:new Date('2026-11-23T07:00:00Z')}); // Monday: 6 business days
  assert.ok(day6.reminders.includes(img.reference));
  assert.equal(to(h.mails.at(-1).raw),BOTH);
});

test('API and desk: the recommendation document is mandatory for imaging on both sides', () => {
  const route=fs.readFileSync('app/api/admin/secretary/commitments/route.ts','utf8');
  assert.match(route,/kind: z\.enum\(REQUEST_KINDS as \[RequestKind, \.\.\.RequestKind\[\]\]\)\.default\('commitment'\)/);
  assert.ok(fs.readFileSync('lib/maccabi/commitment-shared.ts','utf8').includes("REQUEST_KINDS: readonly RequestKind[] = ['commitment', 'imaging',"));
  assert.match(route,/d\.kind === 'imaging' && d\.uploads\.length === 0\) return reply\(\{ error: 'recommendation_required' \}, 400\)/);
  assert.ok(route.indexOf("recommendation_required")<route.indexOf('createCommitment({')); // refused before anything is sent
  const desk=fs.readFileSync('components/admin/SecretaryDesk.tsx','utf8');
  assert.ok(desk.includes("const requireFile = kind === 'imaging' || kind === 'drug_approval';"));
  assert.match(desk,/if \(requireFile && !uploads\.length\) \{\s*setFileError\(true\)/);
  assert.match(desk,/recommendation_required: /);
  assert.match(fs.readFileSync('supabase/migrations/20261125120000_maccabi_imaging_requests.sql','utf8'),/add column if not exists kind text not null default 'commitment' check \(kind in \('commitment','imaging'\)\)/);
});
