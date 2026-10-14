import {NextRequest,NextResponse} from 'next/server';
import {getCurrentStaff} from '@/lib/admin/auth';
import {getSupabaseAdmin} from '@/lib/supabase';
import {getCalendarClient,getCalendarId} from '@/lib/google-calendar';
import {z} from 'zod';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest){
 if(!await getCurrentStaff()||req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'forbidden'},{status:403});
 try{
  const {appointment_id,reason}=z.object({appointment_id:z.string().uuid(),reason:z.string().max(1000).optional()}).parse(await req.json());
  const db=getSupabaseAdmin();
  const found=await db.from('appointments').select('*').eq('id',appointment_id).single();
  if(found.error||!found.data)return NextResponse.json({error:'not_found'},{status:404});
  const r=found.data;
  if(r.status==='cancelled')return NextResponse.json({ok:true});
  const claim=await db.from('appointments').update({calendar_sync:'cancelling'}).eq('id',r.id).neq('calendar_sync','syncing').select('id').maybeSingle();
  if(claim.error||!claim.data)return NextResponse.json({error:'sync_pending'},{status:409});
  try{
   if(r.gcal_event_id){
    try{await getCalendarClient().events.delete({calendarId:r.gcal_calendar_id||getCalendarId(),eventId:r.gcal_event_id,sendUpdates:'none'});}
    catch(e:any){if(![404,410].includes(Number(e.code??e.response?.status)))throw e;}
    const released=await db.from('website_bookings').update({status:'released',updated_at:new Date().toISOString()}).eq('event_id',r.gcal_event_id).eq('calendar_id',r.gcal_calendar_id||getCalendarId());
    if(released.error)throw released.error;
   }
   const updated=await db.from('appointments').update({status:'cancelled',calendar_sync:'synced',cancelled_reason:reason||null,cancelled_at:new Date().toISOString()}).eq('id',r.id);
   if(updated.error)throw updated.error;
   return NextResponse.json({ok:true});
  }catch{return NextResponse.json({error:'ביטול היומן טרם הושלם. יש לנסות שוב.'},{status:503});}
 }catch{return NextResponse.json({error:'invalid_request'},{status:400});}
}
