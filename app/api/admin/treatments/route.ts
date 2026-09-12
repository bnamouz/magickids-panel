import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
const schema=z.discriminatedUnion('action',[
 z.object({id:z.string().uuid(),action:z.literal('schedule'),start:z.string().datetime(),duration:z.number().int().min(15).max(180),therapist:z.string().trim().min(2).max(100),availabilityVerified:z.literal(true)}).strict(),
 z.object({id:z.string().uuid(),action:z.enum(['contacted','closed'])}).strict(),
]);
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return reply({error:'forbidden'},403);
 const staff=await getCurrentStaff();if(!staff)return reply({error:'forbidden'},403);
 try{const raw=await req.text();if(raw.length>2048)return reply({error:'invalid_request'},400);const b=schema.parse(JSON.parse(raw));const db=getSupabaseAdmin();
 if(b.action==='schedule'){const saved=await db.rpc('schedule_treatment_request',{p_id:b.id,p_start:b.start,p_duration:b.duration,p_therapist:b.therapist,p_staff:staff.id});if(saved.error)return reply({error:'unavailable'},503);if(saved.data!=='scheduled')return reply({error:saved.data},409);return reply({saved:true});}
 let query=db.from('treatment_requests').update({status:b.action,updated_by:staff.id,updated_at:new Date().toISOString()}).eq('id',b.id);
 if(b.action==='contacted')query=query.in('status',['pending','contacted']);
 const saved=await query.select('id').maybeSingle();if(saved.error||!saved.data)return reply({error:'unavailable'},409);return reply({saved:true});
 }catch{return reply({error:'invalid_request'},400);}
}
