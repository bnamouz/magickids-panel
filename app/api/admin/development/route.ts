import {originalPdf} from '@/lib/development/official-pdf';
import {OFFICIAL_VERSION,ageTemplate,officialPages,officialSummary,validOfficialAnswers} from '@/lib/development/official';
import {getSupabaseAdmin} from '@/lib/supabase';
import {staffGuard,json,failure,token,hash,updateCase} from '@/lib/development/server';
import {canEditReports} from '@/lib/admin/auth';
import {z} from 'zod';
import {CONSENT_VERSION,EDITABLE_STATUSES,OPEN_STATUSES,caseSteps,editPlan,isToken,missingColumn,submitPlan,type FormRole} from '@/lib/development/followup';
import {ensureLink,lastReminders,rotateLink,sendDevelopmentReminder} from '@/lib/development/reminder';
import {registration,ageEligible,VERSION,DESTINATION} from '@/lib/development/schema';
import {mailReady,sendPacket} from '@/lib/development/mail';
import {RECIPIENTS,isRecipient,isExternal,packetSubject,packetBody} from '@/lib/development/recipients';
import {IMAGE_TYPES,detectImage,imageToPdf} from '@/lib/development/image-pdf';
import {packetPdf} from '@/lib/development/pdf';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=60;
const requiredKinds=['parent_original','education_original','referral','consent'];
export async function GET(req:Request){try{

 const staff=await staffGuard(req),clinical=canEditReports(staff);const db=getSupabaseAdmin();const id=new URL(req.url).searchParams.get('id');
 if(!id){const {data,error}=await db.from('development_referrals').select('id,child_name,parent_name,phone,education_role,status,created_at,expires_at,parent_submitted_at,education_submitted_at').order('created_at',{ascending:false}).limit(100);if(error)throw error;return json({cases:data,mail_configured:mailReady(),destination:DESTINATION,recipients:RECIPIENTS});}
 const columns='id,child_name,birth_date,parent_name,phone,education_role,form_version,form_template,parent_answers,education_answers,parent_submitted_at,education_submitted_at,summary,status,approved_at,email_id,error_code,created_at,expires_at,consent_version';
 // The follow-up columns are read when they exist; without them the page still works and the new tools say an update is needed.
 let read:any=await db.from('development_referrals').select(columns+',parent_token,education_token,education_contact_name,education_phone').eq('id',id).single(),followup=true;
 if(read.error&&missingColumn(read.error)){followup=false;read=await db.from('development_referrals').select(columns).eq('id',id).single();}
 if(read.error)throw read.error;
 const {parent_token,education_token,...data}=read.data;
 const {data:documents,error:dErr}=await db.from('development_documents').select('id,kind').eq('referral_id',id);if(dErr)throw dErr;
 const documentId=new URL(req.url).searchParams.get('document');
 if(documentId?.startsWith('generated-')&&data.form_version===OFFICIAL_VERSION){const role=documentId==='generated-parent'?'parent':data.education_role;if(role==='none')return json({error:'אין מסגרת'},400);return new Response(new Uint8Array(await originalPdf(data,role)),{headers:{'Content-Type':'application/pdf','Cache-Control':'no-store','Content-Disposition':'attachment; filename=questionnaire.pdf'}});}
 if(documentId){const {data:doc}=await db.from('development_documents').select('storage_path').eq('referral_id',id).eq('id',documentId).single();if(!doc)return json({error:'מסמך לא נמצא'},404);const file=await db.storage.from('development-private').download(doc.storage_path);if(file.error)throw file.error;return new Response(await file.data.arrayBuffer(),{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="document.pdf"','Cache-Control':'no-store'}});}
 const official=data.form_version===OFFICIAL_VERSION,form=new URL(req.url).searchParams.get('form');
 if(form){
  // The original pages with the saved answers, for staff who fill or correct a questionnaire on the respondent's behalf.
  if(!clinical)throw new Error('UNAUTHORIZED');
  if(!official||(form!=='parent'&&form!=='education')||(form==='education'&&data.education_role==='none'))return json({error:'אין שאלון כזה בתיק'},400);
  const role=form==='parent'?'parent':data.education_role;
  return json({form,role,pages:officialPages(data.form_template,role),answers:form==='parent'?data.parent_answers:data.education_answers,submitted:!!(form==='parent'?data.parent_submitted_at:data.education_submitted_at)});
 }
 const flow=caseSteps(data,documents.some((d:any)=>d.kind==='referral'));
 const links=clinical&&official&&followup?{parent:OPEN_STATUSES.includes(data.status)&&isToken(parent_token)?parent_token:null,education:data.status==='education'&&isToken(education_token)?education_token:null}:null;
 const reminders=official?await lastReminders(id):{parent:null,education:null};
 const packetFiles=[{name:'reviewed-summary.pdf',label:'ריכוז הדיווחים שנבדק במכון'},...(data.form_version===OFFICIAL_VERSION?[{name:'parent-original-completed.pdf',label:'שאלון מכבי להורים – מלא'},...(data.education_role!=='none'?[{name:'education-original-completed.pdf',label:'שאלון מכבי למסגרת החינוכית – מלא'}]:[])]:[]),...documents.map((d:any)=>({name:`${d.kind}.pdf`,label:({referral:'הפניית רופא',consent:'הסכמת הורים חתומה',parent_original:'שאלון הורים – מקור',education_original:'שאלון מסגרת – מקור'} as Record<string,string>)[d.kind]||d.kind}))];
 return json({case:data,documents,mail_configured:mailReady(),destination:DESTINATION,recipients:RECIPIENTS,packet_files:packetFiles,followup,links,reminders,flow,consent_current:data.consent_version===CONSENT_VERSION});
 }catch(e){return failure(e);}}
export async function POST(req:Request){try{

 const staff=await staffGuard(req,true);const db=getSupabaseAdmin();
 if(req.headers.get('content-type')?.includes('multipart/form-data')){
 if(Number(req.headers.get('content-length')||0)>5500000)return json({error:'קובץ גדול מדי'},413);
 const form=await req.formData(),id=String(form.get('id')),kind=String(form.get('kind')),file=form.get('file');
 if(!requiredKinds.includes(kind)||!(file instanceof File)||file.size>5242880||(file.type!=='application/pdf'&&!IMAGE_TYPES[file.type]))return json({error:'נדרש PDF או תמונה (JPG/PNG) עד 5MB'},400);
 let bytes:Buffer=Buffer.from(await file.arrayBuffer());
 if(file.type==='application/pdf'){if(bytes.subarray(0,5).toString()!=='%PDF-')return json({error:'קובץ לא תקין'},400);}
 else{const format=detectImage(bytes);if(!format)return json({error:'קובץ התמונה לא תקין'},400);
  // Scanned referrals arrive as phone photos; the packet must stay PDF-only, so wrap the image in an A4 page.
  try{bytes=await imageToPdf(bytes,format);}catch{return json({error:'המרת התמונה ל-PDF נכשלה. נסו תמונה אחרת או PDF'},400);}
  if(bytes.length>5242880)return json({error:'הקובץ לאחר ההמרה גדול מדי'},413);}
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
 const p=registration.safeParse(body.data);if(!p.success)return json({error:'פרטים חסרים או לא תקינים'},400);if(!ageTemplate(p.data.birth_date)||(ageTemplate(p.data.birth_date)==='infant'&&p.data.education_role==='teacher'))return json({error:'יש לבדוק גיל ומסגרת. הערכות מיועדות מלידה עד לפני גיל שבע.'},400);
 const parentToken=token();const {consent,...fields}=p.data;
 const insert={...fields,parent_hash:hash(parentToken),education_hash:hash(token()),consent_version:OFFICIAL_VERSION,form_version:OFFICIAL_VERSION,form_template:ageTemplate(fields.birth_date)};
 let made=await db.from('development_referrals').insert({...insert,parent_token:parentToken}).select('id').single();
 if(made.error&&missingColumn(made.error))made=await db.from('development_referrals').insert(insert).select('id').single();
 const {data,error}=made;if(error)throw error;
 return json({id:data.id,parent_token:parentToken});
 }
 const {data:row,error}=await db.from('development_referrals').select('*').eq('id',body.id).single();if(error)throw error;
 if(body.action==='link'){
 if(!['parent','education','review'].includes(row.status))return json({error:'התיק נעול'},409);
 const isParent=body.role==='parent';if(!isParent&&row.education_role==='none')return json({error:'הילד אינו במסגרת'},400);if(!isParent&&!row.parent_submitted_at)return json({error:'יש להשלים שאלון הורים תחילה'},409);
 const t=await rotateLink(row,isParent?'parent':'education');if(!t)throw new Error('UPDATE');
 await db.from('audit_log').insert({actor_id:staff.id,actor_type:'user',action:'development_link_replaced',entity_type:'development_referral',entity_id:row.id,metadata:{role:isParent?'parent':'education'}}).then(()=>null,()=>null);
 return json({token:t});
 }
 const official=row.form_version===OFFICIAL_VERSION;
 const followup='parent_token' in row,needsUpdate=()=>json({error:'הכלי הזה דורש עדכון של מסד הנתונים שטרם בוצע.'},503);
 const audit=(action:string,metadata:Record<string,unknown>)=>db.from('audit_log').insert({actor_id:staff.id,actor_type:'user',action,entity_type:'development_referral',entity_id:row.id,metadata}).then(()=>null,()=>null);
 if(body.action==='show_link'){
  // The same link the family already has, to copy or send again. Nothing is cancelled.
  const role:FormRole=body.role==='education'?'education':'parent';
  if(!official)return json({error:'בפנייה מהמסלול הקודם אין קישור להצגה'},409);if(!followup)return needsUpdate();
  if(role==='parent'?!OPEN_STATUSES.includes(row.status):(row.status!=='education'||row.education_role==='none'))return json({error:role==='parent'?'התיק כבר עבר לבדיקת רופא':'קישור המסגרת זמין לאחר שאלון ההורים ועד להשלמת שאלון המסגרת'},409);
  const link=await ensureLink(row,role);if(!link)return json({error:'התיק עודכן. רעננו ונסו שוב'},409);
  return json({ok:true,role,link:link.token});
 }
 if(body.action==='remind'){
  const p=z.object({role:z.enum(['parent','education']),language:z.enum(['he','ar']).default('he'),force:z.boolean().default(false)}).safeParse({role:body.role,language:body.language,force:body.force});
  if(!p.success)return json({error:'בקשה לא תקינה'},400);
  const result=await sendDevelopmentReminder({id:row.id,role:p.data.role,lang:p.data.language,staffId:staff.id,force:p.data.force});
  return json(result,result.status==='sent'||result.status==='recent'?200:result.status==='unavailable'||result.status==='needs_update'?503:result.status==='failed'||result.status==='unknown'?502:409);
 }
 if(body.action==='update'){
  // Staff correction of the case details: names, phones, birth date, setting and the educator's contact.
  const input=z.object({child_name:z.string(),parent_name:z.string(),phone:z.string(),birth_date:z.string(),education_role:z.string(),education_contact_name:z.string(),education_phone:z.string()}).partial().strict().safeParse(body.data);
  if(!input.success)return json({error:'פרטים לא תקינים'},400);
  if(!followup&&(input.data.education_contact_name||input.data.education_phone))return needsUpdate();
  const plan=editPlan(row,followup?input.data:{...input.data,education_contact_name:undefined,education_phone:undefined});
  if('error' in plan)return json({error:plan.error},plan.code);
  if(!plan.changed.length)return json({ok:true,changed:[]});
  const update={...plan.update};
  if(plan.needsEducationLink&&followup&&!isToken(row.education_token)){const t=token();update.education_token=t;update.education_hash=hash(t);}
  const saved=await updateCase(db,update,q=>q.eq('id',row.id).eq('status',row.status));if(saved.error)throw saved.error;if(!saved.data)return json({error:'התיק עודכן בינתיים. רעננו ונסו שוב'},409);
  await audit('development_case_updated',{changed:plan.changed,status_from:row.status,status_to:update.status??row.status});
  return json({ok:true,changed:plan.changed,status:update.status??row.status});
 }
 if(body.action==='answers'){
  // Staff fills or corrects a questionnaire on behalf of the parent or the educator (phone call, paper form, a mistake).
  const form:FormRole=body.form==='education'?'education':'parent',parent=form==='parent',role=parent?'parent':row.education_role,done=parent?'parent_submitted_at':'education_submitted_at';
  if(!official)return json({error:'בפנייה מהמסלול הקודם אין שאלון לעריכה'},409);
  if(!EDITABLE_STATUSES.includes(row.status))return json({error:'התיק נעול. יש להחזיר אותו לעריכה לפני שינוי התשובות.'},409);
  if(!parent&&(row.education_role==='none'||!row.parent_submitted_at))return json({error:'שאלון המסגרת נפתח לאחר השלמת שאלון ההורים'},409);
  const parsed=z.record(z.string().max(50),z.string().max(2000)).safeParse(body.answers);
  if(!parsed.success||!validOfficialAnswers(row.form_template,role,parsed.data))return json({error:'תשובות לא תקינות'},400);
  const answersKey=parent?'parent_answers':'education_answers',before=(row[answersKey]??{}) as Record<string,string>;
  const edited=[...new Set([...Object.keys(before),...Object.keys(parsed.data)])].filter(k=>(before[k]||'')!==(parsed.data[k]||'')).length;
  let update:Record<string,unknown>={[answersKey]:parsed.data},completed=false,summaryKept=false;
  if(!row[done]&&body.complete===true){
   const next=parent&&row.education_role!=='none'?token():undefined,plan=submitPlan(row,form,parsed.data,{now:new Date().toISOString(),educationToken:next,educationHash:next?hash(next):undefined});
   if('error' in plan)return json({error:plan.error},400);update=plan.update;completed=true;
  }else if(row.status==='review'){
   // Keep the review text in step with the corrected answers, unless the doctor already rewrote it by hand.
   if(body.regenerate===true||!row.summary||row.summary===officialSummary(row))update.summary=officialSummary({...row,...update});else summaryKept=true;
  }
  const saved=await updateCase(db,update,q=>(row[done]?q.eq('id',row.id).eq('status',row.status):q.eq('id',row.id).eq('status',row.status).is(done,null)));if(saved.error)throw saved.error;if(!saved.data)return json({error:'התיק עודכן בינתיים. רעננו ונסו שוב'},409);
  await audit('development_answers_edited',{form,edited_fields:edited,completed_by_staff:completed,was_submitted:!!row[done],summary_regenerated:'summary' in update});
  return json({ok:true,completed,status:update.status??row.status,summary_kept:summaryKept});
 }
 const needsEducation=row.education_role!=='none';
 const required=official?['referral']:requiredKinds;
 if(body.action==='approve'){
 if(row.status!=='review'||!row.parent_submitted_at||(needsEducation&&!row.education_submitted_at)||body.confirmed!==true||typeof body.summary!=='string'||body.summary.trim().length<20||body.summary.length>60000)return json({error:'נדרשים שני שאלונים, סיכום ואישור בדיקה'},400);
 const {data:docs,error:dErr}=await db.from('development_documents').select('kind').eq('referral_id',row.id);if(dErr)throw dErr;
 if(!required.every(k=>docs?.some(d=>d.kind===k)))return json({error:official?'יש לצרף הפניה רפואית ולוודא את ההסכמות בשאלונים המקוריים':'יש לצרף את שני שאלוני המקור המלאים, הפניה והסכמה חתומה'},400);
 const r=await db.from('development_referrals').update({summary:body.summary,approved_by:staff.id,approved_at:new Date().toISOString(),status:'approved'}).eq('id',row.id).eq('status','review').select('id').maybeSingle();if(r.error||!r.data)throw new Error('CONFLICT');return json({ok:true});
 }
 if(body.action==='reopen'){
  // Unlock so documents can be replaced and the summary re-approved. Allowed when approved-but-unsent, or when the
  // packet only went to the institute mailbox (internal copy). A case that already reached Maccabi stays locked.
  if(row.status!=='approved'&&row.status!=='accepted')return json({error:'ניתן להחזיר לעריכה רק תיק מאושר או תיק שנשלח לתיבת המכון בלבד'},409);
  if(row.status==='accepted'){const {data:sends}=await db.from('audit_log').select('metadata').eq('entity_type','development_referral').eq('entity_id',row.id).eq('action','development_packet_emailed');
   if(sends?.some(x=>x.metadata?.recipient&&x.metadata.recipient!=='institute'))return json({error:'התיק כבר נשלח למכבי ואינו ניתן לעריכה'},409);}
  const r=await db.from('development_referrals').update({status:'review',approved_at:null,approved_by:null,email_id:null}).eq('id',row.id).eq('status',row.status).select('id').maybeSingle();
  if(r.error)throw r.error;if(!r.data)return json({error:'התיק השתנה בינתיים'},409);
  await db.from('audit_log').insert({actor_id:staff.id,actor_type:'user',action:'development_case_reopened',entity_type:'development_referral',entity_id:row.id,metadata:{previous_status:row.status,previous_email_id:row.email_id}});
  return json({ok:true,status:'review'});}
 if(body.action==='send'){
 const recipient=body.recipient??'institute';if(!isRecipient(recipient))return json({error:'נמען לא מוכר'},400);
 if(isExternal(recipient)&&body.confirmed!==true)return json({error:'שליחה למכבי דורשת אישור מפורש'},400);
 if(!mailReady())return json({error:'חיבור הדואר טרם הוגדר. לא נשלח מידע.'},503);
 if(row.status!=='approved'||!row.approved_at)return json({error:'נדרש אישור רפואי לפני שליחה; תיק שכבר נשלח לא נשלח שוב'},409);
 const {data:docs,error:dErr}=await db.from('development_documents').select('kind,storage_path').eq('referral_id',row.id);if(dErr)throw dErr;if(!required.every(k=>docs?.some(d=>d.kind===k)))return json({error:'חסרים מסמכים'},400);
 const attachments=[{filename:'reviewed-summary.pdf',content:(await packetPdf(row)).toString('base64')}];
 if(official){attachments.push({filename:'parent-original-completed.pdf',content:(await originalPdf(row,'parent')).toString('base64')});if(needsEducation)attachments.push({filename:'education-original-completed.pdf',content:(await originalPdf(row,row.education_role)).toString('base64')});}
 for(const d of docs!){const f=await db.storage.from('development-private').download(d.storage_path);if(f.error)throw f.error;attachments.push({filename:`${d.kind}.pdf`,content:Buffer.from(await f.data.arrayBuffer()).toString('base64')});}
 const locked=await db.from('development_referrals').update({status:'sending',dispatch_started_at:new Date().toISOString()}).eq('id',row.id).eq('status','approved').select('id').maybeSingle();if(locked.error)throw locked.error;if(!locked.data)return json({error:'שליחה כבר החלה'},409);
 const allFiles=attachments.map(a=>a.filename),wanted=Array.isArray(body.files)?body.files.filter((f:unknown)=>typeof f==='string'&&allFiles.includes(f)):allFiles;
 if(!wanted.length){await db.from('development_referrals').update({status:'approved',dispatch_started_at:null}).eq('id',row.id).eq('status','sending');return json({error:'יש לסמן לפחות קובץ אחד לשליחה'},400);}
 const selected=attachments.filter(a=>wanted.includes(a.filename));
 const {to,cc}=RECIPIENTS[recipient],files=selected.map(a=>a.filename);
 try{const emailId=await sendPacket(row.id,selected,{to,cc,subject:packetSubject(recipient,row),body:packetBody(recipient,row,files)});const saved=await db.from('development_referrals').update({status:'accepted',email_id:emailId,error_code:null}).eq('id',row.id);if(saved.error)throw new Error('STATUS_SAVE');
  await db.from('audit_log').insert({actor_id:staff.id,actor_type:'user',action:'development_packet_emailed',entity_type:'development_referral',entity_id:row.id,metadata:{to,cc:cc||[],recipient,files,omitted:allFiles.filter(f=>!files.includes(f)),gmail_message_id:emailId}});
  return json({ok:true,status:'accepted',to:to.join(', ')});}
 catch{await db.from('development_referrals').update({status:'unknown',error_code:'VERIFY_PROVIDER_BEFORE_RETRY'}).eq('id',row.id);return json({error:'לא ניתן לאשר את מצב השליחה. יש לבדוק אצל ספק הדואר לפני ניסיון נוסף.'},502);}
 }
 return json({error:'פעולה לא נתמכת'},400);
 }catch(e){return failure(e);}}
