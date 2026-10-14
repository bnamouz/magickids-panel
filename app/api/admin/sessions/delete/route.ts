import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {getCurrentStaff} from '@/lib/admin/auth';
import {getSupabaseAdmin} from '@/lib/supabase';
import {cleanupCaseFiles} from '@/lib/intake/delete-files';
export const dynamic='force-dynamic';
const schema=z.object({sessionId:z.string().uuid(),expectedName:z.string().trim().min(1).max(301),confirmation:z.literal('מחיקה לצמיתות')}).strict();
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return json({error:'בקשה לא מורשית'},403);
 const staff=await getCurrentStaff();if(!staff)return json({error:'נדרשת כניסה'},401);if(staff.role!=='admin')return json({error:'מחיקה לצמיתות מותרת למנהל המערכת בלבד'},403);
 const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return json({error:'יש להקליד את אישור המחיקה'},400);
 const v=parsed.data,{error}=await getSupabaseAdmin().rpc('delete_intake_case',{p_session:v.sessionId,p_staff:staff.id,p_expected_name:v.expectedName});
 if(error){
  const errors:Record<string,string>={active_appointment:'קיים תור עתידי או סנכרון תור בתהליך. יש לטפל בתור לפני מחיקת התיק.',case_changed:'פרטי התיק השתנו. רעננו את הרשימה לפני מחיקה.',case_not_found:'התיק לא נמצא.',external_document:'לתיק מצורף מסמך MOXO חיצוני. יש להסדיר את מחיקתו לפני מחיקת התיק.',shared_document:'קובץ דוח משויך גם לתיק אחר. יש להסדיר את השיוך לפני המחיקה.'};
  const key=Object.keys(errors).find(k=>error.message.includes(k));return json({error:key?errors[key]:'המחיקה לא בוצעה. נסו שוב.'},key==='case_not_found'?404:key?409:500);
 }
 try{const result=await cleanupCaseFiles(v.sessionId);return json({deleted:true,filesPending:result.pending>0},result.pending?202:200);}catch{return json({deleted:true,filesPending:true},202);}
}
