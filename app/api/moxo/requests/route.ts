import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { moxoSchema } from '@/lib/moxo/schema';
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'forbidden'},{status:403});
 try{
  const raw=await req.text();if(raw.length>3000)return NextResponse.json({error:'invalid_request'},{status:400});
  const {consent,website,...body}=moxoSchema.parse(JSON.parse(raw));
  const db=getSupabaseAdmin();
  // No messages or appointments are created by this public endpoint.
  const result=await db.rpc('submit_moxo_request',{p_id:body.id,p_patient:body.patient_name,p_contact:body.contact_name,p_phone:body.phone,p_language:body.language,p_date:body.preferred_date??null});
  if(result.error)return NextResponse.json({error:'unavailable'},{status:503});
  if(result.data!=='pending')return NextResponse.json({error:result.data},{status:result.data==='rate_limited'?429:400});
  return NextResponse.json({received:true,status:'pending',reference:body.id},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'invalid_request'},{status:400});}
}
