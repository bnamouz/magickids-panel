import {getSupabaseAdmin} from '@/lib/supabase';
export type AgendaRow={key:string;start:string;end:string;name:string;service:string;href:string;state:string;eventKey:string|null};
export function deduplicateAgenda(rows:AgendaRow[]){
 const seen=new Set<string>();
 return rows.filter(row=>{if(!row.eventKey)return true;if(seen.has(row.eventKey))return false;seen.add(row.eventKey);return true;}).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
}
export async function loadCalendarAgenda(){
 const db=getSupabaseAdmin(),now=new Date().toISOString();
 const [a,w,m,t,b,h]=await Promise.all([
  db.from('appointments').select('id,session_id,scheduled_at,duration_minutes,appointment_type,status,gcal_calendar_id,gcal_event_id,calendar_sync,intake_sessions(patients(first_name,last_name))').in('status',['scheduled','confirmed']).gte('scheduled_at',now).order('scheduled_at').limit(201),
  db.from('website_bookings').select('id,clinic,starts_at,ends_at,status,calendar_id,event_id').neq('status','released').gte('starts_at',now).order('starts_at').limit(201),
  db.from('moxo_requests').select('id,patient_name,scheduled_at,duration_minutes,calendar_status,google_calendar_id,google_event_id').eq('status','approved').gte('scheduled_at',now).order('scheduled_at').limit(201),
  db.from('treatment_requests').select('id,patient_name,scheduled_at,duration_minutes,calendar_sync,calendar_id,calendar_event_id').eq('status','scheduled').gte('scheduled_at',now).order('scheduled_at').limit(201),
  db.from('therapist_booking_requests').select('id,patient_name,starts_at,ends_at,status,calendar_id,event_id,expires_at').in('status',['pending','syncing','confirmed','cancelling']).gte('starts_at',now).order('starts_at').limit(201),
  db.from('calendar_sync_health').select('last_run,details').eq('id',true).maybeSingle(),
 ]);
 if([a,w,m,t,b,h].some(r=>r.error))throw new Error('unavailable');
 const event=(cal:string|null,id:string|null)=>cal&&id?`${cal}:${id}`:null;
 const end=(start:string,duration:number)=>new Date(Date.parse(start)+duration*60000).toISOString();
 const rows:AgendaRow[]=[];
 for(const r of a.data??[]){const session:any=Array.isArray(r.intake_sessions)?r.intake_sessions[0]:r.intake_sessions;const p=Array.isArray(session?.patients)?session.patients[0]:session?.patients;rows.push({key:'a'+r.id,start:r.scheduled_at,end:end(r.scheduled_at,r.duration_minutes),name:[p?.first_name,p?.last_name].filter(Boolean).join(' ')||'תיק המכון',service:r.appointment_type==='followup'?'מעקב קשב':r.appointment_type==='moxo'?'MOXO':'אבחון קשב',href:'/admin/sessions/'+r.session_id,state:r.calendar_sync,eventKey:event(r.gcal_calendar_id,r.gcal_event_id)});}
 for(const r of w.data??[])rows.push({key:'w'+r.id,start:r.starts_at,end:r.ends_at,name:'תור שנקבע באתר / במרפאה',service:r.clinic==='pediatrics'?'מרפאת ילדים':'מרפאת קשב',href:r.clinic==='pediatrics'?'/admin/pediatrics-calendar?date='+new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem'}).format(new Date(r.starts_at)):'/admin/appointments',state:r.status==='confirmed'?'synced':'pending',eventKey:event(r.calendar_id,r.event_id)});
 for(const r of m.data??[])rows.push({key:'m'+r.id,start:r.scheduled_at,end:end(r.scheduled_at,r.duration_minutes),name:r.patient_name,service:'MOXO',href:'/admin/moxo',state:r.calendar_status,eventKey:event(r.google_calendar_id,r.google_event_id)});
 for(const r of t.data??[])rows.push({key:'t'+r.id,start:r.scheduled_at,end:end(r.scheduled_at,r.duration_minutes),name:r.patient_name,service:'טיפול במכון',href:'/admin/treatments',state:r.calendar_sync,eventKey:event(r.calendar_id,r.calendar_event_id)});
 for(const r of b.data??[]){if(r.status==='pending'&&Date.parse(r.expires_at)<=Date.now())continue;rows.push({key:'b'+r.id,start:r.starts_at,end:r.ends_at,name:r.patient_name,service:'טיפול — בקשת הורה',href:'/admin/therapists',state:r.status==='confirmed'?'synced':r.status,eventKey:event(r.calendar_id,r.event_id)});}
 const issues=new Set<string>(h.data?.details?.issues??[]);
 const checked=deduplicateAgenda(rows).map(row=>issues.has(row.eventKey??'')?{...row,state:'conflict'}:row);
 return {rows:checked,health:h.data,truncated:[a,w,m,t,b].some(r=>(r.data?.length??0)>200)};
}
