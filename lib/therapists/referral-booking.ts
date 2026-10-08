import {getSupabaseAdmin} from '@/lib/supabase';
import {bookingProfile,publicBookingSlots,BookingError} from './parent-booking';
import {syncTreatment} from './calendar';

// An existing general referral stays the same record. Do not copy patient data
// into a second booking request or manufacture a parent-selected appointment.
export async function scheduleReferral(id:string,therapistId:string,start:string,staffId:string|null){
 const db=getSupabaseAdmin(),profile=await bookingProfile();
 if(profile.therapist_id!==therapistId)throw new BookingError('forbidden',403);
 const found=await db.from('treatment_requests').select('id,status,scheduled_at,duration_minutes,calendar_sync')
  .eq('id',id).eq('therapist_id',therapistId).maybeSingle();
 if(found.error)throw new BookingError('unavailable',503);
 if(!found.data)throw new BookingError('not_found',404);
 const r=found.data;
 let claimedAt:string|null=null;
 if(r.status==='scheduled'){
  if(Date.parse(r.scheduled_at)!==Date.parse(start))throw new BookingError('invalid_state');
  if(r.calendar_sync==='synced')return {status:'confirmed'};
  if(r.calendar_sync==='syncing')throw new BookingError('busy');
 }else{
  if(!['pending','contacted'].includes(r.status))throw new BookingError('invalid_state');
  const available=await publicBookingSlots(),slot=available.slots.find(s=>s.start===start);
  if(!slot)throw new BookingError('slot_taken');
  // Existing assignment, closure and scheduling endpoints respect 'syncing'.
  // Claim before booking so a reassignment cannot race the authorization check.
  claimedAt=new Date().toISOString();
  const claimed=await db.from('treatment_requests').update({calendar_sync:'syncing',calendar_sync_started_at:claimedAt})
   .eq('id',id).eq('therapist_id',therapistId).in('status',['pending','contacted']).neq('calendar_sync','syncing').select('id').maybeSingle();
  if(claimed.error)throw new BookingError('unavailable',503);
  if(!claimed.data)throw new BookingError('busy');
  // Existing RPC and the overlap trigger share the same advisory lock with
  // parent booking requests. The slot's 45/60-minute duration is authoritative.
  const booked=await db.rpc('schedule_treatment_request',{p_id:id,p_start:slot.start,
   p_duration:slot.duration,p_therapist:profile.therapist.name,p_staff:staffId});
  if(booked.error||booked.data!=='scheduled'){
   // Unknown RPC outcomes retain the scheduled row's slot and permit retry.
   await db.from('treatment_requests').update({calendar_sync:'failed'})
    .eq('id',id).eq('therapist_id',therapistId).eq('calendar_sync_started_at',claimedAt).eq('calendar_sync','syncing');
   if(booked.error)throw new BookingError(String(booked.error.message).includes('slot_taken')?'slot_taken':'unavailable');
   throw new BookingError(booked.data==='already_scheduled'?'invalid_state':booked.data);
  }
 }
 let queued=db.from('treatment_requests').update({calendar_sync:'pending',calendar_id:profile.calendar_id,updated_at:new Date().toISOString()})
  .eq('id',id).eq('therapist_id',therapistId).eq('status','scheduled');
 queued=claimedAt?queued.eq('calendar_sync','syncing').eq('calendar_sync_started_at',claimedAt):queued.neq('calendar_sync','syncing');
 const saved=await queued.select('id').maybeSingle();
 if(saved.error)throw new BookingError('sync_pending',503);
 if(!saved.data)throw new BookingError('busy');
 const calendar=await syncTreatment(id);
 if(calendar!=='synced')throw new BookingError('sync_pending',503);
 return {status:'confirmed'};
}
