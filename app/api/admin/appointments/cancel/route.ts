import {NextRequest,NextResponse} from 'next/server';
import {getCurrentStaff} from '@/lib/admin/auth';
import {cancelAppointment} from '@/lib/appointments/cancel';
import {z} from 'zod';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest){
 const staff=await getCurrentStaff();
 if(!staff||req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'forbidden'},{status:403});
 try{
  const {appointment_id,reason}=z.object({appointment_id:z.string().uuid(),reason:z.string().max(1000).optional()}).parse(await req.json());
  const result=await cancelAppointment(appointment_id,reason??null,{id:staff.id,type:'staff'});
  if(result.ok)return NextResponse.json({ok:true});
  if(result.error==='not_found')return NextResponse.json({error:'not_found'},{status:404});
  if(result.error==='sync_pending')return NextResponse.json({error:'sync_pending'},{status:409});
  return NextResponse.json({error:'ביטול היומן טרם הושלם. יש לנסות שוב.'},{status:503});
 }catch{return NextResponse.json({error:'invalid_request'},{status:400});}
}
