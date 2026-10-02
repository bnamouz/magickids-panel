import { NextRequest,NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { getCurrentStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { profileSchema } from '@/lib/therapists/schema';
import { matchingTherapists,portalLink } from '@/lib/therapists/server';
import { emailOnce } from '@/lib/therapists/mail';
import { notifyAssignment,autoAssign,scheduleTreatment,closeTreatment } from '@/lib/therapists/workflow';
import { syncTreatment } from '@/lib/therapists/calendar';
export const dynamic='force-dynamic';
const reply=(b:unknown,s=200)=>NextResponse.json(b,{status:s,headers:{'Cache-Control':'private, no-store'}});
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return reply({error:'forbidden'},403);
 const staff=await getCurrentStaff();if(!staff)return reply({error:'forbidden'},403);
 try{
  const raw=await req.text();if(raw.length>24000)return reply({error:'invalid_request'},400);const b=JSON.parse(raw),db=getSupabaseAdmin();
  if(b.action==='remove'&&b.confirmed===true){
   const r=await db.rpc('remove_therapist',{p_id:z.string().uuid().parse(b.id)});
   if(r.error)return reply({error:'remove_failed'},409);
   if(!['deleted','archived'].includes(r.data))return reply({error:r.data},409);
   return reply({saved:true,removed:r.data});
  }
  if(b.action==='restore'){
   const r=await db.from('therapists').update({archived_at:null,active:false,updated_at:new Date().toISOString()}).eq('id',z.string().uuid().parse(b.id)).not('archived_at','is',null).select('id').single();
   if(r.error)return reply({error:'restore_failed'},409);return reply({saved:true});
  }
  if(b.action==='save'){
   const p=profileSchema.parse(b.profile);const {id,...fields}=p;
   let access={};if(id){const prior=await db.from('therapists').select('email').eq('id',id).single();if(prior.error)throw new Error('not_found');if(prior.data.email!==fields.email)access={token_version:randomUUID(),token_expires_at:new Date(Date.now()+90*86400000).toISOString()};}
   const q=id?db.from('therapists').update({...fields,...access,updated_at:new Date().toISOString()}).eq('id',id):db.from('therapists').insert(fields);
   const r=await q.select('id').single();if(r.error)return reply({error:'save_failed'},409);
   return reply({saved:true,id:r.data.id});
  }
  if(['link','invite','rotate'].includes(b.action)){
   const id=z.string().uuid().parse(b.id);
   if(b.action==='rotate'){const changed=await db.from('therapists').update({token_version:randomUUID(),token_expires_at:new Date(Date.now()+90*86400000).toISOString()}).eq('id',id);if(changed.error)throw new Error('unavailable');}
   const r=await db.from('therapists').select('*').eq('id',id).single();if(r.error||!r.data.active)return reply({error:'inactive'},409);
   if(Date.parse(r.data.token_expires_at)<=Date.now())return reply({error:'expired'},409);
   const link=portalLink(r.data);if(b.action==='invite'){const state=await emailOnce(`therapist-invite:${id}:${r.data.token_version}`,r.data.email,'הזמנה לפורטל המטפלים — ילדי הקסם',`שלום ${r.data.name},\nעדכון שעות העבודה ותיאום פניות בקישור האישי: ${link}\nאין להעביר את הקישור לאחרים.`);return reply({link,mail:state});}
   return reply({link});
  }
  const id=z.string().uuid().parse(b.id);
  if(b.action==='match') {const r=await db.from('treatment_requests').select('treatment').eq('id',id).single();if(r.error)throw new Error('not_found');return reply({matches:(await matchingTherapists(r.data.treatment)).map(m=>({id:m.profile.id,name:m.profile.name,firstSlot:m.slots[0]}))});}
  if(b.action==='assign'){
   const tid=z.string().uuid().parse(b.therapistId),r=await db.from('treatment_requests').select('treatment').eq('id',id).single();const t=await db.from('therapists').select('*').eq('id',tid).single();
   if(r.error||t.error||!t.data.active||!t.data.treatments.includes(r.data.treatment))return reply({error:'not_matching'},409);
   const saved=await db.from('treatment_requests').update({therapist_id:tid,therapist:t.data.name,updated_by:staff.id,updated_at:new Date().toISOString()}).eq('id',id).in('status',['pending','contacted']).neq('calendar_sync','syncing').select('id').maybeSingle();if(saved.error||!saved.data)return reply({error:'not_assignable'},409);
   return reply({saved:true,mail:await notifyAssignment(id,t.data)});
  }
  if(b.action==='auto')return reply({result:await autoAssign(id)});
  if(b.action==='sync')return reply({calendar:await syncTreatment(id)});
  if(b.action==='close')return reply(await closeTreatment(id));
  if(b.action==='schedule'){if(b.confirmed!==true)return reply({error:'confirm_parent'},400);return reply(await scheduleTreatment(id,z.string().uuid().parse(b.therapistId),z.string().datetime().parse(b.start),staff.id));}
  return reply({error:'invalid_request'},400);
 }catch(e){return reply({error:e instanceof z.ZodError?'invalid_request':e instanceof Error?e.message:'unavailable'},400);}
}
