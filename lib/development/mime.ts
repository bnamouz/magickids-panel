import { randomBytes } from 'crypto';
import { DESTINATION } from './schema';
export const SENDER='magickids@magickidsinstitute.com';
const wrap=(s:string)=>s.match(/.{1,76}/g)?.join('\r\n')||'';
const encodeHeader=(s:string)=>Array.from(s).join('').match(/.{1,15}/gu)!.map(x=>'=?UTF-8?B?'+Buffer.from(x).toString('base64')+'?=').join('\r\n ');
export type MessageOptions={to?:string[];cc?:string[];subject?:string;body?:string};
const EMAIL=/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
export function buildMessage(id:string,attachments:{filename:string;content:string}[],options:MessageOptions={}) {
 if(!/^[a-f0-9-]{36}$/i.test(id))throw new Error('INVALID_REFERENCE');
 const to=options.to?.length?options.to:[DESTINATION],cc=options.cc||[];
 if(![...to,...cc].every(a=>EMAIL.test(a)))throw new Error('INVALID_RECIPIENT');
 const boundary='mki_'+randomBytes(24).toString('hex');
 const subject=encodeHeader(options.subject||'פנייה להתפתחות הילד — מסמכים לעיון');
 const body=Buffer.from(options.body||'שלום, מצורפים שאלוני ההורים והמסגרת, הפניית רופא, הסכמה וסיכום שנבדק במכון ילדי הקסם. נא לאשר קבלה. תודה.').toString('base64');
 const lines=[`From: Magic Kids <${SENDER}>`,`To: ${to.join(', ')}`,...(cc.length?[`Cc: ${cc.join(', ')}`]:[]),`Reply-To: ${SENDER}`,`Subject: ${subject}`,
  `Date: ${new Date().toUTCString()}`,`Message-ID: <development-${id}@magickidsinstitute.com>`,
  'MIME-Version: 1.0',`Content-Type: multipart/mixed; boundary="${boundary}"`,'',
  `--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',wrap(body)];
 for(const file of attachments){
  if(!/^[a-zA-Z0-9_-]+\.pdf$/.test(file.filename)||!file.content||
     file.content.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(file.content))throw new Error('INVALID_ATTACHMENT');
  lines.push(`--${boundary}`,'Content-Type: application/pdf',`Content-Disposition: attachment; filename="${file.filename}"`,
   'Content-Transfer-Encoding: base64','',wrap(file.content));
 }
 lines.push(`--${boundary}--`,'');
 const message=Buffer.from(lines.join('\r\n'));
 if(message.length>34*1024*1024)throw new Error('MESSAGE_TOO_LARGE');
 return message.toString('base64url');
}
