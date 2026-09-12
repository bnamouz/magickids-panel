import { createHmac } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { treatmentSchema } from '@/lib/treatments/schema';
const reply = (data: unknown, status = 200) => NextResponse.json(data, {status, headers:{'Cache-Control':'no-store'}});
export async function POST(req: NextRequest) {
 if(req.headers.get('origin') !== req.nextUrl.origin) return reply({error:'forbidden'},403);
 try {
  const raw=await req.text(); if(raw.length>4096) return reply({error:'invalid_request'},413);
  const parsed=treatmentSchema.safeParse(JSON.parse(raw)); if(!parsed.success)return reply({error:'invalid_request'},400);
  const secret=process.env.BOOKING_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!secret) return reply({error:'unavailable'},503);
  const b=parsed.data;
  const result=await getSupabaseAdmin().rpc('submit_treatment_request',{p_id:b.id,p_patient:b.patient,p_contact:b.contact,p_phone:b.phone,p_ip:createHmac('sha256',secret).update(`treatment-ip:${req.ip||'unknown'}`).digest('hex'),p_treatment:b.treatment,p_language:b.language,p_availability:b.availability});
  if(result.error)return reply({error:'unavailable'},503);
  if(result.data!=='received')return reply({error:result.data},result.data==='rate_limited'?429:409);
  return reply({received:true,reference:b.id});
 }catch{return reply({error:'unavailable'},503);}
}
