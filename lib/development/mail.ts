import { DESTINATION } from './schema';
export function mailReady(){return !!process.env.RESEND_API_KEY && !!process.env.DEVELOPMENT_EMAIL_FROM;}
export async function sendPacket(id:string,attachments:{filename:string;content:string}[]) {
 if(!mailReady())throw new Error('MAIL_NOT_CONFIGURED');
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`development-${id}`},body:JSON.stringify({from:process.env.DEVELOPMENT_EMAIL_FROM,to:[DESTINATION],subject:'פנייה להתפתחות הילד — מסמכים לעיון',text:'שלום, מצורפים שאלוני ההורים והמסגרת, הפניית רופא, הסכמה וסיכום שנבדק במכון ילדי הקסם. נא לאשר קבלה. תודה.',attachments}),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw new Error('MAIL_REJECTED'); const data=await r.json();if(!data.id)throw new Error('MAIL_UNKNOWN');return String(data.id);
}
