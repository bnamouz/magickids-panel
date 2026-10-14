import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {getCurrentStaff} from '@/lib/admin/auth';
import {getSupabaseAdmin} from '@/lib/supabase';
export const dynamic='force-dynamic';
const text=z.string().trim().max(150),phone=z.string().trim().max(30).regex(/^[+\d\s()-]*$/);
const fields=z.object({first_name:text.min(1),last_name:text.min(1),birth_date:z.string().date().refine(d=>d<=''+new Date().toISOString().slice(0,10)),school:text,grade:text,parent_name:text,parent_phone:phone,parent_email:z.union([z.literal(''),z.string().trim().email().max(254)]),teacher_name:text,teacher_phone:phone,reason_for_referral:z.string().trim().max(5000)}).strict();
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('edit'),sessionId:z.string().uuid(),version:z.string().length(32),fields}),
 z.object({action:z.enum(['read','archive','restore']),sessionId:z.string().uuid()})
]);
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return json({error:'בקשה לא מורשית'},403);
 const staff=await getCurrentStaff();if(!staff)return json({error:'נדרשת כניסת צוות'},401);
 const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return json({error:'בדקו את הפרטים שהוזנו'},400);
 const v=parsed.data;
 const {data,error}=await getSupabaseAdmin().rpc('manage_dashboard_case',{p_session:v.sessionId,p_staff:staff.id,p_action:v.action,p_data:v.action==='edit'?v.fields:{},p_version:v.action==='edit'?v.version:null});
 if(error){if(error.message.includes('case_changed'))return json({error:'התיק עודכן בינתיים. רעננו את הדף לפני שמירה נוספת.'},409);if(error.message.includes('case_not_found'))return json({error:'התיק לא נמצא'},404);return json({error:'הפעולה לא נשמרה. נסו שוב.'},500);}
 return json(v.action==='read'?{...data,canDelete:staff.role==='admin'}:data);
}
