import { createHmac, timingSafeEqual } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { Therapist } from './schema';
import { therapistSlots } from './slots';
export const BASE='https://app.magickidsinstitute.com';
function secret(){const s=process.env.BOOKING_HASH_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY;if(!s)throw new Error('not_configured');return s;}
export function portalToken(t:Therapist){return createHmac('sha256',secret()).update(`therapist:${t.id}:${t.token_version}`).digest('hex');}
export function portalLink(t:Therapist){return `${BASE}/therapist#id=${t.id}&token=${portalToken(t)}`;}
export async function authenticateTherapist(id:string,token:string){
 if(!/^[a-f0-9-]{36}$/.test(id)||!/^[a-f0-9]{64}$/.test(token))return null;
 const {data,error}=await getSupabaseAdmin().from('therapists').select('*').eq('id',id).maybeSingle();
 if(error||!data?.active||Date.parse(data.token_expires_at)<=Date.now())return null;
 return timingSafeEqual(Buffer.from(token),Buffer.from(portalToken(data)))?data as Therapist:null;
}
export async function availableSlots(t:Therapist,exclude?:string){
 const r=await getSupabaseAdmin().from('treatment_requests').select('id,therapist_id,therapist,scheduled_at,duration_minutes').eq('status','scheduled').gte('scheduled_at',new Date(Date.now()-86400000).toISOString());
 if(r.error)throw new Error('unavailable');
 return therapistSlots(t,(r.data??[]).filter(b=>b.therapist_id===t.id||(!b.therapist_id&&b.therapist?.toLowerCase()===t.name.toLowerCase())),new Date(),exclude);
}
export async function matchingTherapists(treatment:string){
 const {data,error}=await getSupabaseAdmin().from('therapists').select('*').eq('active',true).contains('treatments',[treatment]);
 if(error)throw new Error('unavailable');
 const matches=await Promise.all((data??[]).map(async t=>({profile:t,slots:await availableSlots(t)})));
 return matches.filter(m=>m.slots.length>0);
}
