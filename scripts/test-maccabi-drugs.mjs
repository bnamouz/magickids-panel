// Secretary desk – drug approval requests and physician appeals to Maccabi: recipients, wording, mandatory letter and justification,
// appeal refused while its address is unknown, 6-business-day reminder, manual-only replies, the optional family notice, and the migration.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'fs'; import ts from 'typescript'; import { createRequire } from 'module';
import { PGlite } from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
function compile(file,overrides={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((n)=>overrides[n]??require(n),m,m.exports);return m.exports;}
const mail={sender:'magickids@magickidsinstitute.com',credentials:()=>({client_email:'sa@x.iam.gserviceaccount.com',private_key:'k',client_id:'123'})};
const sendFiles=compile('lib/maccabi/send-files.ts',{'googleapis':{google:{}},'@/lib/therapists/mail':mail});
const realShared=compile('lib/maccabi/commitment-shared.ts');
const build=(shared)=>{const lib=compile('lib/maccabi/commitments.ts',{'@/lib/therapists/mail':mail,'@/lib/maccabi/send-files':sendFiles,'@/lib/maccabi/commitment-shared':shared});return {...shared,...lib};};
const c=build(realShared);
const DRUGS='Drugs-approve@mac.org.il';
const bodyOf=(raw)=>Buffer.from(raw.split('\r\n\r\n')[2].split('\r\n--')[0].replace(/\r\n/g,''),'base64').toString('utf8');
const to=(raw)=>raw.match(/\r\nTo: (.*)\r\n/)[1];
const pdf={filename:'מכתב המלצה.pdf',contentType:'application/pdf',content:Buffer.from('%PDF-1.4 test')};
const JUST='אסתמה קשה שאינה מאוזנת למרות טיפול מקסימלי במשאפים.';
const input={kind:'drug_approval',reference:'MK-261127-DR01',patientName:'אחמד חדאד',nationalId:'123456782',birthDate:'2018-03-05',phone:'0521234567',service:'Dupixent – 200 מ״ג כל שבועיים',note:JUST,staffName:'נטלי'};
const person={patientName:'אחמד חדאד',nationalId:'123456782',birthDate:'2018-03-05',phone:'0521234567',staffName:'נטלי',createdBy:'staff1'};

/** In-memory stand-ins for Supabase, Gmail and WhatsApp. hasAppealOf=false simulates a database without migration 20261127120000. */
function harness({hasAppealOf=true,shared=realShared,waOk=true,waThrows=false}={}){
  const cc=build(shared);
  const rows=[], audits=[], mails=[], wa=[]; let replies=[];
  const table=(name)=>{
    const run=(op,ctx)=>{
      if(name==='audit_log'){ if(op==='insert') audits.push(ctx.payload); return {data:null,error:null}; }
      if(op==='select'&&ctx.cols==='kind') return {data:[],error:null};
      if(op==='select'&&ctx.cols==='appeal_of') return hasAppealOf?{data:[],error:null}:{data:null,error:{code:'42703'}};
      if(op==='insert'){ const r={id:'00000000-0000-4000-8000-00000000000'+(rows.length+1),reminders_count:0,sent_at:new Date().toISOString(),last_reminder_at:null,last_reply_at:null,ready_at:null,patient_notified_at:null,notify_provider_id:null,...ctx.payload}; rows.push(r); return {data:r,error:null}; }
      if(op==='update'){ const r=rows.find((x)=>x.id===ctx.id); Object.assign(r,ctx.payload); return {data:null,error:null}; }
      if(ctx.id) return {data:rows.find((r)=>r.id===ctx.id)??null,error:null};
      return {data:rows.filter((r)=>!ctx.statuses||ctx.statuses.includes(r.status)),error:null};
    };
    const q=(op,ctx)=>({ select(cols){return q(op==='insert'?'insert':'select',{...ctx,cols});}, limit(){return Promise.resolve(run(op,ctx));}, single(){return Promise.resolve(run(op,ctx));}, maybeSingle(){return Promise.resolve(run(op,ctx));},
      eq(_k,id){const n=q(op,{...ctx,id});return op==='select'?n:Promise.resolve(run(op,{...ctx,id}));}, in(_k,statuses){return q(op,{...ctx,statuses});}, order(){return Promise.resolve(run(op,ctx));}, then(res,rej){return Promise.resolve(run(op,ctx)).then(res,rej);} });
    return { select:(cols)=>q('select',{cols}), insert:(payload)=>q('insert',{payload}), update:(payload)=>q('update',{payload}) };
  };
  const gmail={ readAccess:async()=>'ok', sendRaw:async(raw,threadId)=>{mails.push({raw,threadId:threadId??null});return {id:'g'+mails.length,threadId:threadId??'t1'};}, threadMessages:async()=>replies };
  const classified=[];
  const svc=compile('lib/maccabi/commitment-service.ts',{'@/lib/supabase':{getSupabaseAdmin:()=>({from:table})},
    '@/lib/whatsapp-clinic':{sendClinicPreferred:async(a)=>{wa.push(a);if(waThrows)throw new Error('network');return waOk?{ok:true,id:'w1',sender:'clinic',fallbackReason:null}:{ok:false,error:'ultramsg_down',sender:'clinic'};}},
    '@/lib/therapists/mail':mail,'@/lib/maccabi/gmail':gmail,'@/lib/maccabi/commitments':{...cc,classifyReply:async(t)=>{classified.push(t);return {verdict:cc.classifyByKeywords(t),reason:'keywords',model:false};}}});
  return {svc,rows,audits,mails,wa,classified,setReplies:(r)=>{replies=r;}};
}
const withAppealAddress={...realShared,MACCABI_DRUG_APPEAL_EMAIL:'appeal@example.test',recipientFor:(k)=>k==='drug_appeal'?'appeal@example.test':realShared.recipientFor(k)};

test('recipients: drug approval to the drugs department; the appeal address is empty and never guessed', () => {
  assert.equal(c.MACCABI_DRUG_APPROVAL_EMAIL,DRUGS); assert.equal(c.recipientFor('drug_approval'),DRUGS);
  assert.equal(c.MACCABI_DRUG_APPEAL_EMAIL,''); assert.equal(c.recipientFor('drug_appeal'),'');
  assert.equal(c.recipientFor('commitment'),'shfaram@mac.org.il'); assert.equal(c.recipientFor('imaging'),'DimutRequest@mac.org.il, ImageConsult@mac.org.il');
  assert.deepEqual([...c.REQUEST_KINDS],['commitment','imaging','drug_approval','drug_appeal']);
  assert.equal(c.isDrugKind('drug_approval'),true); assert.equal(c.isDrugKind('drug_appeal'),true); assert.equal(c.isDrugKind('imaging'),false); assert.equal(c.isDrugKind(null),false);
  const raw=c.buildRequestRaw(input,[pdf]); assert.equal(to(raw),DRUGS); assert.match(raw,/Message-ID: <MK-261127-DR01@magickidsinstitute\.com>/);
});

test('drug approval: subject and body (patient, drug and dosage, justification, attached documents, reply by e-mail, doctor signature)', () => {
  assert.equal(c.requestSubject(input),'בקשה לאישור תרופה – אחמד חדאד ת.ז. 123456782 – Dupixent – 200 מ״ג כל שבועיים [MK-261127-DR01]');
  const raw=c.buildRequestRaw(input,[pdf]); const body=bodyOf(raw);
  for (const s of ['מבוקש אישור לתרופה','מכתב ההמלצה של הרופא המומחה מצורף','שם: אחמד חדאד','ת.ז.: 123456782','תאריך לידה: 5.3.2018','טלפון ליצירת קשר: 0521234567','התרופה והמינון: Dupixent – 200 מ״ג כל שבועיים','אבחנה והצדקה רפואית:',JUST,'מסמכים מצורפים:','1. מכתב המלצה.pdf','נבקש לקבל עדכון על הבקשה לכתובת מייל זו.','מספר אסמכתא לבקשה: MK-261127-DR01','ד״ר בסים נמוז, רופא ילדים מומחה, מס\' רישיון 108121','מרפאת הילדים · תופיק זיאד 21, שפרעם','טלפון 054-349-6656 · magickids@magickidsinstitute.com']) assert.ok(body.includes(s),s);
  for (const s of ['טופס 17','התחייבות','דימות','מובטח','מצוין']) assert.equal(body.includes(s),false,s);
  assert.match(raw,/Content-Type: application\/pdf/);
});

test('physician appeal: subject, first-person body and the original request number', () => {
  const ap={...input,kind:'drug_appeal',reference:'MK-261127-AP01',note:'הטיפול החלופי שהוצע נוסה ונכשל, מצורף סיכום.',appealOfReference:'MK-261120-DR09'};
  assert.equal(c.requestSubject(ap),'ערעור רופא על החלטה בבקשה לאישור תרופה – אחמד חדאד ת.ז. 123456782 – Dupixent – 200 מ״ג כל שבועיים [MK-261127-AP01]');
  const body=c.requestBody(ap);
  for (const s of ['אני מגיש בזאת ערעור על ההחלטה בבקשה לאישור תרופה','ערעור על החלטה בבקשה שמספרה MK-261120-DR09.','נימוקי הערעור:','הטיפול החלופי שהוצע נוסה ונכשל','אבקש לקבל את ההחלטה בערעור','מספר אסמכתא לערעור: MK-261127-AP01','מס\' רישיון 108121']) assert.ok(body.includes(s),s);
  assert.equal(c.requestBody({...ap,appealOfReference:null}).includes('שמספרה'),false);
  assert.equal(body.includes('מסמכים מצורפים'),false); // files are optional for an appeal
});

test('drug service line, status labels and reminder delay', () => {
  assert.equal(c.drugService(' Dupixent ',' 200 מ״ג '),'Dupixent – 200 מ״ג'); assert.equal(c.drugService('X'.repeat(300),'1').length,200); assert.equal(c.drugService('Ritalin',''),'Ritalin');
  assert.equal(c.statusLabel('drug_approval','sent'),'נשלח למחלקת אישורי תרופות'); assert.equal(c.statusLabel('drug_approval','ready'),'התרופה אושרה'); assert.equal(c.statusLabel('drug_approval','rejected'),'נדחה / חסר');
  assert.equal(c.statusLabel('drug_appeal','sent'),'הערעור נשלח'); assert.equal(c.statusLabel('drug_appeal','ready'),'הערעור התקבל'); assert.equal(c.statusLabel('drug_appeal','rejected'),'הערעור נדחה');
  assert.equal(c.statusLabel('drug_appeal','reply_received'),'התקבלה תשובה – לבדיקה'); assert.equal(c.statusLabel('commitment','ready'),'ההתחייבות מוכנה');
  assert.equal(c.reminderAfter('drug_approval'),6); assert.equal(c.reminderAfter('drug_appeal'),6); assert.equal(c.DRUG_REMINDER_AFTER_BUSINESS_DAYS,6); assert.equal(c.reminderAfter('commitment'),3);
});

test('appeal texts (e-mail, reminder, family WhatsApp) never mention a 5-working-day timeline', () => {
  const ap={...input,kind:'drug_appeal',appealOfReference:'MK-261120-DR09'};
  const texts=[c.requestBody(ap),c.reminderBody({...ap,sentAt:new Date(),nth:1}),c.reminderBody({...ap,sentAt:new Date(),nth:2}),
    ...['he','ar'].flatMap((l)=>[c.drugFamilyNotice('drug_appeal',l,{patientName:'x',drug:'y'}),c.drugReadyNotice('drug_appeal',l,{patientName:'x',drug:'y'})])];
  for (const t of texts) assert.equal(/5 ימי|חמישה|ימי עבודה|ימי עסקים|5 أيام|أيام عمل|خمسة/.test(t),false,t);
  for (const l of ['he','ar']) assert.match(c.drugFamilyNotice('drug_approval',l,{patientName:'x',drug:'y'}),/5 ימי|5 أيام/); // the check itself does catch the request notice
  assert.equal(c.reminderAfter('drug_appeal'),6); // the automatic reminder on the 6th business day stays
});

test('reminders for both drug kinds stay in the thread and keep the doctor signature', () => {
  const raw=c.buildReminderRaw({...input,sentAt:new Date('2026-11-15T08:00:00Z'),nth:1});
  assert.equal(to(raw),DRUGS); assert.match(raw,/In-Reply-To: <MK-261127-DR01@magickidsinstitute\.com>/);
  assert.match(bodyOf(raw),/תזכורת לבקשה לאישור תרופה שנשלחה ב־15\.11\.2026 עבור אחמד חדאד, ת\.ז\. 123456782\. התרופה והמינון: Dupixent/);
  const ap=c.reminderBody({...input,kind:'drug_appeal',sentAt:new Date('2026-11-15T08:00:00Z'),nth:2});
  assert.match(ap,/תזכורת \(2\) לערעור שהגשתי ב־15\.11\.2026 על ההחלטה בבקשה לאישור תרופה/); assert.ok(ap.includes('מס\' רישיון 108121'));
});

test('family WhatsApp texts: ready and request-sent, Hebrew and Arabic, both kinds', () => {
  const r=c.readyWhatsApp({kind:'drug_approval',patientName:'אחמד',service:'Dupixent – 200 מ״ג'});
  assert.equal(r,'שלום, כאן מרפאת הילדים של ד״ר בסים נמוז.\nהתקבל ממכבי אישור לתרופה עבור אחמד (Dupixent – 200 מ״ג).\nאפשר לפנות לבית המרקחת עם המרשם.\nלשאלות: 054-349-6656');
  assert.match(c.readyWhatsApp({kind:'drug_appeal',patientName:'אחמד',service:'Dupixent'}),/הערעור התקבל, והתרופה עבור אחמד \(Dupixent\) אושרה/);
  assert.match(c.readyWhatsApp({kind:'drug_approval',patientName:'أحمد',service:'Dupixent',lang:'ar'}),/^مرحبًا، معكم عيادة الأطفال – د\. بسيم نموز\.\nوصلت موافقة مكابي على الدواء لـأحمد \(Dupixent\)/);
  assert.match(c.readyWhatsApp({kind:'drug_appeal',patientName:'أحمد',service:'Dupixent',lang:'ar'}),/تم قبول الاستئناف/);
  assert.equal(c.drugFamilyNotice('drug_approval','he',{patientName:'אחמד',drug:'Dupixent'}),'שלום, כאן מרפאת הילדים של ד״ר בסים נמוז.\nהבקשה לאישור התרופה עבור אחמד (Dupixent) נשלחה היום למחלקת אישורי התרופות של מכבי.\nלפי מכבי, תשובה ניתנת בתוך 5 ימי עבודה, במסרון לטלפון המעודכן במכבי.\nלשאלות: 054-349-6656');
  assert.equal(c.drugFamilyNotice('drug_appeal','he',{patientName:'אחמד',drug:'Dupixent'}),'שלום, כאן מרפאת הילדים של ד״ר בסים נמוז.\nהערעור על ההחלטה בבקשה לאישור התרופה עבור אחמד (Dupixent) נשלח היום למכבי.\nהערעור נמצא במעקב מרפאת הילדים.\nלשאלות: 054-349-6656');
  assert.equal(c.drugFamilyNotice('drug_appeal','ar',{patientName:'أحمد',drug:'Dupixent'}),'مرحبًا، معكم عيادة الأطفال – د. بسيم نموز.\nتم اليوم إرسال الاستئناف على القرار بشأن طلب الموافقة على الدواء لـأحمد (Dupixent) إلى مكابي.\nالاستئناف قيد المتابعة في عيادة الأطفال.\nللاستفسار: 054-349-6656');
  for (const k of ['drug_approval','drug_appeal']) for (const l of ['he','ar']) assert.equal(/נעדכן|سنبلغ|מובטח|نضمن/.test(c.drugFamilyNotice(k,l,{patientName:'x',drug:'y'})),false,k+l); // no promises
  assert.match(c.drugFamilyNotice('drug_approval','ar',{patientName:'أحمد',drug:'Dupixent'}),/خلال 5 أيام عمل[\s\S]*للاستفسار: 054-349-6656$/);
  assert.match(c.drugFamilyNotice('drug_appeal',undefined,{patientName:'אחמד',drug:'X'}),/^שלום, כאן/); // default Hebrew
  // Commitment and imaging texts are unchanged.
  assert.match(c.readyWhatsApp({patientName:'אחמד',service:'מבדק MOXO'}),/ההתחייבות ממכבי \(טופס 17\)/);
  assert.match(c.readyWhatsApp({kind:'imaging',patientName:'אחמד',service:'MRI'}),/בדיקת הדימות/);
});

test('service: drug approval is mailed to the drugs department and tracked; family notice only on request', async () => {
  const h=harness();
  const row=await h.svc.createCommitment({...person,kind:'drug_approval',service:'Dupixent – 200 מ״ג',note:JUST,files:[pdf]});
  assert.equal(h.mails.length,1); assert.equal(to(h.mails[0].raw),DRUGS);
  assert.equal(row.kind,'drug_approval'); assert.equal(row.recipient_email,DRUGS); assert.equal(row.appeal_of,null); assert.equal(row.family_notice,'not_requested'); assert.equal(h.wa.length,0);
  assert.equal(h.audits[0].action,'maccabi_drug_approval_requested'); assert.equal(h.audits[0].metadata.family_notice,'not_requested');
  const n=await h.svc.createCommitment({...person,kind:'drug_approval',service:'Dupixent',note:JUST,files:[pdf],notifyFamily:true,lang:'ar'});
  assert.equal(n.family_notice,'sent'); assert.equal(h.wa.length,1); assert.equal(h.wa[0].toPhone,'0521234567'); assert.match(h.wa[0].body,/قسم الموافقة على الأدوية/);
  assert.equal(h.audits[1].metadata.family_notice,'sent'); assert.equal(h.audits[1].metadata.family_lang,'ar');
  // Never in test mode; never for other kinds.
  const t=await h.svc.createCommitment({...person,kind:'drug_approval',service:'Dupixent',note:JUST,files:[pdf],notifyFamily:true,testToSelf:true});
  assert.equal(to(h.mails[2].raw),mail.sender); assert.equal(t.family_notice,'not_requested'); assert.equal(h.wa.length,1);
  const k=await h.svc.createCommitment({...person,service:'מבדק MOXO',notifyFamily:true});
  assert.equal(k.family_notice,'not_requested'); assert.equal(h.wa.length,1); assert.equal(h.audits[3].action,'maccabi_commitment_requested');
});

test('service: a failed family WhatsApp does not fail the request and is recorded', async () => {
  for (const opts of [{waOk:false},{waThrows:true}]) {
    const h=harness(opts);
    const row=await h.svc.createCommitment({...person,kind:'drug_approval',service:'Dupixent',note:JUST,files:[pdf],notifyFamily:true});
    assert.equal(row.family_notice,'failed'); assert.equal(h.mails.length,1); assert.equal(h.rows.length,1); assert.equal(h.rows[0].status,'sent');
    assert.equal(h.audits[0].metadata.family_notice,'failed'); assert.ok(h.audits[0].metadata.family_error);
  }
});

test('service: an appeal is refused while the appeal address is empty, except as a test to our own mailbox', async () => {
  const h=harness();
  await assert.rejects(()=>h.svc.createCommitment({...person,kind:'drug_appeal',service:'Dupixent',note:'נימוקי ערעור מפורטים'}),/appeal_address_missing/);
  assert.equal(h.mails.length,0); assert.equal(h.rows.length,0);
  const t=await h.svc.createCommitment({...person,kind:'drug_appeal',service:'Dupixent',note:'נימוקי ערעור מפורטים',testToSelf:true,notifyFamily:true});
  assert.equal(to(h.mails[0].raw),mail.sender); assert.equal(t.recipient_email,mail.sender); assert.equal(t.family_notice,'not_requested');
  assert.equal(h.audits[0].action,'maccabi_drug_appeal_requested');
});

test('service: appeal_of must be an existing drug_approval row; its reference goes into the appeal body', async () => {
  const h=harness({shared:withAppealAddress});
  const orig=await h.svc.createCommitment({...person,kind:'drug_approval',service:'Dupixent',note:JUST,files:[pdf]});
  const com=await h.svc.createCommitment({...person,service:'מבדק MOXO'});
  await assert.rejects(()=>h.svc.createCommitment({...person,kind:'drug_appeal',service:'Dupixent',note:'נימוקי ערעור מפורטים',appealOf:com.id}),/appeal_not_found/);
  await assert.rejects(()=>h.svc.createCommitment({...person,kind:'drug_appeal',service:'Dupixent',note:'נימוקי ערעור מפורטים',appealOf:'00000000-0000-4000-8000-000000000099'}),/appeal_not_found/);
  assert.equal(h.mails.length,2);
  const ap=await h.svc.createCommitment({...person,kind:'drug_appeal',service:'Dupixent',note:'נימוקי ערעור מפורטים',appealOf:orig.id,notifyFamily:true});
  assert.equal(to(h.mails[2].raw),'appeal@example.test'); assert.equal(ap.appeal_of,orig.id);
  assert.ok(bodyOf(h.mails[2].raw).includes(`ערעור על החלטה בבקשה שמספרה ${orig.reference}.`));
  assert.equal(h.audits.at(-1).metadata.appeal_of,orig.reference); assert.equal(ap.family_notice,'sent'); assert.match(h.wa[0].body,/הערעור על ההחלטה/);
});

test('service: without migration 20261127120000 drug requests are refused before any mail', async () => {
  const h=harness({hasAppealOf:false});
  await assert.rejects(()=>h.svc.createCommitment({...person,kind:'drug_approval',service:'Dupixent',note:JUST,files:[pdf]}),/drugs_not_ready/);
  await assert.rejects(()=>h.svc.createCommitment({...person,kind:'drug_appeal',service:'Dupixent',note:JUST,testToSelf:true}),/drugs_not_ready/);
  assert.equal(h.mails.length,0); assert.equal(h.rows.length,0);
  const ok=await h.svc.createCommitment({...person,service:'מבדק MOXO'}); assert.equal(ok.kind,'commitment'); assert.equal('appeal_of' in ok,false); // other kinds unaffected
});

test('service: a Maccabi answer on a drug request is never classified and never notifies the family by itself', async () => {
  const h=harness();
  const row=await h.svc.createCommitment({...person,kind:'drug_approval',service:'Dupixent',note:JUST,files:[pdf]});
  h.setReplies([{id:'r1',from:'אישורי תרופות <Drugs-approve@mac.org.il>',date:new Date(Date.now()+60000),subject:'Re',text:'הבקשה אושרה. ההתחייבות הונפקה ונמצאת במערכת.',isOurs:false}]);
  const res=await h.svc.checkOne(row,'staff1');
  assert.equal(res.action,'reply_unclear'); assert.equal(h.classified.length,0); assert.equal(h.wa.length,0); assert.equal(h.rows[0].status,'reply_received');
  const done=await h.svc.markReady(h.rows[0],'manual','staff1','he');
  assert.equal(done.row.status,'ready'); assert.equal(h.wa.length,1); assert.match(h.wa[0].body,/התקבל ממכבי אישור לתרופה עבור אחמד חדאד \(Dupixent\)/);
});

test('daily check: drug requests are reminded on the 6th business day, a commitment on the 3rd; no reminder to an empty appeal address', async () => {
  const h=harness();
  const drug=await h.svc.createCommitment({...person,kind:'drug_approval',service:'Dupixent',note:JUST,files:[pdf]});
  const com=await h.svc.createCommitment({...person,service:'מבדק MOXO'});
  // A legacy appeal row with no stored recipient must not produce a reminder to ''.
  h.rows.push({...h.rows[0],id:'00000000-0000-4000-8000-000000000009',reference:'MK-261115-AP00',kind:'drug_appeal',recipient_email:null});
  const sent=new Date('2026-11-15T07:00:00Z'); for (const r of h.rows) r.sent_at=sent.toISOString();
  assert.deepEqual((await h.svc.runDailyCheck({now:new Date('2026-11-18T07:00:00Z')})).reminders,[com.reference]);
  assert.equal((await h.svc.runDailyCheck({now:new Date('2026-11-22T07:00:00Z')})).reminders.includes(drug.reference),false);
  const day6=await h.svc.runDailyCheck({now:new Date('2026-11-23T07:00:00Z')});
  assert.ok(day6.reminders.includes(drug.reference)); assert.equal(day6.reminders.includes('MK-261115-AP00'),false);
  assert.ok(day6.errors.some((e)=>/MK-261115-AP00: reminder appeal_address_missing/.test(e)));
  assert.equal(to(h.mails.at(-1).raw),DRUGS);
});

test('API: drug validation runs before anything is downloaded or sent', () => {
  const route=fs.readFileSync('app/api/admin/secretary/commitments/route.ts','utf8');
  assert.match(route,/kind: z\.enum\(REQUEST_KINDS/);
  assert.match(route,/notify_family: z\.boolean\(\)\.default\(false\)/); assert.match(route,/lang: z\.enum\(\['he', 'ar'\]\)\.default\('he'\)/); assert.match(route,/appeal_of: z\.string\(\)\.uuid\(\)/);
  assert.match(route,/\(d\.note \?\? ''\)\.trim\(\)\.length < 10\) return reply\(\{ error: 'justification_required' \}, 400\)/);
  assert.match(route,/d\.kind === 'drug_approval' && d\.uploads\.length === 0\) return reply\(\{ error: 'recommendation_required' \}, 400\)/);
  assert.match(route,/!d\.test_to_self && !recipientFor\('drug_appeal'\)\) return reply\(\{ error: 'appeal_address_missing' \}, 503\)/);
  for (const e of ['justification_required','appeal_address_missing']) assert.ok(route.indexOf(e)<route.indexOf('db.storage.from(BUCKET).download'),e);
  assert.match(route,/drugs_not_ready: \['drugs_not_ready', 503\]/); assert.match(route,/reply\(\{ ok: true, commitment, family_notice \}\)/);
  assert.match(route,/notifyFamily: isDrugKind\(d\.kind\) && d\.notify_family && !d\.test_to_self/);
});

test('migration on PostgreSQL: four kinds allowed, anything else refused, appeal_of links and is cleared on delete', async () => {
  const pg=new PGlite();
  await pg.exec('create table public.clinic_patients (id uuid primary key default gen_random_uuid());');
  for (const f of ['20261027170000_maccabi_commitments.sql','20261125120000_maccabi_imaging_requests.sql','20261127120000_maccabi_drug_approvals.sql']) await pg.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
  const ins=(ref,kind,appeal=null)=>pg.query(`insert into public.maccabi_commitments (reference, patient_name, national_id, phone, service, kind, appeal_of) values ($1,'אחמד חדאד','123456782','0521234567','Dupixent',$2,$3) returning id`,[ref,kind,appeal]);
  for (const k of ['commitment','imaging','drug_approval']) await ins('R-'+k,k);
  const orig=(await pg.query(`select id from public.maccabi_commitments where kind='drug_approval'`)).rows[0].id;
  const ap=(await ins('R-ap','drug_appeal',orig)).rows[0].id;
  await assert.rejects(()=>ins('R-bad','other'),/check constraint/);
  const cons=(await pg.query(`select conname from pg_constraint where conrelid='public.maccabi_commitments'::regclass and contype='c' and pg_get_constraintdef(oid) like '%kind%'`)).rows.map((r)=>r.conname);
  assert.deepEqual(cons,['maccabi_commitments_kind_check']);
  await pg.query('delete from public.maccabi_commitments where id=$1',[orig]);
  assert.equal((await pg.query('select appeal_of from public.maccabi_commitments where id=$1',[ap])).rows[0].appeal_of,null);
  await pg.exec(fs.readFileSync('supabase/migrations/20261127120000_maccabi_drug_approvals.sql','utf8')); // re-runnable
  await pg.close();
});
