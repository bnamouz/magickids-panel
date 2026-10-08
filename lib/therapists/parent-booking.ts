import { createHmac, randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getCalendarClient } from '@/lib/google-calendar';
import { parseFreeBusy, type Busy } from '@/lib/booking/schedule';
import { requestSlots, validateRequestAvailability, type RequestAvailability } from './request-slots';

export const BOOKING_SLUG = 'rana';
export class BookingError extends Error {
  constructor(message:string,public status=409){super(message);}
}
export function bookingHash(value:string) {
  const secret=process.env.BOOKING_HASH_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!secret)throw new BookingError('unavailable',503);
  return createHmac('sha256',secret).update(`therapy-booking:${value}`).digest('hex');
}
export async function bookingProfile() {
  const db=getSupabaseAdmin();
  const p=await db.from('therapist_booking_profiles').select('*').eq('slug',BOOKING_SLUG).eq('enabled',true).maybeSingle();
  if(p.error||!p.data)throw new BookingError('unavailable',503);
  const t=await db.from('therapists').select('id,name,active,leave_dates').eq('id',p.data.therapist_id).eq('active',true).maybeSingle();
  if(t.error||!t.data)throw new BookingError('unavailable',503);
  return {...p.data,therapist:t.data,availability:validateRequestAvailability(p.data.availability)};
}
export async function googleBusy(calendarId:string,start:string,end:string):Promise<Busy[]> {
  try {
    const result=await getCalendarClient().freebusy.query({requestBody:{timeMin:start,timeMax:end,timeZone:'Asia/Jerusalem',items:[{id:calendarId}]}});
    return parseFreeBusy(result.data.calendars,[calendarId]);
  }catch{throw new BookingError('calendar_unavailable',503);}
}
export async function publicBookingSlots() {
  const p=await bookingProfile(),now=new Date(),db=getSupabaseAdmin();
  const end=new Date(now.getTime()+29*86400000).toISOString();
  const [requests,legacy,external]=await Promise.all([
    db.from('therapist_booking_requests').select('starts_at,ends_at,status,expires_at').eq('therapist_id',p.therapist_id)
      .in('status',['pending','syncing','confirmed','cancelling']).gt('ends_at',now.toISOString()).lt('starts_at',end),
    db.from('treatment_requests').select('therapist_id,therapist,scheduled_at,duration_minutes').eq('status','scheduled')
      .gte('scheduled_at',new Date(now.getTime()-86400000).toISOString()).lt('scheduled_at',end),
    googleBusy(p.calendar_id,now.toISOString(),end),
  ]);
  if(requests.error||legacy.error)throw new BookingError('unavailable',503);
  const held:Busy[]=(requests.data??[]).filter(r=>r.status!=='pending'||Date.parse(r.expires_at)>now.getTime()).map(r=>({start:r.starts_at,end:r.ends_at}));
  const old:Busy[]=(legacy.data??[]).filter(r=>r.therapist_id===p.therapist_id||(!r.therapist_id&&r.therapist?.toLowerCase()===p.therapist.name.toLowerCase()))
    .map(r=>({start:r.scheduled_at,end:new Date(Date.parse(r.scheduled_at)+r.duration_minutes*60000).toISOString()}));
  const slots=requestSlots(p.availability,[...held,...old,...external],now).filter(s=>
    !(p.therapist.leave_dates??[]).some((d:{start:string;end:string})=>s.day>=d.start&&s.day<=d.end));
  return {name:p.therapist.name,slots,timeZone:'Asia/Jerusalem'};
}
export async function submitBooking(b:{id:string;token:string;patient:string;contact:string;phone:string;start:string},ip:string) {
  // Retries may occur after the original reservation hid its slot.
  const db=getSupabaseAdmin();
  const existing=await db.from('therapist_booking_requests').select('id,parent_hash,patient_name,contact_name,phone,starts_at')
    .eq('id',b.id).maybeSingle();
  if(existing.error)throw new BookingError('unavailable',503);
  if(existing.data) {
    const r=existing.data;
    if(r.parent_hash!==bookingHash(b.token)||r.patient_name!==b.patient||r.contact_name!==b.contact
      ||r.phone!==b.phone||Date.parse(r.starts_at)!==Date.parse(b.start))throw new BookingError('invalid_retry');
    return {received:true,id:b.id};
  }
  const slots=await publicBookingSlots();
  const slot=slots.slots.find(s=>s.start===b.start);
  if(!slot)throw new BookingError('slot_taken');
  const result=await db.rpc('submit_therapy_booking',{p_id:b.id,p_slug:BOOKING_SLUG,p_hash:bookingHash(b.token),
    p_patient:b.patient,p_contact:b.contact,p_phone:b.phone,p_ip:bookingHash(ip),p_start:slot.start,p_end:slot.end});
  if(result.error)throw new BookingError('unavailable',503);
  if(result.data!=='received')throw new BookingError(result.data,result.data==='rate_limited'?429:409);
  return {received:true,id:b.id};
}
export async function bookingStatus(id:string,token:string) {
  const r=await getSupabaseAdmin().from('therapist_booking_requests')
    .select('id,status,starts_at,ends_at,duration,expires_at,last_error')
    .eq('id',id).eq('parent_hash',bookingHash(token)).maybeSingle();
  if(r.error)throw new BookingError('unavailable',503);
  if(!r.data)throw new BookingError('not_found',404);
  return {...r.data,status:r.data.status==='pending'&&Date.parse(r.data.expires_at)<=Date.now()?'expired':r.data.status};
}
export async function therapistBookingData(therapistId:string) {
  const p=await bookingProfile();
  if(p.therapist_id!==therapistId)throw new BookingError('forbidden',403);
  const r=await getSupabaseAdmin().from('therapist_booking_requests')
    .select('id,patient_name,contact_name,phone,starts_at,ends_at,duration,status,expires_at,last_error,lease_until')
    .eq('therapist_id',therapistId).order('starts_at',{ascending:false}).limit(200);
  if(r.error)throw new BookingError('unavailable',503);
  const referrals=await getSupabaseAdmin().from('treatment_requests')
    .select('id,patient_name,contact_name,phone,availability,status,scheduled_at,duration_minutes,calendar_sync,created_at')
    .eq('therapist_id',therapistId).order('created_at',{ascending:false}).limit(200);
  if(referrals.error)throw new BookingError('unavailable',503);
  return {name:p.therapist.name,availability:p.availability,version:p.version,
    referrals:referrals.data??[],
    requests:(r.data??[]).map(r=>({...r,status:r.status==='pending'&&Date.parse(r.expires_at)<=Date.now()?'expired':r.status}))};
}
export async function saveBookingHours(therapistId:string,version:number,availability:unknown) {
  const value=validateRequestAvailability(availability);
  // Midnight-crossing slots are intentionally unsupported in SQL and UI.
  if(value.windows.some(w=>w.end>=1440))throw new BookingError('invalid_availability',400);
  const r=await getSupabaseAdmin().rpc('save_therapy_booking_hours',{p_therapist:therapistId,p_version:version,p_availability:value});
  if(r.error)throw new BookingError('unavailable',503);
  if(r.data!=='saved')throw new BookingError(r.data);
  return {saved:true};
}
function isOwnEvent(event:any,r:any) {
  return event.extendedProperties?.private?.therapyBooking===r.id
    && Date.parse(event.start?.dateTime)===Date.parse(r.starts_at)
    && Date.parse(event.end?.dateTime)===Date.parse(r.ends_at);
}
export async function decideBooking(id:string,therapistId:string,action:'approve'|'reject'|'cancel') {
  const db=getSupabaseAdmin(),lease=randomUUID();
  const c=await db.rpc('claim_therapy_booking',{p_id:id,p_therapist:therapistId,p_action:action,p_lease:lease});
  if(c.error)throw new BookingError('unavailable',503);
  if(['confirmed','rejected','cancelled'].includes(c.data))return {status:c.data};
  if(c.data!=='claimed')throw new BookingError(c.data);
  const row=await db.from('therapist_booking_requests').select('*').eq('id',id).eq('therapist_id',therapistId).single();
  if(row.error)throw new BookingError('unavailable',503);
  const r=row.data;
  const finish=async(result:string)=>{
    const f=await db.rpc('finish_therapy_booking',{p_id:id,p_lease:lease,p_result:result});
    if(f.error||f.data==='lost_lease')throw new BookingError('sync_pending',503);
    return f.data as string;
  };
  try {
    const calendar=getCalendarClient();
    let event:any=null;
    try{event=(await calendar.events.get({calendarId:r.calendar_id,eventId:r.event_id})).data;}
    catch(e:any){if(![404,410].includes(e.code??e.response?.status))throw e;}
    if(action==='cancel'){
      if(event&&event.status!=='cancelled'){
        if(!isOwnEvent(event,r))throw new BookingError('event_mismatch');
        await calendar.events.delete({calendarId:r.calendar_id,eventId:r.event_id,sendUpdates:'none'});
      }
      return {status:await finish('cancelled')};
    }
    if(event){
      if(event.status==='cancelled'||!isOwnEvent(event,r))throw new BookingError('event_mismatch');
    }else{
      // Revalidate after a crash/unknown write, but reconcile an existing event
      // above even if the schedule has subsequently changed.
      const valid=await db.rpc('therapy_booking_valid_slot',{p_therapist:therapistId,p_start:r.starts_at,p_end:r.ends_at});
      if(valid.error)throw new BookingError('unavailable',503);
      if(!valid.data||Date.parse(r.starts_at)<=Date.now()){
        await finish('conflict');throw new BookingError('slot_taken');
      }
      const conflicts=await googleBusy(r.calendar_id,r.starts_at,r.ends_at);
      if(conflicts.length){await finish('conflict');throw new BookingError('slot_taken');}
      try{
        event=(await calendar.events.insert({calendarId:r.calendar_id,sendUpdates:'none',requestBody:{
          id:r.event_id,summary:'טיפול רגשי · ילדי הקסם',visibility:'private',
          description:'פרטי הבקשה זמינים בפורטל המטפלת בלבד. מזהה בקשה: '+r.id,
          start:{dateTime:r.starts_at,timeZone:'Asia/Jerusalem'},end:{dateTime:r.ends_at,timeZone:'Asia/Jerusalem'},
          reminders:{useDefault:false,overrides:[]},
          extendedProperties:{private:{therapyBooking:r.id}},
        }})).data;
      }catch(e:any){
        if((e.code??e.response?.status)!==409)throw e;
        event=(await calendar.events.get({calendarId:r.calendar_id,eventId:r.event_id})).data;
      }
      if(event.status==='cancelled'||!isOwnEvent(event,r))throw new BookingError('event_mismatch');
    }
    return {status:await finish('confirmed')};
  }catch(e){
    if(e instanceof BookingError&&e.message==='slot_taken')throw e;
    await finish('failed').catch(()=>null);
    throw new BookingError(e instanceof BookingError&&e.message==='event_mismatch'?'event_mismatch':'sync_pending',503);
  }
}
