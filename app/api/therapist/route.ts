import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateTherapist,availableSlots } from '@/lib/therapists/server';
import { availabilitySchema } from '@/lib/therapists/schema';
import { getSupabaseAdmin } from '@/lib/supabase';
import { scheduleTreatment,closeTreatment } from '@/lib/therapists/workflow';
export const dynamic='force-dynamic';
const reply=(b:unknown,s=200)=>NextResponse.json(b,{status:s,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return reply({error:'forbidden'},403);
 try{
  const raw=await req.text();if(raw.length>24000)return reply({error:'invalid_request'},400);const b=JSON.parse(raw);
  const t=await authenticateTherapist(String(b.id??''),String(b.token??''));if(!t)return reply({error:'invalid_link'},403);
  const db=getSupabaseAdmin();
  if(b.action==='read'){
   const r=await db.from('treatment_requests').select('id,patient_name,contact_name,phone,treatment,availability,status,scheduled_at,duration_minutes,calendar_sync').eq('therapist_id',t.id).in('status',['pending','contacted','scheduled']).order('created_at').limit(100);if(r.error)throw new Error('unavailable');
   return reply({profile:{id:t.id,name:t.name,hours:t.hours,leave_dates:t.leave_dates,duration:t.duration},requests:r.data,slots:await availableSlots(t)});
  }
  if(b.action==='hours'){const v=availabilitySchema.parse(b.availability);const r=await db.from('therapists').update({...v,updated_at:new Date().toISOString()}).eq('id',t.id);if(r.error)throw new Error('unavailable');return reply({saved:true});}
  const id=z.string().uuid().parse(b.requestId);const r=await db.from('treatment_requests').select('id').eq('id',id).eq('therapist_id',t.id).maybeSingle();if(r.error||!r.data)return reply({error:'not_assigned'},403);
  if(b.action==='schedule'){if(b.confirmed!==true)return reply({error:'confirm_parent'},400);return reply(await scheduleTreatment(id,t.id,z.string().datetime().parse(b.start),null));}
  if(b.action==='close')return reply(await closeTreatment(id,t.id));
  return reply({error:'invalid_request'},400);
 }catch(e){return reply({error:e instanceof z.ZodError?'invalid_request':e instanceof Error?e.message:'unavailable'},400);}
}
