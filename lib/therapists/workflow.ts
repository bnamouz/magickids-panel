import { getSupabaseAdmin } from '@/lib/supabase';
import { emailOnce } from './mail';
import { matchingTherapists, portalLink } from './server';
import { syncTreatment } from './calendar';
import { notifyOnce } from '@/lib/moxo/notification';
import type { Therapist } from './schema';
export async function notifyAssignment(id:string,t:Therapist){
 if(!t.active||Date.parse(t.token_expires_at)<=Date.now())return 'expired';
 return emailOnce(`treatment-assigned:${id}:${t.id}:${t.token_version}`,t.email,'פנייה לטיפול ממתינה לתיאום — ילדי הקסם',`שלום ${t.name},\nפנייה הוקצתה לך במכון ילדי הקסם. בקישור האישי ניתן לצפות בפרטי הקשר, לעדכן שעות עבודה ולבחור מועד לאחר תיאום עם ההורים.\n${portalLink(t)}\nהקישור אישי, אין להעבירו לאחרים.`);
}
export async function autoAssign(id:string){
 const db=getSupabaseAdmin(),r=await db.from('treatment_requests').select('id,treatment,therapist_id,status').eq('id',id).maybeSingle();
 if(r.error||!r.data||!['pending','contacted'].includes(r.data.status))return 'unchanged';
 if(r.data.therapist_id)return 'assigned';
 const matches=await matchingTherapists(r.data.treatment);if(matches.length!==1)return 'needs_staff';
 const t=matches[0].profile;
 const saved=await db.from('treatment_requests').update({therapist_id:t.id,therapist:t.name,updated_at:new Date().toISOString()}).eq('id',id).is('therapist_id',null).in('status',['pending','contacted']).select('id').maybeSingle();
 if(saved.error||!saved.data)return 'unchanged';
 return notifyAssignment(id,t);
}
export async function scheduleTreatment(id:string,therapistId:string,start:string,staffId:string|null){
 const db=getSupabaseAdmin();
 const r=await db.rpc('schedule_assigned_treatment',{p_id:id,p_therapist:therapistId,p_start:start,p_staff:staffId});
 if(r.error)throw new Error('unavailable');if(r.data!=='scheduled')throw new Error(r.data);
 return {saved:true,calendar:await syncTreatment(id)};
}
export async function closeTreatment(id:string,therapistId?:string){
 let q=getSupabaseAdmin().from('treatment_requests').update({status:'closed',calendar_sync:'pending',updated_at:new Date().toISOString()}).eq('id',id).neq('calendar_sync','syncing');
 if(therapistId)q=q.eq('therapist_id',therapistId);
 const r=await q.select('id').maybeSingle();if(r.error||!r.data)throw new Error('syncing');
 return {saved:true,calendar:await syncTreatment(id)};
}
export async function runTreatmentWorker(){
 const db=getSupabaseAdmin();const pending=await db.from('treatment_requests').select('id,therapist_id').in('status',['pending','contacted']).order('updated_at').limit(5);if(pending.error)throw new Error('unavailable');
 for(const r of pending.data??[]){if(!r.therapist_id){await autoAssign(r.id).catch(()=>null);}else{const t=await db.from('therapists').select('*').eq('id',r.therapist_id).maybeSingle();if(t.data)await notifyAssignment(r.id,t.data);}await db.from('treatment_requests').update({updated_at:new Date().toISOString()}).eq('id',r.id);}
 await db.from('treatment_requests').update({calendar_sync:'failed'}).eq('calendar_sync','syncing').lt('calendar_sync_started_at',new Date(Date.now()-10*60000).toISOString());
 const sync=await db.from('treatment_requests').select('id').in('calendar_sync',['pending','failed']).limit(5);for(const r of sync.data??[])await syncTreatment(r.id);
 const now=Date.now(),due=await db.from('treatment_requests').select('*').eq('status','scheduled').not('therapist_id','is',null).gt('scheduled_at',new Date(now+60*60000).toISOString()).lte('scheduled_at',new Date(now+120*60000).toISOString()).limit(200);
 let accepted=0;
 for(const r of due.data??[]){
  const current=await db.from('treatment_requests').select('status,scheduled_at,therapist_id').eq('id',r.id).single();if(current.data?.status!=='scheduled'||current.data.scheduled_at!==r.scheduled_at||current.data.therapist_id!==r.therapist_id)continue;
  const when=new Intl.DateTimeFormat('he-IL',{timeZone:'Asia/Jerusalem',dateStyle:'short',timeStyle:'short'}).format(new Date(r.scheduled_at));
  if(r.reminder_consent){const message=r.language==='ar'?`تذكير بموعدكم في معهد أطفال السحر بتاريخ ${when} (توقيت إسرائيل). للتغيير اتصلوا بالمعهد.`:r.language==='en'?`Reminder: your Magic Kids Institute appointment is on ${when} (Israel time). Contact the institute for changes.`:`תזכורת: נקבע לכם טיפול במכון ילדי הקסם בתאריך ${when} (שעון ישראל). לשינויים פנו למכון.`;if(await notifyOnce(`treatment-parent:${r.id}:${r.scheduled_at}`,r.phone,message)==='accepted')accepted++;}
  const t=await db.from('therapists').select('*').eq('id',r.therapist_id).maybeSingle();if(t.data){if(await emailOnce(`treatment-reminder:${r.id}:${r.scheduled_at}:${r.therapist_id}`,t.data.email,'תזכורת לטיפול במכון ילדי הקסם',`תזכורת לטיפול בתאריך ${when} (שעון ישראל). פרטי הטיפול בקישור האישי שלך: ${portalLink(t.data)}`)==='accepted')accepted++;}
 }
 await db.from('treatment_worker_state').upsert({id:true,last_run:new Date().toISOString()});return {processed:pending.data?.length??0,accepted};
}
