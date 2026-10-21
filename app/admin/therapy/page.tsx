import Link from 'next/link';
import {requireStaff} from '@/lib/admin/auth';
import {getSupabaseAdmin} from '@/lib/supabase';
import {treatmentLabels} from '@/lib/therapists/parent-booking';
export const dynamic='force-dynamic';
export default async function Page(){
 await requireStaff();const db=getSupabaseAdmin();
 const p=await db.from('therapist_booking_profiles').select('slug,therapist_id,enabled,calendar_id');
 const ids=(p.data??[]).map(x=>x.therapist_id);
 const t=ids.length?await db.from('therapists').select('id,name,email,treatments,active,archived_at').in('id',ids):{data:[]};
 const pending=await db.from('therapist_booking_requests').select('therapist_id,status,expires_at').eq('status','pending').gt('expires_at',new Date().toISOString());
 const rows=(p.data??[]).map(x=>({...x,t:(t.data??[]).find(y=>y.id===x.therapist_id),pending:(pending.data??[]).filter(r=>r.therapist_id===x.therapist_id).length})).filter(x=>x.t&&!x.t.archived_at).sort((a,b)=>a.t!.name.localeCompare(b.t!.name,'he'));
 return <div className="space-y-5">
  <h1 className="text-3xl font-bold text-teal-800">יומני בקשות למטפלים</h1>
  <p className="text-slate-700">לכל מטפל/ת כאן יש עמוד הזמנה להורים, פורטל אישי ויומן Google נפרד. הפעלת יומן למטפל/ת נוסף/ת נעשית ממסך <Link className="underline" href="/admin/therapists">מטפלים ושעות עבודה</Link>.</p>
  {!rows.length&&<p className="card">עדיין לא הופעל יומן בקשות לאף מטפל/ת.</p>}
  <ul className="grid gap-3 md:grid-cols-2">{rows.map(x=><li key={x.slug} className="card space-y-1">
   <h2 className="text-xl font-bold">{x.t!.name} <span className="text-sm font-normal text-slate-500">· {treatmentLabels(x.t!.treatments).he}</span></h2>
   <p className="text-sm">{x.enabled&&x.t!.active?<span className="text-green-700">פעיל</span>:<span className="text-red-700">לא פעיל</span>} · בקשות ממתינות: <b>{x.pending}</b></p>
   <p className="text-sm flex flex-wrap gap-3"><Link className="underline font-semibold" href={`/admin/therapy/${x.slug}`}>ניהול הבקשות</Link><a className="underline" href={`/therapy/${x.slug}`} target="_blank" rel="noreferrer">עמוד ההורים</a></p>
   <p className="text-xs text-slate-500" dir="ltr">app.magickidsinstitute.com/therapy/{x.slug}</p>
  </li>)}</ul>
 </div>;
}
