import {NextRequest,NextResponse} from 'next/server';
import {getCurrentStaff} from '@/lib/admin/auth';
import {book,bookingSchema,BookingError} from '@/lib/booking/server';
export const dynamic='force-dynamic';
export const maxDuration=60;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(req:NextRequest){
  const staff=await getCurrentStaff();
  if(!staff||req.headers.get('origin')!==req.nextUrl.origin)return reply({error:'forbidden'},403);
  try{
    const raw=await req.text();if(raw.length>8192)return reply({error:'invalid_body'},413);
    const body=bookingSchema.parse(JSON.parse(raw));
    if(body.visitType==='followup'||body.parentToken||body.reminderConsent)return reply({error:'invalid_body'},400);
    const result=await book('pediatrics',body,`staff:${staff.id}`,true);
    return reply({confirmed:result.confirmed,start:result.start,reference:result.reference});
  }catch(error){return error instanceof BookingError?reply({error:error.code},error.status):reply({error:'unavailable'},503);}
}
