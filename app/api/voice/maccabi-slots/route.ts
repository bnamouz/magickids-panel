import { NextRequest, NextResponse } from 'next/server';
import { assertVoiceAuth } from '@/lib/voice-auth';
import { getSlots, BookingError } from '@/lib/booking/server';
import { voiceCase } from '@/lib/voice/intake';
export const runtime='nodejs';
export const dynamic='force-dynamic';
/**
 * Sarah may always tell families the next free assessment dates (no case needed).
 * Booking itself stays gated: `booking_allowed` is true only for a verified case whose
 * parent and teacher questionnaires are complete (see book-maccabi → requireReady).
 */
export async function GET(req:NextRequest){
 const denied=assertVoiceAuth(req);if(denied)return denied;
 try{
  const q=req.nextUrl.searchParams, caseId=q.get('case_id')??'', phone=q.get('phone')??'';
  let booking_allowed=false, booking_block:'no_case'|'case_not_found'|'intake_incomplete'|'case_not_ready'|null='no_case';
  if(caseId||phone){
   try{
    const {progress}=await voiceCase(caseId,phone);
    if(!progress.bothComplete) booking_block='intake_incomplete';
    else if(!progress.readyToSchedule) booking_block='case_not_ready';
    else { booking_allowed=true; booking_block=null; }
   }catch(e){ if(e instanceof BookingError && (e.code==='case_not_found'||e.code==='invalid_case')) booking_block='case_not_found'; else throw e; }
  }
  const max=Math.min(6,Math.max(1,Number(q.get('max'))||4));
  const slots=(await getSlots('adhd')).slice(0,max).map(iso=>({iso,...Object.fromEntries(['he','ar'].map(lang=>[`display_${lang}`,new Intl.DateTimeFormat(`${lang}-IL`,{timeZone:'Asia/Jerusalem',dateStyle:'full',timeStyle:'short'}).format(new Date(iso))]))}));
  return NextResponse.json({slots,duration_minutes:60,time_zone:'Asia/Jerusalem',booking_allowed,booking_block},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return NextResponse.json({error:error instanceof BookingError?error.code:'unavailable'},{status:error instanceof BookingError?error.status:503});}
}
