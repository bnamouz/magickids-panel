// AI secretary – Maccabi commitment requests: mail builders, threading headers, business days, reply classification, Gmail thread parsing.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'fs'; import ts from 'typescript'; import { createRequire } from 'module';
const require=createRequire(import.meta.url);
function compile(file,overrides={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((n)=>overrides[n]??require(n),m,m.exports);return m.exports;}
const mail={sender:'magickids@magickidsinstitute.com',credentials:()=>({client_email:'sa@x.iam.gserviceaccount.com',private_key:'k',client_id:'123'})};
const sendFiles=compile('lib/maccabi/send-files.ts',{'googleapis':{google:{}},'@/lib/therapists/mail':mail});
const shared=compile('lib/maccabi/commitment-shared.ts');
const c={...shared,...compile('lib/maccabi/commitments.ts',{'@/lib/therapists/mail':mail,'@/lib/maccabi/send-files':sendFiles,'@/lib/maccabi/commitment-shared':shared})};
const input={reference:'MK-261027-AB12',patientName:'אחמד חדאד',nationalId:'123456782',birthDate:'2018-03-05',phone:'0521234567',service:'מבדק MOXO',note:'הפניה מצורפת',staffName:'נטלי'};

test('request goes to the Shefa-Amr branch with name, ID, service and reference in the subject', () => {
  assert.equal(c.MACCABI_BRANCH_EMAIL,'shfaram@mac.org.il');
  assert.equal(c.requestSubject(input),'בקשה להתחייבות – אחמד חדאד ת.ז. 123456782 – מבדק MOXO [MK-261027-AB12]');
  const body=c.requestBody({...input,attachments:['הפניה.pdf']});
  for (const s of ['ד״ר בסים נמוז','ת.ז.: 123456782','תאריך לידה: 5.3.2018','טלפון ההורה: 0521234567','השירות המבוקש: מבדק MOXO','1. הפניה.pdf','MK-261027-AB12','תופיק זיאד 21','054-349-6656','נטלי · מזכירות']) assert.ok(body.includes(s),s);
  const raw=c.buildRequestRaw(input,[]);
  assert.match(raw,/^From: Magic Kids <magickids@magickidsinstitute\.com>\r\nTo: shfaram@mac\.org\.il\r\n/);
  assert.match(raw,/Message-ID: <MK-261027-AB12@magickidsinstitute\.com>/);
  assert.match(c.buildRequestRaw(input,[],'magickids@magickidsinstitute.com'),/To: magickids@magickidsinstitute\.com/);
});

test('reminder replies in the same thread (Re:, In-Reply-To, References) and counts the nth reminder', () => {
  const raw=c.buildReminderRaw({...input,sentAt:new Date('2026-10-20T08:00:00Z'),nth:2});
  assert.match(raw,/Subject: .*\r\n/); assert.match(raw,/In-Reply-To: <MK-261027-AB12@magickidsinstitute\.com>\r\nReferences: <MK-261027-AB12@magickidsinstitute\.com>\r\nMIME-Version: 1\.0/);
  assert.match(raw,/Message-ID: <MK-261027-AB12-r2@magickidsinstitute\.com>/);
  const text=Buffer.from(raw.split('\r\n\r\n')[2].replace(/\r\n/g,''),'base64').toString('utf8');
  assert.match(text,/תזכורת \(2\) לבקשת ההתחייבות שנשלחה ב־20\.10\.2026 עבור אחמד חדאד/);
  assert.equal(c.reminderBody({...input,sentAt:new Date(),nth:1}).includes('(1)'),false);
});

test('reference is unique per request and dated in Israel time', () => {
  const a=c.newReference(new Date('2026-10-27T21:30:00Z')), b=c.newReference(new Date('2026-10-27T21:30:00Z'));
  assert.match(a,/^MK-261027-[0-9A-F]{4}$/); assert.notEqual(a,b); // 21:30 UTC is still 27.10 in Israel (winter)
  assert.match(c.rfcId('MK-1'),/^MK-1@magickidsinstitute\.com$/);
});

test('business days skip Friday and Saturday; reminder due after 3 business days', () => {
  const sun=new Date('2026-10-25T07:00:00Z'); // Sunday
  assert.equal(c.businessDaysBetween(sun,new Date('2026-10-28T07:00:00Z')),3); // Mon,Tue,Wed
  const thu=new Date('2026-10-29T07:00:00Z');
  assert.equal(c.businessDaysBetween(thu,new Date('2026-11-01T07:00:00Z')),1); // Fri,Sat skipped, Sun counts
  assert.equal(c.businessDaysBetween(thu,new Date('2026-11-03T07:00:00Z')),3); // Sun,Mon,Tue → due
  assert.equal(c.businessDaysBetween(thu,thu),0);
  assert.equal(c.isBusinessDay(new Date('2026-10-30T07:00:00Z')),false); // Friday
  assert.equal(c.isBusinessDay(new Date('2026-10-31T07:00:00Z')),false); // Saturday
  assert.equal(c.isBusinessDay(new Date('2026-11-01T07:00:00Z')),true);
  assert.equal(c.REMINDER_AFTER_BUSINESS_DAYS,3);
});

test('keyword classifier: ready / rejected / pending / unclear, with rejection winning over a bare positive', () => {
  assert.equal(c.classifyByKeywords('שלום, ההתחייבות הונפקה ונמצאת במערכת. בברכה'),'ready');
  assert.equal(c.classifyByKeywords('טופס 17 מוכן לאיסוף'),'ready');
  assert.equal(c.classifyByKeywords('التعهد جاهز في النظام'),'ready');
  assert.equal(c.classifyByKeywords('הבקשה נדחתה – אין כיסוי לשירות זה'),'rejected');
  assert.equal(c.classifyByKeywords('חסרה הפניה מרופא מומחה, נא לצרף'),'rejected');
  assert.equal(c.classifyByKeywords('הבקשה בטיפול, נחזור אליכם'),'pending');
  assert.equal(c.classifyByKeywords('תודה על פנייתך'),'unclear');
});

test('language-model classification is used when available and never auto-approves against the keywords', async () => {
  const fake=(verdict)=>async()=>({json:async()=>({choices:[{message:{content:JSON.stringify({verdict,reason:'בדיקה'})}}]})});
  process.env.OPENAI_API_KEY='test';
  assert.deepEqual(await c.classifyReply('ההתחייבות אושרה והוזנה',fake('ready')),{verdict:'ready',reason:'בדיקה',model:true});
  assert.equal((await c.classifyReply('הבקשה נדחתה',fake('ready'))).verdict,'unclear'); // model says ready, keywords say rejected → staff review
  assert.equal((await c.classifyReply('שלום',fake('nonsense'))).verdict,'unclear');
  assert.equal((await c.classifyReply('ההתחייבות הונפקה',async()=>{throw new Error('down');})).verdict,'ready'); // fallback to keywords
  delete process.env.OPENAI_API_KEY;
  assert.deepEqual(await c.classifyReply('ההתחייבות הונפקה'),{verdict:'ready',reason:'keywords',model:false});
});

test('family WhatsApp names the child and service, in Hebrew or Arabic, with the clinic phone', () => {
  const he=c.readyWhatsApp({patientName:'אחמד',service:'מבדק MOXO'});
  assert.match(he,/ההתחייבות ממכבי \(טופס 17\) עבור אחמד \(מבדק MOXO\) מוכנה במערכת של מכבי/); assert.ok(he.includes('054-349-6656'));
  assert.match(c.readyWhatsApp({patientName:'أحمد',service:'MOXO',lang:'ar'}),/التعهد المالي .* لـأحمد \(MOXO\) أصبح جاهزًا/);
});

test('Gmail thread parsing separates our mails from Maccabi replies and decodes text/html bodies', async () => {
  const b64=(s)=>Buffer.from(s,'utf8').toString('base64url');
  const data={messages:[
    {id:'m1',internalDate:'1761500000000',payload:{headers:[{name:'From',value:'Magic Kids <magickids@magickidsinstitute.com>'},{name:'Subject',value:'בקשה'}],mimeType:'multipart/mixed',parts:[{mimeType:'text/plain',body:{data:b64('שלום רב')}}]}},
    {id:'m2',internalDate:'1761600000000',payload:{headers:[{name:'From',value:'סניף שפרעם <shfaram@mac.org.il>'},{name:'Subject',value:'Re: בקשה'}],mimeType:'text/html',body:{data:b64('<html><body><p>ההתחייבות <b>הונפקה</b></p></body></html>')}}},
  ]};
  const users={threads:{get:async()=>({data})},labels:{get:async()=>{throw new Error('unauthorized_client');}},messages:{send:async({requestBody})=>({data:{id:'sent1',threadId:requestBody.threadId??'t-new'}})}};
  const google={auth:{JWT:class{constructor(o){this.o=o;}}},gmail:()=>({users})};
  const g=compile('lib/maccabi/gmail.ts',{'@/lib/therapists/mail':mail,'googleapis':{google}});
  const msgs=await g.threadMessages('t1');
  assert.equal(msgs.length,2); assert.equal(msgs[0].isOurs,true); assert.equal(msgs[1].isOurs,false); assert.equal(msgs[1].text,'ההתחייבות הונפקה'); assert.ok(msgs[1].date instanceof Date);
  assert.equal(await g.readAccess(),'unauthorized');
  assert.deepEqual(await g.sendRaw('raw','t1'),{id:'sent1',threadId:'t1'});
  assert.deepEqual(g.delegationInfo(),{client_email:'sa@x.iam.gserviceaccount.com',client_id:'123'});
});

test('status vocabulary covers the desk and open statuses drive the daily check', () => {
  assert.deepEqual(c.OPEN_STATUSES,['sent','reminded','reply_received']);
  assert.equal(Object.keys(c.STATUS_LABEL).length,6);
  assert.ok(c.SERVICES.includes('אחר'));
});
