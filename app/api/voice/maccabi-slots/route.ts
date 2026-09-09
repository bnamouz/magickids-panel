import { NextRequest, NextResponse } from 'next/server';
import { assertVoiceAuth } from '@/lib/voice-auth';
import { getSlots, BookingError } from '@/lib/booking/server';
import { voiceCase, requireReady } from '@/lib/voice/intake';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const denied=assertVoiceAuth(req);if(denied)return denied;
 try{
  const q=req.nextUrl.searchParams;
  const {progress}=await voiceCase(q.get('case_id')??'',q.get('phone')??'');requireReady(progress);
  const max=Math.min(6,Math.max(1,Number(q.get('max'))||4));
  const slots=(await getSlots('adhd')).slice(0,max).map(iso=>({iso,...Object.fromEntries(['he','ar'].map(lang=>[`display_${lang}`,new Intl.DateTimeFormat(`${lang}-IL`,{timeZone:'Asia/Jerusalem',dateStyle:'full',timeStyle:'short'}).format(new Date(iso))]))}));
  return NextResponse.json({slots,duration_minutes:60,time_zone:'Asia/Jerusalem'},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return NextResponse.json({error:error instanceof BookingError?error.code:'unavailable'},{status:error instanceof BookingError?error.status:503});}
}
