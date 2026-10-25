// Maccabi file e-mail: fixed recipient, subject with child name + ID, MIME with attachments.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'fs'; import ts from 'typescript'; import { createRequire } from 'module';
const require=createRequire(import.meta.url);
function compile(file,overrides={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((n)=>overrides[n]??require(n),m,m.exports);return m.exports;}
const m=compile('lib/maccabi/send-files.ts',{'googleapis':{google:{}},'@/lib/therapists/mail':{sender:'magickids@magickidsinstitute.com',credentials:()=>({})}});
test('recipient and subject', () => {
  assert.equal(m.MACCABI_CHILDREN_CENTER_EMAIL,'MokedMhuziYld@mac.org.il');
  assert.equal(m.maccabiSubject({childName:'דנה חדאד',nationalId:'123456782'}),'מכון ילדי הקסם – דנה חדאד ת.ז. 123456782 – מסמכים לאבחון קשב וריכוז');
  const body=m.maccabiBody({childName:'דנה חדאד',nationalId:'123456782',birthDate:'1.2.2017',files:['דוח.pdf','טופס.jpg'],note:'דחוף',staffName:'נטלי'});
  assert.match(body,/1\. דוח\.pdf\n2\. טופס\.jpg/); assert.match(body,/הערה:\nדחוף/); assert.match(body,/נטלי · מכון ילדי הקסם/);
});
test('MIME message carries every attachment with UTF-8 filenames', () => {
  const raw=m.buildRawMessage({to:'MokedMhuziYld@mac.org.il',subject:'נושא',text:'שלום',messageId:'abc-123',attachments:[{filename:'דוח אבחון.pdf',contentType:'application/pdf',content:Buffer.from('%PDF-1.4 test')},{filename:'scan.jpg',contentType:'image/jpeg',content:Buffer.from([0xff,0xd8,0xff])}]});
  assert.match(raw,/^From: Magic Kids <magickids@magickidsinstitute\.com>\r\nTo: MokedMhuziYld@mac\.org\.il\r\n/);
  assert.match(raw,/Content-Type: multipart\/mixed; boundary="mk_/);
  assert.equal((raw.match(/Content-Disposition: attachment/g)||[]).length,2);
  assert.match(raw,/filename\*=UTF-8''%D7%93%D7%95%D7%97%20%D7%90%D7%91%D7%97%D7%95%D7%9F\.pdf/);
  assert.match(raw,new RegExp(Buffer.from('%PDF-1.4 test').toString('base64').replace(/\+/g,'\\+')));
  assert.match(raw,/Message-ID: <abc-123@magickidsinstitute\.com>/);
  assert.ok(raw.endsWith('--\r\n'));
});
