import {createHmac} from 'node:crypto';
import {NextRequest} from 'next/server';
import {z} from 'zod';
import {access,json,failure,token,hash,updateCase} from '@/lib/development/server';
import {getSupabaseAdmin} from '@/lib/supabase';
import {treatmentSchema} from '@/lib/treatments/schema';
import {ageTemplate,officialPages,validOfficialAnswers,OFFICIAL_VERSION} from '@/lib/development/official';
import {CONSENT_VERSION,OPEN_STATUSES,expiryFrom,isToken,missingColumn,mobile,needsRenewal,phoneForms,sameChild,submitPlan} from '@/lib/development/followup';
export const dynamic='force-dynamic';
const registration=z.object({child_name:z.string().trim().min(2).max(100),parent_name:z.string().trim().min(2).max(100),birth_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),phone:treatmentSchema.shape.phone,education_role:z.enum(['kindergarten','teacher','none']),consent:z.literal(true),website:z.literal('')}).strict();
const contact=z.object({name:z.string().trim().max(100),phone:z.string().trim().max(30)}).strict();

export async function GET(req:Request){try{
 const {row,role}=await access(req);if(row.form_version!==OFFICIAL_VERSION)return json({legacy:true});
 const parent=role==='parent',needsEducation=row.education_role!=='none';
 return json({role,child_name:row.child_name,education_role:row.education_role,pages:officialPages(row.form_template,role),answers:parent?row.parent_answers:row.education_answers,submitted:!!(parent?row.parent_submitted_at:row.education_submitted_at),expires_at:row.expires_at,
  // The parent who finished can come back to the same link, find the educator's link again and see whether it was completed.
  ...(parent&&row.parent_submitted_at&&needsEducation?{education:{submitted:!!row.education_submitted_at,token:!row.education_submitted_at&&row.status==='education'&&isToken(row.education_token)?row.education_token:null,contact_name:row.education_contact_name??'',phone:row.education_phone??'',can_save_contact:'education_phone' in row&&row.status==='education'}}:{})});
 }catch(e){return failure(e);}}

export async function POST(req:NextRequest){try{
 if(req.headers.get('origin')!==req.nextUrl.origin)return json({error:'הבקשה נדחתה'},403);
 const raw=await req.text();if(raw.length>400000)return json({error:'הטופס גדול מדי'},413);const body=JSON.parse(raw);
 if(body.action==='register'){
 const p=registration.safeParse(body.data);if(!p.success)return json({error:'בדקו את הפרטים וההסכמה. נדרש מספר נייד ישראלי תקין.'},400);const b=p.data,template=ageTemplate(b.birth_date);if(!template||(template==='infant'&&b.education_role==='teacher'))return json({error:'הערכות מיועדות מלידה ועד לפני גיל שבע. בדקו את הגיל והמסגרת.'},400);
 const secret=process.env.BOOKING_HASH_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY;if(!secret)return json({error:'לא ניתן לפתוח פנייה כעת'},503);
 const db=getSupabaseAdmin(),ip=createHmac('sha256',secret).update(req.ip||'unknown').digest('hex'),phones=phoneForms(b.phone),limited=()=>json({error:'נשלחו מספר פניות. נסו מאוחר יותר.'},429);
 // The same limits as the registration function, checked first: a refused attempt must not reveal whether an open case exists.
 const [byPhone,byIp]=await Promise.all([db.from('development_referrals').select('id').in('phone',phones).gt('created_at',new Date(Date.now()-86400000).toISOString()).limit(5),db.from('development_referrals').select('id').eq('intake_ip_hash',ip).gt('created_at',new Date(Date.now()-3600000).toISOString()).limit(10)]);
 if(byPhone.error||byIp.error)return json({error:'לא ניתן לשמור את הפנייה כרגע'},503);
 if(byPhone.data.length>=5||byIp.data.length>=10)return limited();
 // A parent who registers again with the same child continues the open case, with the answers already saved, instead of opening a second one.
 const open=await db.from('development_referrals').select('id,child_name,birth_date,phone,status,form_version,expires_at,parent_token').eq('birth_date',b.birth_date).in('phone',phones).in('status',OPEN_STATUSES).order('created_at',{ascending:false}).limit(20);
 if(open.error&&!missingColumn(open.error))return json({error:'לא ניתן לשמור את הפנייה כרגע'},503);
 const existing=open.data?.find(r=>sameChild(r,b));
 if(existing){
  const known=isToken(existing.parent_token)?existing.parent_token:null,t=known??token();
  let q=db.from('development_referrals').update({...(known?{}:{parent_token:t}),...(needsRenewal(existing.expires_at)?{expires_at:expiryFrom()}:{}),consent_at:new Date().toISOString(),consent_version:CONSENT_VERSION}).eq('id',existing.id).eq('status',existing.status);
  q=known?q.eq('parent_token',known):q.is('parent_token',null);
  const saved=await q.select('id').maybeSingle();if(saved.error||!saved.data)return json({error:'לא ניתן לפתוח את הפנייה כרגע. נסו שוב בעוד רגע.'},503);
  return json({parent_token:t,resumed:true});
 }
 const t=token(),r=await db.rpc('register_development_original',{p_child:b.child_name,p_birth:b.birth_date,p_parent:b.parent_name,p_phone:b.phone,p_education:b.education_role,p_parent_hash:hash(t),p_education_hash:hash(token()),p_template:template,p_ip:ip});
 if(r.error)return r.error.message.includes('RATE_LIMIT')?limited():json({error:'לא ניתן לשמור את הפנייה כרגע'},503);
 // Keep the link so staff can show and resend it, and record the consent text the parent accepted. The hash alone already opens the case.
 if(typeof r.data==='string'){const kept=await db.from('development_referrals').update({parent_token:t,consent_version:CONSENT_VERSION}).eq('id',r.data).select('id').maybeSingle();if(kept.error&&missingColumn(kept.error))await db.from('development_referrals').update({consent_version:CONSENT_VERSION}).eq('id',r.data);}
 return json({parent_token:t});
 }
 const {db,row,role}=await access(req);if(row.form_version!==OFFICIAL_VERSION)return json({error:'גרסת טופס לא מתאימה'},409);
 const parent=role==='parent',done=parent?'parent_submitted_at':'education_submitted_at';
 if(body.action==='education_contact'){
  // Optional: the parent leaves the educator's name and mobile so the institute can remind her.
  const c=contact.safeParse(body.data);if(!parent||!c.success)return json({error:'בדקו את הפרטים'},400);
  if(!row.parent_submitted_at||row.education_role==='none'||row.status!=='education')return json({error:'לא ניתן לעדכן את פרטי המסגרת בשלב זה'},409);
  const phone=c.data.phone?mobile(c.data.phone):null;if(c.data.phone&&!phone)return json({error:'נדרש מספר נייד ישראלי תקין, או להשאיר את השדה ריק.'},400);
  const saved=await db.from('development_referrals').update({education_contact_name:c.data.name||null,education_phone:phone}).eq('id',row.id).eq('status','education').select('id').maybeSingle();
  if(saved.error)return json({error:missingColumn(saved.error)?'לא ניתן לשמור את הפרטים כרגע. אפשר להעביר את הקישור ישירות.':'הפרטים לא נשמרו. נסו שוב.'},503);
  if(!saved.data)return json({error:'הפנייה השתנתה. רעננו לפני ניסיון נוסף.'},409);
  return json({ok:true,contact_name:c.data.name,phone:phone??''});
 }
 if(!['parent','education'].includes(row.status)||row[done]||(!parent&&!row.parent_submitted_at))return json({error:'השאלון נעול או אינו מוכן למילוי'},409);
 const parsed=z.record(z.string().max(50),z.string().max(2000)).safeParse(body.answers);
 if(!parsed.success||!validOfficialAnswers(row.form_template,role,parsed.data))return json({error:'תשובות לא תקינות'},400);
 if(body.submit===true&&body.confirmed!==true)return json({error:'יש לאשר את בדיקת השאלון לפני שליחה'},400);
 let update:Record<string,unknown>={[parent?'parent_answers':'education_answers']:parsed.data},next:string|undefined;
 if(body.submit===true){
  if(parent&&row.education_role!=='none')next=token();
  const plan=submitPlan(row,parent?'parent':'education',parsed.data,{now:new Date().toISOString(),educationToken:next,educationHash:next?hash(next):undefined});
  if('error' in plan)return json({error:plan.error},400);update=plan.update;
 }
 const saved=await updateCase(db,update,q=>q.eq('id',row.id).eq('status',row.status).is(done,null));if(saved.error)throw saved.error;if(!saved.data)return json({error:'הפנייה השתנתה. רעננו לפני ניסיון נוסף.'},409);
 return json({ok:true,submitted:body.submit===true,education_token:next});
 }catch(e){return failure(e);}}
