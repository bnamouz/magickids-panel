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
  const c=getCalendarClient();
  if(r.status==='closed'){
   try{await c.events.delete({calendarId,eventId,sendUpdates:'none'});}catch(e:any){if(![404,410].includes(e.code??e.response?.status))throw e;}
  }else if(r.status==='scheduled'){
   const event={summary:`טיפול במכון · ${r.therapist}`,description:`פרטי הפנייה זמינים לצוות בלבד: https://app.magickidsinstitute.com/admin/treatments`,visibility:'private',start:{dateTime:r.scheduled_at,timeZone:'Asia/Jerusalem'},end:{dateTime:new Date(Date.parse(r.scheduled_at)+r.duration_minutes*60000).toISOString(),timeZone:'Asia/Jerusalem'},reminders:{useDefault:false,overrides:[{method:'popup',minutes:120},{method:'email',minutes:120}]},extendedProperties:{private:{treatmentRequest:r.id}}};
   try{await c.events.get({calendarId,eventId});await c.events.patch({calendarId,eventId,requestBody:event,sendUpdates:'none'});}catch(e:any){if((e.code??e.response?.status)!==404)throw e;try{await c.events.insert({calendarId,requestBody:{id:eventId,...event},sendUpdates:'none'});}catch(insertError:any){if((insertError.code??insertError.response?.status)!==409)throw insertError;await c.events.patch({calendarId,eventId,requestBody:event,sendUpdates:'none'});}}
  }
  const saved=await db.from('treatment_requests').update({calendar_id:calendarId,calendar_event_id:eventId,calendar_sync:'synced',calendar_synced_at:new Date().toISOString()}).eq('id',id).eq('calendar_sync','syncing');return saved.error?'failed':'synced';
 }catch{await db.from('treatment_requests').update({calendar_sync:'failed',calendar_id:calendarId,calendar_event_id:eventId}).eq('id',id);return 'failed';}
}
