import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { assertVoiceAuth, normalisePhone } from '@/lib/voice-auth';
import { notifyOnce } from '@/lib/moxo/notification';
import { book, BookingError } from '@/lib/booking/server';
import { voiceCase, requireReady } from '@/lib/voice/intake';
import { isAssessmentSlot } from '@/lib/booking/schedule';
export const runtime='nodejs';
const schema=z.object({case_id:z.string().uuid(),parent_phone:z.string(),slot_iso:z.string().datetime({offset:true})});
export async function POST(req:NextRequest){
 const denied=assertVoiceAuth(req);if(denied)return denied;
 try{
  const body=schema.parse(await req.json()),start=new Date(body.slot_iso).toISOString();
  if(!isAssessmentSlot(start))throw new BookingError('slot_outside_assessment_window',400);
  // Stable case/slot identity: a repeated voice tool call cannot create a second appointment.
  const hash=createHash('sha256').update(`${body.case_id}:${start}`).digest('hex');
  const requestId=`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
  const {session,parent,patient,progress}=await voiceCase(body.case_id,body.parent_phone,requestId);requireReady(progress);
  const result=await book('adhd',{requestId,start,childName:`${patient?.first_name??''} ${patient?.last_name??''}`.trim(),parentName:parent.full_name,phone:normalisePhone(parent.phone)!,parentToken:session.parent_token,consent:true,website:''},`voice:${body.case_id}`);
  const when=new Intl.DateTimeFormat('he-IL',{timeZone:'Asia/Jerusalem',dateStyle:'full',timeStyle:'short'}).format(new Date(start));
  const notification=await notifyOnce(`assessment:${requestId}`,normalisePhone(parent.phone)!,`מכון ילדי הקסם / معهد أطفال السحر: אושר תור לאבחון / تم تأكيد موعد التشخيص: ${when} (שעון ישראל / توقيت إسرائيل). משך / المدة: 60 דקות / دقيقة. 0544020043`);
  return NextResponse.json({success:true,...result,appointment_id:requestId,whatsapp_confirmation_sent:notification==='accepted',notification});
 }catch(error){return NextResponse.json({success:false,error:error instanceof BookingError?error.code:'invalid_request'},{status:error instanceof BookingError?error.status:400});}
}
