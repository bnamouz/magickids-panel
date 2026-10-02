import { google } from 'googleapis';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';
const sender='magickids@magickidsinstitute.com';
function credentials(){const raw=process.env.TREATMENT_GOOGLE_SERVICE_ACCOUNT_JSON||process.env.DEVELOPMENT_GOOGLE_SERVICE_ACCOUNT_JSON;if(!raw)throw new Error('not_configured');const c=JSON.parse(raw);if(c.type!=='service_account'||!c.client_email||!c.private_key)throw new Error('not_configured');return c;}
export function mailConfigured(){try{credentials();return true;}catch{return false;}}
export async function emailOnce(id:string,to:string,subject:string,body:string){
 if(!mailConfigured())return 'not_configured';
 if(!z.string().email().safeParse(to).success||/[\r\n]/.test(to))return 'invalid_email';
 const db=getSupabaseAdmin();const inserted=await db.from('clinic_notifications').upsert({id},{onConflict:'id',ignoreDuplicates:true});if(inserted.error)return 'unavailable';
 const claim=await db.from('clinic_notifications').update({state:'sending',updated_at:new Date().toISOString()}).eq('id',id).eq('state','pending').select('id').maybeSingle();
 if(claim.error)return 'unavailable';if(!claim.data){const prior=await db.from('clinic_notifications').select('state').eq('id',id).maybeSingle();return prior.data?.state??'unknown';}
 try{
  const c=credentials(),auth=new google.auth.JWT({email:c.client_email,key:c.private_key,scopes:['https://www.googleapis.com/auth/gmail.send'],subject:sender});
  const encoded=Array.from(subject).join('').match(/.{1,15}/gu)!.map(s=>'=?UTF-8?B?'+Buffer.from(s).toString('base64')+'?=').join('\r\n ');
  const raw=Buffer.from([`From: Magic Kids <${sender}>`,`To: ${to}`,`Subject: ${encoded}`,`Message-ID: <${id.replace(/[^a-zA-Z0-9-]/g,'-')}@magickidsinstitute.com>`,'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',Buffer.from(body).toString('base64').match(/.{1,76}/g)?.join('\r\n')??''].join('\r\n')).toString('base64url');
  const result=await google.gmail({version:'v1',auth}).users.messages.send({userId:'me',requestBody:{raw}},{retry:false,timeout:20000});if(!result.data.id)throw new Error('unknown');
  const saved=await db.from('clinic_notifications').update({state:'accepted',provider_id:result.data.id,updated_at:new Date().toISOString()}).eq('id',id);return saved.error?'unknown':'accepted';
 }catch{await db.from('clinic_notifications').update({state:'unknown',updated_at:new Date().toISOString()}).eq('id',id);return 'unknown';}
}
