import {sendAppointmentMessage} from '@/lib/appointment-messages/server';
import {getCalendarClient,getCalendarId} from '@/lib/google-calendar';
import {getPediatricsCalendarId} from '@/lib/pediatrics-calendar';
import {getSupabaseAdmin} from '@/lib/supabase';
import type {calendar_v3} from 'googleapis';

export class CalendarConflict extends Error { constructor(){super('slot_taken');} }
function code(error:any){return Number(error?.code??error?.response?.status);}
export async function assertCalendarFree(calendar:calendar_v3.Calendar,calendarIds:string[],start:string,end:string,ownId?:string){
 for(const calendarId of [...new Set(calendarIds)]){
  let pageToken:string|undefined;
  do{
   const result=await calendar.events.list({calendarId,timeMin:start,timeMax:end,singleEvents:true,maxResults:250,pageToken},{timeout:10000,retry:false});
   if((result.data.items??[]).some(e=>e.id!==ownId&&e.status!=='cancelled'&&e.transparency!=='transparent'))throw new CalendarConflict();
   pageToken=result.data.nextPageToken??undefined;
  }while(pageToken);
 }
}
// Reconcile a timed-out write before retrying; never create a second event ID.
export async function ensureCalendarEvent(calendar:calendar_v3.Calendar,calendarId:string,eventId:string,body:calendar_v3.Schema$Event,checkIds=[calendarId],allowMove=false){
 let existing:calendar_v3.Schema$Event|undefined;
 try{existing=(await calendar.events.get({calendarId,eventId},{timeout:10000,retry:false})).data;}
 catch(error){if(![404,410].includes(code(error)))throw error;}
 if(existing){
  if(existing.status==='cancelled')throw new CalendarConflict();
  const moved=Date.parse(existing.start?.dateTime??'')!==Date.parse(body.start?.dateTime??'')||Date.parse(existing.end?.dateTime??'')!==Date.parse(body.end?.dateTime??'');
  if(moved){
   const owner=body.extendedProperties?.private?.treatmentRequest;
   if(!allowMove||!owner||existing.extendedProperties?.private?.treatmentRequest!==owner)throw new CalendarConflict();
   await assertCalendarFree(calendar,checkIds,body.start!.dateTime!,body.end!.dateTime!,eventId);
   return (await calendar.events.patch({calendarId,eventId,sendUpdates:'none',requestBody:body},{timeout:10000,retry:false})).data;
  }
  return existing;
 }
 await assertCalendarFree(calendar,checkIds,body.start!.dateTime!,body.end!.dateTime!,eventId);
 try{return (await calendar.events.insert({calendarId,sendUpdates:'none',requestBody:{...body,id:eventId}},{timeout:10000,retry:false})).data;}
 catch(error){
  const found=(await calendar.events.get({calendarId,eventId},{timeout:10000,retry:false})).data;
  if(found.status==='cancelled'||Date.parse(found.start?.dateTime??'')!==Date.parse(body.start!.dateTime!)||Date.parse(found.end?.dateTime??'')!==Date.parse(body.end!.dateTime!))throw new CalendarConflict();
  return found;
 }
}
export async function syncAppointment(id:string){
 const db=getSupabaseAdmin();
 const found=await db.from('appointments').update({calendar_sync:'syncing',calendar_sync_started_at:new Date().toISOString()}).eq('id',id).in('status',['scheduled','confirmed']).in('calendar_sync',['pending','failed','conflict']).select('*').maybeSingle();
 if(found.error||!found.data)return 'failed';
 const r=found.data;
 if(!['scheduled','confirmed'].includes(r.status))return 'inactive';
 try{
  const calendarId=r.gcal_calendar_id||getCalendarId(),eventId=r.gcal_event_id||'appt'+id.replaceAll('-','');
  const bound=await db.from('appointments').update({gcal_calendar_id:calendarId,gcal_event_id:eventId,calendar_sync:'syncing'}).eq('id',id).in('status',['scheduled','confirmed']);
  if(bound.error)throw bound.error;
  const start=new Date(r.scheduled_at).toISOString(),end=new Date(Date.parse(start)+r.duration_minutes*60000).toISOString();
  const ids=r.appointment_type==='moxo'?[calendarId]:[calendarId,getPediatricsCalendarId()];
  await ensureCalendarEvent(getCalendarClient(),calendarId,eventId,{summary:'פגישה במכון ילדי הקסם',visibility:'private',
   description:'פרטי הפגישה בתיק המאובטח במערכת המכון.',start:{dateTime:start,timeZone:'Asia/Jerusalem'},end:{dateTime:end,timeZone:'Asia/Jerusalem'},
   extendedProperties:{private:{appointmentId:id}}},ids);
  const saved=await db.from('appointments').update({calendar_sync:'synced',calendar_checked_at:new Date().toISOString()}).eq('id',id).eq('scheduled_at',r.scheduled_at).in('status',['scheduled','confirmed']);
  if(!saved.error)await sendAppointmentMessage('appointments',id).catch(()=>null);
  return saved.error?'failed':'synced';
 }catch(error){
  const state=error instanceof CalendarConflict||String((error as any)?.message).includes('slot_taken')?'conflict':'failed';
  await db.from('appointments').update({calendar_sync:state,calendar_checked_at:new Date().toISOString()}).eq('id',id);
  return state;
 }
}
