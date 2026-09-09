import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { assertVoiceAuth, normalisePhone } from '@/lib/voice-auth';
import { voiceCase } from '@/lib/voice/intake';
import { BookingError } from '@/lib/booking/server';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const denied=assertVoiceAuth(req);if(denied)return denied;
 try{
  const phone=normalisePhone(req.nextUrl.searchParams.get('phone'));if(!phone)throw new BookingError('invalid_phone',400);
  let id=req.nextUrl.searchParams.get('case_id');
  if(!id){
   const db=getSupabaseAdmin();
   const variants=[phone,phone.slice(1),'0'+phone.slice(4)];
   const parents=await db.from('parents').select('id').in('phone',variants);
   if(parents.error)throw new BookingError('unavailable');
   if(!parents.data?.length)return NextResponse.json({found:false,intake_completed:false});
   const sessions=await db.from('intake_sessions').select('id').in('primary_parent_id',parents.data.map(row=>row.id)).not('status','in','(closed,cancelled,reported,completed)').limit(2);
   if(sessions.error)throw new BookingError('unavailable');
   if(!sessions.data?.length)return NextResponse.json({found:false,intake_completed:false});
   if(sessions.data.length!==1)return NextResponse.json({found:true,intake_completed:false,requires_case_id:true,message:'Multiple cases. Verify the child and case with staff before scheduling.'});
   id=sessions.data[0].id;
  }
  const {progress,patient}=await voiceCase(id!,phone);
  return NextResponse.json({found:true,case_id:id,child_name:`${patient?.first_name??''} ${patient?.last_name??''}`.trim(),parent_questionnaire_status:progress.parentComplete?'completed':'incomplete',teacher_questionnaire_status:progress.teacherComplete?'completed':'incomplete',intake_completed:progress.bothComplete,ready_to_schedule:progress.readyToSchedule},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return NextResponse.json({found:false,intake_completed:false,error:error instanceof BookingError?error.code:'unavailable'},{status:error instanceof BookingError?error.status:503});}
}
