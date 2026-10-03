import {createHmac} from 'node:crypto';
import {NextRequest} from 'next/server';
import {z} from 'zod';
import {access,json,failure,token,hash} from '@/lib/development/server';
import {getSupabaseAdmin} from '@/lib/supabase';
import {treatmentSchema} from '@/lib/treatments/schema';
import {ageTemplate,officialPages,validOfficialAnswers,officialSummary,OFFICIAL_VERSION} from '@/lib/development/official';
export const dynamic='force-dynamic';
const registration=z.object({child_name:z.string().trim().min(2).max(100),parent_name:z.string().trim().min(2).max(100),birth_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),phone:treatmentSchema.shape.phone,education_role:z.enum(['kindergarten','teacher','none']),consent:z.literal(true),website:z.literal('')}).strict();
export async function GET(req:Request){try{const {row,role}=await access(req);if(row.form_version!==OFFICIAL_VERSION)return json({legacy:true});return json({role,child_name:row.child_name,education_role:row.education_role,pages:officialPages(row.form_template,role),answers:role==='parent'?row.parent_answers:row.education_answers,submitted:!!(role==='parent'?row.parent_submitted_at:row.education_submitted_at)});}catch(e){return failure(e);}}
export async function POST(req:NextRequest){try{
 if(req.headers.get('origin')!==req.nextUrl.origin)return json({error:'הבקשה נדחתה'},403);
 const raw=await req.text();if(raw.length>400000)return json({error:'הטופס גדול מדי'},413);const body=JSON.parse(raw);
 if(body.action==='register'){
 const p=registration.safeParse(body.data);if(!p.success)return json({error:'בדקו את הפרטים וההסכמה. נדרש מספר נייד ישראלי תקין.'},400);const b=p.data,template=ageTemplate(b.birth_date);if(!template||(template==='infant'&&b.education_role==='teacher'))return json({error:'הערכות מיועדות מלידה ועד לפני גיל שבע. בדקו את הגיל והמסגרת.'},400);
 const secret=process.env.BOOKING_HASH_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY;if(!secret)return json({error:'לא ניתן לפתוח פנייה כעת'},503);
 const t=token(),r=await getSupabaseAdmin().rpc('register_development_original',{p_child:b.child_name,p_birth:b.birth_date,p_parent:b.parent_name,p_phone:b.phone,p_education:b.education_role,p_parent_hash:hash(t),p_education_hash:hash(token()),p_template:template,p_ip:createHmac('sha256',secret).update(req.ip||'unknown').digest('hex')});
 if(r.error)return json({error:r.error.message.includes('RATE_LIMIT')?'נשלחו מספר פניות. נסו מאוחר יותר.':'לא ניתן לשמור את הפנייה כרגע'},r.error.message.includes('RATE_LIMIT')?429:503);
 return json({parent_token:t});
 }
 const {db,row,role}=await access(req);if(row.form_version!==OFFICIAL_VERSION)return json({error:'גרסת טופס לא מתאימה'},409);
 const parent=role==='parent',done=parent?'parent_submitted_at':'education_submitted_at';
 if(!['parent','education'].includes(row.status)||row[done]||(!parent&&!row.parent_submitted_at))return json({error:'השאלון נעול או אינו מוכן למילוי'},409);
 const parsed=z.record(z.string().max(50),z.string().max(2000)).safeParse(body.answers);
 if(!parsed.success||!validOfficialAnswers(row.form_template,role,parsed.data))return json({error:'תשובות לא תקינות'},400);
 if(body.submit===true&&body.confirmed!==true)return json({error:'יש לאשר את בדיקת השאלון לפני שליחה'},400);
 const pages=officialPages(row.form_template,role),fields=pages.flatMap(p=>p.fields);
 if(body.submit===true&&(Object.values(parsed.data).filter(Boolean).length<3||fields.some(f=>f.required&&!parsed.data[f.id])))return json({error:'יש למלא את השאלון ואת שדות החובה המקוריים'},400);
 const update:Record<string,unknown>={[parent?'parent_answers':'education_answers']:parsed.data};let next:string|undefined;
 if(body.submit===true){update[done]=new Date().toISOString();update.status=parent&&row.education_role!=='none'?'education':'review';if(parent&&row.education_role!=='none'){next=token();update.education_hash=hash(next);}else update.summary=officialSummary({...row,...update});}
 const saved=await db.from('development_referrals').update(update).eq('id',row.id).eq('status',row.status).is(done,null).select('id').maybeSingle();if(saved.error)throw saved.error;if(!saved.data)return json({error:'הפנייה השתנתה. רעננו לפני ניסיון נוסף.'},409);
 return json({ok:true,submitted:body.submit===true,education_token:next});
 }catch(e){return failure(e);}}
