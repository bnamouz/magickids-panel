import {getSupabaseAdmin} from '@/lib/supabase';
import {staffGuard,json,failure,token,hash} from '@/lib/development/server';
import {registration,ageEligible,VERSION,DESTINATION} from '@/lib/development/schema';
import {mailReady,sendPacket} from '@/lib/development/mail';
import {packetPdf} from '@/lib/development/pdf';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=60;
const requiredKinds=['parent_original','education_original','referral','consent'];
export async function GET(req:Request){try{
 if(process.env.DEVELOPMENT_REFERRALS_ENABLED!=='true')return json({error:'המסלול טרם הופעל'},503);
 await staffGuard(req);const db=getSupabaseAdmin();const id=new URL(req.url).searchParams.get('id');
 if(!id){const {data,error}=await db.from('development_referrals').select('id,child_name,status,created_at,parent_submitted_at,education_submitted_at').order('created_at',{ascending:false}).limit(100);if(error)throw error;return json({cases:data,mail_configured:mailReady(),destination:DESTINATION});}
 const {data,error}=await db.from('development_referrals').select('id,child_name,birth_date,parent_name,phone,education_role,parent_answers,education_answers,parent_submitted_at,education_submitted_at,summary,status,approved_at,email_id,error_code,created_at').eq('id',id).single();if(error)throw error;
 const {data:documents,error:dErr}=await db.from('development_documents').select('id,kind').eq('referral_id',id);if(dErr)throw dErr;
 const documentId=new URL(req.url).searchParams.get('document');
 if(documentId){const {data:doc}=await db.from('development_documents').select('storage_path').eq('referral_id',id).eq('id',documentId).single();if(!doc)return json({error:'מסמך לא נמצא'},404);const file=await db.storage.from('development-private').download(doc.storage_path);if(file.error)throw file.error;return new Response(await file.data.arrayBuffer(),{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="document.pdf"','Cache-Control':'no-store'}});}
 return json({case:data,documents,mail_configured:mailReady(),destination:DESTINATION});
 }catch(e){return failure(e);}}
export async function POST(req:Request){try{
 if(process.env.DEVELOPMENT_REFERRALS_ENABLED!=='true')return json({error:'המסלול טרם הופעל'},503);
 const staff=await staffGuard(req,true);const db=getSupabaseAdmin();
 if(req.headers.get('content-type')?.includes('multipart/form-data')){
 if(Number(req.headers.get('content-length')||0)>5500000)return json({error:'קובץ גדול מדי'},413);
 const form=await req.formData(),id=String(form.get('id')),kind=String(form.get('kind')),file=form.get('file');
 if(!requiredKinds.includes(kind)||!(file instanceof File)||file.size>5242880||file.type!=='application/pdf')return json({error:'נדרש PDF עד 5MB'},400);
 const bytes=Buffer.from(await file.arrayBuffer());if(bytes.subarray(0,5).toString()!=='%PDF-')return json({error:'קובץ לא תקין'},400);
 // Lock the case while replacing a document; approval and submissions cannot race the upload.
 const {data:before,error:readErr}=await db.from('development_referrals').select('status').eq('id',id).single();
 if(readErr)throw readErr;if(!['parent','education','review'].includes(before.status))return json({error:'התיק נעול'},409);
 const {data:editable,error:editErr}=await db.from('development_referrals').update({status:'uploading',approved_at:null,approved_by:null}).eq('id',id).eq('status',before.status).select('id').maybeSingle();
 if(editErr)throw editErr;if(!editable)return json({error:'התיק עודכן. רעננו ונסו שוב'},409);
 try {
 const p=`${id}/${kind}-${token()}.pdf`;const up=await db.storage.from('development-private').upload(p,bytes,{contentType:'application/pdf'});if(up.error)throw up.error;
 const {data:old}=await db.from('development_documents').select('storage_path').eq('referral_id',id).eq('kind',kind).maybeSingle();
 const saved=await db.from('development_documents').upsert({referral_id:id,kind,storage_path:p},{onConflict:'referral_id,kind'});if(saved.error){await db.storage.from('development-private').remove([p]);throw saved.error;}
 if(old)await db.storage.from('development-private').remove([old.storage_path]);return json({ok:true});
 } finally {await db.from('development_referrals').update({status:before.status}).eq('id',id).eq('status','uploading');}

 }
 const body=await req.json();
 if(body.action==='create'){
 const p=registration.safeParse(body.data);if(!p.success)return json({error:'פרטים חסרים או לא תקינים'},400);if(!ageEligible(p.data.birth_date))return json({error:'הגרסה הנוכחית מיועדת לגיל שנה עד לפני גיל שבע. לגילים אחרים השתמשו בערכת מכבי המתאימה.'},400);
 const parentToken=token();const {consent,...fields}=p.data;
 const {data,error}=await db.from('development_referrals').insert({...fields,parent_hash:hash(parentToken),education_hash:hash(token()),consent_version:VERSION}).select('id').single();if(error)throw error;
 return json({id:data.id,parent_token:parentToken});
 }
 const {data:row,error}=await db.from('development_referrals').select('*').eq('id',body.id).single();if(error)throw error;
 if(body.action==='link'){
 if(!['parent','education','review'].includes(row.status))return json({error:'התיק נעול'},409);
 const isParent=body.role==='parent';if(!isParent&&!row.parent_submitted_at)return json({error:'יש להשלים שאלון הורים תחילה'},409);
 const t=token();const update=await db.from('development_referrals').update({[isParent?'parent_hash':'education_hash']:hash(t),expires_at:new Date(Date.now()+30*86400000).toISOString()}).eq('id',row.id).eq('status',row.status).select('id').maybeSingle();if(update.error||!update.data)throw new Error('UPDATE');return json({token:t});
 }
 if(body.action==='approve'){
 if(row.status!=='review'||!row.parent_submitted_at||!row.education_submitted_at||body.confirmed!==true||typeof body.summary!=='string'||body.summary.trim().length<20||body.summary.length>60000)return json({error:'נדרשים שני שאלונים, סיכום ואישור בדיקה'},400);
 const {data:docs,error:dErr}=await db.from('development_documents').select('kind').eq('referral_id',row.id);if(dErr)throw dErr;
 if(!requiredKinds.every(k=>docs?.some(d=>d.kind===k)))return json({error:'יש לצרף את שני שאלוני המקור המלאים, הפניה והסכמה חתומה'},400);
 const r=await db.from('development_referrals').update({summary:body.summary,approved_by:staff.id,approved_at:new Date().toISOString(),status:'approved'}).eq('id',row.id).eq('status','review').select('id').maybeSingle();if(r.error||!r.data)throw new Error('CONFLICT');return json({ok:true});
 }
 if(body.action==='send'){
 if(!mailReady())return json({error:'חיבור הדואר טרם הוגדר. לא נשלח מידע.'},503);
 if(row.status!=='approved'||!row.approved_at)return json({error:'נדרש אישור רפואי לפני שליחה; תיק שכבר נשלח לא נשלח שוב'},409);
 const {data:docs,error:dErr}=await db.from('development_documents').select('kind,storage_path').eq('referral_id',row.id);if(dErr)throw dErr;if(!requiredKinds.every(k=>docs?.some(d=>d.kind===k)))return json({error:'חסרים מסמכים'},400);
 const attachments=[{filename:'reviewed-summary.pdf',content:(await packetPdf(row)).toString('base64')}];
 for(const d of docs!){const f=await db.storage.from('development-private').download(d.storage_path);if(f.error)throw f.error;attachments.push({filename:`${d.kind}.pdf`,content:Buffer.from(await f.data.arrayBuffer()).toString('base64')});}
 const locked=await db.from('development_referrals').update({status:'sending',dispatch_started_at:new Date().toISOString()}).eq('id',row.id).eq('status','approved').select('id').maybeSingle();if(locked.error)throw locked.error;if(!locked.data)return json({error:'שליחה כבר החלה'},409);
 try{const emailId=await sendPacket(row.id,attachments);const saved=await db.from('development_referrals').update({status:'accepted',email_id:emailId,error_code:null}).eq('id',row.id);if(saved.error)throw new Error('STATUS_SAVE');return json({ok:true,status:'accepted'});}
 catch{await db.from('development_referrals').update({status:'unknown',error_code:'VERIFY_PROVIDER_BEFORE_RETRY'}).eq('id',row.id);return json({error:'לא ניתן לאשר את מצב השליחה. יש לבדוק אצל ספק הדואר לפני ניסיון נוסף.'},502);}
 }
 return json({error:'פעולה לא נתמכת'},400);
 }catch(e){return failure(e);}}
