import { access, json, failure, token, hash } from '@/lib/development/server';
import { answersSchema, validateAnswers, summary } from '@/lib/development/schema';
export const dynamic='force-dynamic';
export async function GET(req:Request) { try { if(process.env.DEVELOPMENT_REFERRALS_ENABLED!=='true')return json({error:'המסלול טרם הופעל'},503); const {row,role}=await access(req);return json({role,child_name:row.child_name,answers:role==='parent'?row.parent_answers:row.education_answers,submitted:!!(role==='parent'?row.parent_submitted_at:row.education_submitted_at)}); }catch(e){return failure(e);} }
export async function POST(req:Request) {try {
 if(process.env.DEVELOPMENT_REFERRALS_ENABLED!=='true')return json({error:'המסלול טרם הופעל'},503);
 if(req.headers.get('origin')!==new URL(req.url).origin) throw new Error('ORIGIN');
 if(Number(req.headers.get('content-length')||0)>180000) return json({error:'הטופס גדול מדי'},413);
 const {db,row,role}=await access(req); const body=await req.json();
 const parent=role==='parent', done=parent?'parent_submitted_at':'education_submitted_at';
 if(!['parent','education'].includes(row.status))return json({error:'התיק נעול או מתעדכן. נסו שוב מאוחר יותר'},409);
 if(row[done])return json({error:'השאלון כבר נשלח ונעול לעריכה'},409);
 if(!parent&&!row.parent_submitted_at)return json({error:'ממתין לשאלון ההורים'},409);
 const answers=answersSchema.safeParse(body.answers);if(!answers.success)return json({error:'תשובות לא תקינות'},400);
 if(body.submit===true&&!validateAnswers(role,answers.data))return json({error:'יש להשלים את כל שדות החובה'},400);
 const update:Record<string,unknown>={[parent?'parent_answers':'education_answers']:answers.data};
 let nextToken:string|undefined;
 if(body.submit===true){update[done]=new Date().toISOString();update.status=parent?'education':'review';if(parent){nextToken=token();update.education_hash=hash(nextToken);}else{update.summary=summary(row.parent_answers,answers.data,role);}}
 const {data,error}=await db.from('development_referrals').update(update).eq('id',row.id).eq('status',row.status).is(done,null).select('id').maybeSingle();
 if(error)throw error;if(!data)return json({error:'התיק עודכן בחלון אחר. רעננו את העמוד'},409);
 return json({ok:true,submitted:body.submit===true,education_token:nextToken});
 }catch(e){return failure(e);} }
