import {sendAppointmentMessage} from '@/lib/appointment-messages/server';
import {ensureCalendarEvent} from '@/lib/calendar-consistency';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getCalendarClient, getCalendarId } from '@/lib/google-calendar';
import type { calendar_v3 } from 'googleapis';

export async function writeMoxoEvent(calendar:calendar_v3.Calendar, calendarId:string, row:{id:string;scheduled_at:string;duration_minutes:number}) {
 // Google IDs accept only base32hex (0-9, a-v); UUID hex is valid.
 const eventId=`test${row.id.replaceAll('-','')}`;
 const body={summary:'מבדק MOXO · ילדי הקסם',visibility:'private',
  description:`פרטי המבדק במערכת המכון, בעמוד בקשות MOXO. מזהה: ${row.id}`,
  start:{dateTime:new Date(row.scheduled_at).toISOString(),timeZone:'Asia/Jerusalem'},
  end:{dateTime:new Date(Date.parse(row.scheduled_at)+row.duration_minutes*60000).toISOString(),timeZone:'Asia/Jerusalem'},
  extendedProperties:{private:{moxoRequestId:row.id}},
  reminders:{useDefault:true}};
 await ensureCalendarEvent(calendar,calendarId,eventId,body);
 return eventId;
}

export async function syncMoxoCalendar(id:string):Promise<string>{
 const db=getSupabaseAdmin();
 const found=await db.from('moxo_requests').select('id,status,scheduled_at,duration_minutes,google_calendar_id,calendar_status').eq('id',id).maybeSingle();
 if(found.error||!found.data)return 'unavailable';
 const row=found.data;
 if(row.status!=='approved'||!row.scheduled_at)return 'not_approved';
 if(row.calendar_status==='synced')return 'synced';
 if(!process.env.GOOGLE_SERVICE_ACCOUNT_JSON||(!row.google_calendar_id&&!process.env.GOOGLE_CALENDAR_ID)){
  await db.from('moxo_requests').update({calendar_status:'not_configured'}).eq('id',id).neq('calendar_status','synced');return 'not_configured';
 }
 try{
  // Pin the destination before the external write, including on timeout/retry.
  if(!row.google_calendar_id){
   const saved=await db.from('moxo_requests').update({google_calendar_id:getCalendarId()}).eq('id',id).is('google_calendar_id',null);
   if(saved.error)return 'unavailable';
  }
  const bound=await db.from('moxo_requests').select('google_calendar_id').eq('id',id).single();
  if(bound.error||!bound.data?.google_calendar_id)return 'unavailable';
  const eventId=await writeMoxoEvent(getCalendarClient(),bound.data.google_calendar_id,row);
  const saved=await db.from('moxo_requests').update({calendar_status:'synced',google_event_id:eventId,calendar_synced_at:new Date().toISOString()}).eq('id',id).eq('status','approved');
  if(!saved.error)await sendAppointmentMessage('moxo_requests',id).catch(()=>null);
  return saved.error?'unavailable':'synced';
 }catch{
  await db.from('moxo_requests').update({calendar_status:'failed'}).eq('id',id).neq('calendar_status','synced');
  return 'failed';
 }
}
