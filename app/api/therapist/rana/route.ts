import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentStaff } from '@/lib/admin/auth';
import { authenticateTherapist } from '@/lib/therapists/server';
import { BookingError,bookingProfile,therapistBookingData,decideBooking,saveBookingHours,publicBookingSlots } from '@/lib/therapists/parent-booking';
import {scheduleReferral} from '@/lib/therapists/referral-booking';
export const dynamic='force-dynamic';
export const maxDuration=60;
const reply=(b:unknown,s=200)=>NextResponse.json(b,{status:s,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return reply({error:'forbidden'},403);
 try{
  const raw=await req.text();if(raw.length>14000)return reply({error:'invalid_request'},413);
  const b=JSON.parse(raw);
  // Authenticate before touching booking records. No caller-selected therapist.
  const t=typeof b.token==='string'?await authenticateTherapist(String(b.id??''),b.token):null;
  const staff=t?null:await getCurrentStaff();
  if(!t&&!staff)return reply({error:'forbidden'},403);
  const profile=await bookingProfile();
  if(t&&t.id!==profile.therapist_id)return reply({error:'forbidden'},403);
  const id=profile.therapist_id;
  if(b.action==='read')return reply(await therapistBookingData(id));
  if(b.action==='referral_slots')return reply(await publicBookingSlots());
  if(b.action==='hours')return reply(await saveBookingHours(id,z.number().int().positive().parse(b.version),b.availability));
  const requestId=z.string().uuid().parse(b.requestId);
  if(b.action==='schedule_referral'){
   if(b.confirmed!==true)return reply({error:'confirm_parent'},400);
   return reply(await scheduleReferral(requestId,id,z.string().datetime().parse(b.start),staff?.id??null));
  }
  if(['approve','reject','cancel'].includes(b.action))return reply(await decideBooking(requestId,id,b.action));
  return reply({error:'invalid_request'},400);
 }catch(e){return reply({error:e instanceof BookingError?e.message:e instanceof z.ZodError?'invalid_request':['invalid_availability','overlapping_windows'].includes(e instanceof Error?e.message:'')?'invalid_availability':'unavailable'},e instanceof BookingError?e.status:400);}
}
