import Link from 'next/link';
import {requireStaff} from '@/lib/admin/auth';
import {getSupabaseAdmin} from '@/lib/supabase';
import Manager from '@/components/recruitment/Manager';
import {statuses} from '@/lib/recruitment/schema';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:{status?:string;q?:string}}){
 await requireStaff();let q=getSupabaseAdmin().from('recruitment_candidates').select('id,name,email,phone,treatments,experience,notes,status,therapist_id,created_at').order('created_at',{ascending:false}).limit(200);
 if(searchParams.status&&searchParams.status in statuses)q=q.eq('status',searchParams.status);
 if(searchParams.q?.trim())q=q.ilike('name',`%${searchParams.q.trim().slice(0,100).replace(/[%_]/g,'')}%`);
 const r=await q;
 return <section className="space-y-5"><h1 className="text-3xl font-bold text-teal-800">גיוס מטפלים ומועמדים</h1><div className="flex flex-wrap gap-4"><Link href="/admin/therapists" className="underline">ניהול מטפלים ושעות עבודה</Link><a href="/recruitment" target="_blank" rel="noopener noreferrer" className="underline">טופס הגשת מועמדות לציבור ↗</a></div><p>פניות חדשות נשמרות כאן. לאחר קבלה אפשר ליצור כרטיס מטפל, להגדיר שעות ולהפעיל קבלת פניות. הודעות ישנות שנשלחו במייל או בוואטסאפ אינן מיובאות אוטומטית.</p><form className="flex flex-wrap gap-3"><input className="input" name="q" aria-label="חיפוש לפי שם" placeholder="חיפוש לפי שם" defaultValue={searchParams.q}/><select className="input" name="status" aria-label="מצב גיוס" defaultValue={searchParams.status??''}><option value="">כל המצבים</option>{Object.entries(statuses).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><button className="btn-secondary">חיפוש</button></form>{r.error?<p role="alert">לא ניתן לטעון מועמדים. נסו שוב.</p>:<Manager candidates={(r.data??[]) as any}/>} {r.data?.length===200&&<p>מוצגות 200 פניות. השתמשו בחיפוש ובסינון.</p>}</section>;
}
