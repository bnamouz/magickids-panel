import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { treatmentSchema } from '@/lib/treatments/schema';
import { BookingError,publicBookingSlots,submitBooking,bookingStatus } from '@/lib/therapists/parent-booking';
export const dynamic='force-dynamic';
export const maxDuration=60;
const reply=(b:unknown,s=200)=>NextResponse.json(b,{status:s,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
const capability=z.object({id:z.string().uuid(),token:z.string().regex(/^[a-f0-9]{64}$/)});
export async function GET(){
 try{return reply(await publicBookingSlots());}catch(e){return reply({error:e instanceof BookingError?e.message:'unavailable'},503);}
}
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return reply({error:'forbidden'},403);
 try{
  const raw=await req.text();if(raw.length>4096)return reply({error:'invalid_request'},413);
  const b=JSON.parse(raw),c=capability.parse(b);
  if(b.action==='status')return reply(await bookingStatus(c.id,c.token));
  if(b.action!=='request')return reply({error:'invalid_request'},400);
  const fields=treatmentSchema.pick({patient:true,contact:true,phone:true,consent:true,website:true}).parse({
   patient:b.patient,contact:b.contact,phone:b.phone,consent:b.consent,website:b.website});
  const start=z.string().datetime().parse(b.start);
  return reply(await submitBooking({...c,...fields,start},req.ip||req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown'));
 }catch(e){return reply({error:e instanceof BookingError?e.message:e instanceof z.ZodError?'invalid_request':'unavailable'},e instanceof BookingError?e.status:e instanceof z.ZodError?400:503);}
}
