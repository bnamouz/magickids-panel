import {sendAppointmentMessage} from '@/lib/appointment-messages/server';
import {ensureCalendarEvent} from '@/lib/calendar-consistency';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getCalendarClient, getCalendarId } from '@/lib/google-calendar';
export function calendarConfigured(){return !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON&&!!(process.env.TREATMENT_CALENDAR_ID||process.env.GOOGLE_CALENDAR_ID);}
export async function syncTreatment(id:string){
 const db=getSupabaseAdmin();
 if(!calendarConfigured())return 'not_configured';
 const claim=await db.from('treatment_requests').update({calendar_sync:'syncing',calendar_sync_started_at:new Date().toISOString()}).eq('id',id).in('calendar_sync',['pending','failed']).select('*').maybeSingle();
 if(claim.error)return 'failed';if(!claim.data)return 'unchanged';
 const r=claim.data;
 // Opt-in therapists have an explicit calendar. Never silently use ADHD for
 // new legacy/manual bookings of an opted-in therapist.
 const profile=r.therapist_id?await db.from('therapist_booking_profiles').select('calendar_id').eq('therapist_id',r.therapist_id).maybeSingle():null;
 if(profile?.error){await db.from('treatment_requests').update({calendar_sync:'failed'}).eq('id',id);return 'failed';}
 const calendarId=r.calendar_id||profile?.data?.calendar_id||process.env.TREATMENT_CALENDAR_ID||getCalendarId(),eventId=r.calendar_event_id||'treatment'+r.id.replace(/-/g,'');
 try{
  // Bind before writing to Google so the cross-table guard sees this calendar.
  const bound=await db.from('treatment_requests').update({calendar_id:calendarId,calendar_event_id:eventId}).eq('id',id).eq('calendar_sync','syncing');
  if(bound.error)throw bound.error;
  const c=getCalendarClient();
  if(r.status==='closed'){
   try{await c.events.delete({calendarId,eventId,sendUpdates:'none'});}catch(e:any){if(![404,410].includes(e.code??e.response?.status))throw e;}
  }else if(r.status==='scheduled'){
   const event={summary:`טיפול במכון · ${r.therapist}`,description:`פרטי הפנייה זמינים לצוות בלבד: https://app.magickidsinstitute.com/admin/treatments`,visibility:'private',start:{dateTime:r.scheduled_at,timeZone:'Asia/Jerusalem'},end:{dateTime:new Date(Date.parse(r.scheduled_at)+r.duration_minutes*60000).toISOString(),timeZone:'Asia/Jerusalem'},reminders:{useDefault:false,overrides:[{method:'popup',minutes:120},{method:'email',minutes:120}]},extendedProperties:{private:{treatmentRequest:r.id}}};
   await ensureCalendarEvent(c,calendarId,eventId,event,[calendarId],true);
  }
  const saved=await db.from('treatment_requests').update({calendar_id:calendarId,calendar_event_id:eventId,calendar_sync:'synced',calendar_synced_at:new Date().toISOString()}).eq('id',id).eq('calendar_sync','syncing');if(!saved.error&&r.status==='scheduled')await sendAppointmentMessage('treatment_requests',id).catch(()=>null);return saved.error?'failed':'synced';
 }catch{await db.from('treatment_requests').update({calendar_sync:'failed'}).eq('id',id);return 'failed';}
}
