import {getSupabaseAdmin} from '@/lib/supabase';
import {getCalendarClient} from '@/lib/google-calendar';
import {notifyOnce} from '@/lib/moxo/notification';
import {duePhase,messageKey,phoneNumber,appointmentText,type Phase} from './policy';
export type Source='website_bookings'|'appointments'|'moxo_requests'|'treatment_requests'|'therapist_booking_requests';
const configs={
 website_bookings:{time:'starts_at',statuses:['confirmed'],calendar:'calendar_id',event:'event_id'},
 appointments:{time:'scheduled_at',statuses:['scheduled','confirmed'],calendar:'gcal_calendar_id',event:'gcal_event_id'},
 moxo_requests:{time:'scheduled_at',statuses:['approved'],calendar:'google_calendar_id',event:'google_event_id'},
 treatment_requests:{time:'scheduled_at',statuses:['scheduled'],calendar:'calendar_id',event:'calendar_event_id'},
 therapist_booking_requests:{time:'starts_at',statuses:['confirmed'],calendar:'calendar_id',event:'event_id'},
} as const;
export async function sendAppointmentMessage(source:Source,id:string,phase:Phase='confirmation',now=new Date()){
 if(process.env.APPOINTMENT_MESSAGES_ENABLED!=='true')return 'disabled';
 const db=getSupabaseAdmin(),c=configs[source];
 const found=await db.from(source).select('*').eq('id',id).maybeSingle();
 if(found.error)throw new Error('database_unavailable');
 const r=found.data;
 if(!r||!(c.statuses as readonly string[]).includes(r.status))return 'inactive';
 const start=r[c.time],calendarId=r[c.calendar],eventId=r[c.event];
 if(!start||Date.parse(start)<=now.getTime()||!calendarId||!eventId)return 'not_ready';
 if(phase!=='confirmation'&&duePhase(start,now)!==phase)return 'not_due';
 // An intake appointment may mirror a website booking: only its original sends.
 if(source==='appointments'){
  const mirror=await db.from('website_bookings').select('id').eq('calendar_id',calendarId).eq('event_id',eventId).maybeSingle();
  if(mirror.error)throw new Error('database_unavailable');
  if(mirror.data)return sendAppointmentMessage('website_bookings',mirror.data.id,phase,now);
 }
 const event=(await getCalendarClient().events.get({calendarId,eventId},{timeout:5000,retry:false})).data;
 if(event.status==='cancelled'||Date.parse(event.start?.dateTime??'')!==Date.parse(start))return 'calendar_mismatch';
 let phone=r.phone,language=r.language??'he',consent=true;
 if(source==='website_bookings'){
  const p=event.extendedProperties?.private;
  if(p?.websiteBooking!==id)return 'calendar_mismatch';
  phone=p.reminderPhone;language=p.language??'he';consent=p.reminderConsent==='true';
 }else if(source==='appointments'){
  const session=await db.from('intake_sessions').select('primary_parent_id').eq('id',r.session_id).maybeSingle();
  if(session.error)throw new Error('database_unavailable');
  if(!session.data?.primary_parent_id)return 'no_contact';
  const parent=await db.from('parents').select('phone,consent_given').eq('id',session.data.primary_parent_id).maybeSingle();
  if(parent.error)throw new Error('database_unavailable');
  phone=parent.data?.phone;consent=parent.data?.consent_given===true;
 }else if(source==='treatment_requests')consent=r.reminder_consent===true;
 if(phase!=='confirmation'&&!consent)return 'no_consent';
 const normalized=phoneNumber(phone??'');if(!normalized)return 'no_contact';
 // Recheck after the external read, including reschedules and cancellation.
 const current=await db.from(source).select(`status,${c.time},${c.event}`).eq('id',id).maybeSingle();
 if(current.error)throw new Error('database_unavailable');
 if(!current.data||!(c.statuses as readonly string[]).includes(current.data.status)||(current.data as Record<string,string>)[c.time]!==start||(current.data as Record<string,string>)[c.event]!==eventId)return 'changed';
 return notifyOnce(messageKey(calendarId,eventId,start,phase),normalized,appointmentText(start,phase,language));
}
export async function sendAppointmentReminders(now=new Date()){
 if(process.env.APPOINTMENT_MESSAGES_ENABLED!=='true')throw new Error('disabled');
 const db=getSupabaseAdmin();let accepted=0,skipped=0,failed=0;const deadline=Date.now()+240000;
 for(const source of Object.keys(configs) as Source[]){
  const c=configs[source];
  // Recover interrupted confirmation hooks, bounded to recent confirmations only.
  const modified=source==='moxo_requests'?'approved_at':'updated_at';
  const recent=await db.from(source).select('id').in('status',[...c.statuses]).gt(c.time,now.toISOString()).gte(modified,new Date(now.getTime()-15*60000).toISOString()).limit(101);
  if(recent.error||(recent.data?.length??0)>100)throw new Error('scan_incomplete');
  for(const row of recent.data??[]){if(Date.now()>deadline)throw new Error('scan_timeout');try{await sendAppointmentMessage(source,row.id,'confirmation',now);}catch{failed++;}}
  const rows=await db.from(source).select(`id,${c.time}`).in('status',[...c.statuses])
   .gt(c.time,new Date(now.getTime()+60*60000).toISOString()).lte(c.time,new Date(now.getTime()+1440*60000).toISOString()).order(c.time).limit(1001);
  if(rows.error||(rows.data?.length??0)>1000)throw new Error('scan_incomplete');
  for(const row of rows.data??[]){
   const phase=duePhase((row as Record<string,string>)[c.time],now);if(!phase)continue;
   if(Date.now()>deadline)throw new Error('scan_timeout');
   try{const state=await sendAppointmentMessage(source,row.id,phase,now);if(state==='accepted')accepted++;else if(['unknown','unavailable','not_configured','sending'].includes(state))failed++;else skipped++;}catch{failed++;}
  }
 }
 return {accepted,skipped,failed};
}
