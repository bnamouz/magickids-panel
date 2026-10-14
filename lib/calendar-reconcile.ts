import {getSupabaseAdmin} from '@/lib/supabase';
import {getCalendarClient} from '@/lib/google-calendar';
import {syncAppointment} from '@/lib/calendar-consistency';
import {syncTreatment} from '@/lib/therapists/calendar';
import {syncMoxoCalendar} from '@/lib/moxo/calendar';
import {randomUUID} from 'node:crypto';

export async function reconcileCalendars(){
 const db=getSupabaseAdmin(),now=new Date().toISOString(),lease=randomUUID();
 const claim=await db.from('calendar_sync_health').update({lease_id:lease,lease_until:new Date(Date.now()+300000).toISOString()}).eq('id',true).or(`lease_until.is.null,lease_until.lt.${now}`).select('id').maybeSingle();
 if(claim.error)throw new Error('unavailable');
 if(!claim.data)return {busy:true};
 const deadline=Date.now()+200000;
 const report={error:false,synced:0,failed:0,checked:0,mismatches:0,truncated:false,issues:[] as string[],differences:[] as {source:string;id:string;expectedStart:string;expectedEnd:string;actualStart:string|null;actualEnd:string|null;reason:string}[]};
 try{
  const stale=await db.from('appointments').update({calendar_sync:'failed'}).eq('calendar_sync','syncing').lt('calendar_sync_started_at',new Date(Date.now()-600000).toISOString());
  if(stale.error)throw stale.error;
  const oldTreatment=await db.from('treatment_requests').update({calendar_sync:'failed'}).eq('calendar_sync','syncing').lt('calendar_sync_started_at',new Date(Date.now()-600000).toISOString());
  if(oldTreatment.error)throw oldTreatment.error;
  // Recover legacy scheduled rows that were never enqueued. No notifications here.
  const queued=await db.from('treatment_requests').update({calendar_sync:'pending'}).eq('status','scheduled').eq('calendar_sync','none').gt('scheduled_at',now);
  if(queued.error)throw queued.error;
  const [a,t,m]=await Promise.all([
   db.from('appointments').select('id').in('status',['scheduled','confirmed']).in('calendar_sync',['pending','failed']).gt('scheduled_at',now).order('scheduled_at').limit(10),
   db.from('treatment_requests').select('id').in('calendar_sync',['pending','failed']).in('status',['scheduled','closed']).order('updated_at').limit(10),
   db.from('moxo_requests').select('id').eq('status','approved').neq('calendar_status','synced').gt('scheduled_at',now).order('scheduled_at').limit(10),
  ]);
  if(a.error||t.error||m.error)throw new Error('unavailable');
  for(const [rows,sync] of [[a.data,syncAppointment],[t.data,syncTreatment],[m.data,syncMoxoCalendar]] as const){
   for(const row of rows??[]){if(Date.now()>deadline){report.truncated=true;break;}const result=await sync(row.id);if(result==='synced')report.synced++;else if(result!=='unchanged')report.failed++;}
  }
  const reservations=await db.from('v_calendar_reservations').select('*').gt('ends_at',now).order('starts_at').limit(51);
  if(reservations.error)throw reservations.error;
  report.truncated=report.truncated||(reservations.data?.length??0)>50;
  const seen=new Set<string>();const calendar=getCalendarClient();
  for(const row of (reservations.data??[]).slice(0,50)){
   if(Date.now()>deadline){report.truncated=true;break;}
   if(!['confirmed','approved','scheduled'].includes(row.status))continue;
   if(!row.calendar_id||!row.event_id){report.mismatches++;report.issues.push(row.source+':'+row.id);continue;}
   const key=row.calendar_id+':'+row.event_id;if(seen.has(key))continue;seen.add(key);
   try{
    const event=(await calendar.events.get({calendarId:row.calendar_id,eventId:row.event_id},{timeout:5000,retry:false})).data;
    report.checked++;
    if(event.status==='cancelled'||Date.parse(event.start?.dateTime??'')!==Date.parse(row.starts_at)||Date.parse(event.end?.dateTime??'')!==Date.parse(row.ends_at)){report.mismatches++;report.issues.push(key);report.differences.push({source:row.source,id:row.id,expectedStart:row.starts_at,expectedEnd:row.ends_at,actualStart:event.start?.dateTime??null,actualEnd:event.end?.dateTime??null,reason:event.status==='cancelled'?'cancelled':'time_mismatch'});}
   }catch{report.mismatches++;report.issues.push(key);report.differences.push({source:row.source,id:row.id,expectedStart:row.starts_at,expectedEnd:row.ends_at,actualStart:null,actualEnd:null,reason:'unavailable'});}
  }
  return report;
 }catch(error){report.error=true;throw error;}finally{
  await db.from('calendar_sync_health').update({last_run:new Date().toISOString(),details:report,lease_id:null,lease_until:null}).eq('id',true).eq('lease_id',lease);
 }
}
