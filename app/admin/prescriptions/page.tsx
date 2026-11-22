import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { FUND_HE } from '@/lib/booking/payments';
import PrescriptionReview from '@/components/admin/PrescriptionReview';

export const dynamic = 'force-dynamic';
const STATUS: Record<string, string> = { pending: 'ממתין להחלטת הרופא', issued: 'המרשם הופק', rejected: 'נדחה' };
const RECOGNITION: Record<string, { label: string; tone: string }> = {
  diagnosed: { label: 'מוכר למערכת: אבחון במכון מתועד בתיק', tone: 'bg-emerald-50 text-emerald-900' },
  file_only: { label: 'קיים תיק במכון, אך לא מתועד בו אבחון. צורף סיכום', tone: 'bg-amber-50 text-amber-900' },
  unknown: { label: 'לא מוכר למערכת. צורף סיכום אבחון קודם', tone: 'bg-amber-50 text-amber-900' },
};
const LANG: Record<string, string> = { he: 'עברית', ar: 'ערבית', en: 'אנגלית' };

export default async function Page() {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/admin/login');
  if (staff.role !== 'admin') return <section className="card"><h1 className="text-2xl font-bold text-teal-800">חידוש מרשמים</h1><p className="mt-2">הדף זמין למנהל בלבד.</p></section>;
  const r = await getSupabaseAdmin().from('prescription_renewal_requests')
    .select('id,months,amount_ils,payment_method,patient_name,patient_id,birth_date,contact_name,phone,fund,medication,note,language,summary_paths,recognition,matched_session_id,status,review_note,created_at,reviewed_at')
    .neq('status', 'uploading').order('created_at', { ascending: false }).limit(300);
  const rows = (r.data ?? []).sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'));
  const waiting = rows.filter(x => x.status === 'pending').length;
  const fmt = (d: string | null) => d ? new Date(d).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' }) : '';
  const day = (d: string) => d.split('-').reverse().join('.');
  return <div className="space-y-5">
    <h1 className="text-3xl font-bold text-teal-800">חידוש מרשמים</h1>
    <p className="text-slate-700">משפחות של מטופלים שכבר אובחנו מגישות בקשה לחידוש מרשם בטופס <a className="underline" href="/prescription?lang=he" target="_blank" rel="noopener noreferrer">app.magickidsinstitute.com/prescription</a>, משלמות 354 ₪ לחודש או 590 ₪ לשלושה חודשים (300 ₪ ו־500 ₪ בתוספת מע״מ) ומצרפות אסמכתה. מטופל שאין לו אבחון מתועד במערכת חייב לצרף סיכום אבחון קודם. אחרי שבדקתם שהתשלום התקבל והפקתם את המרשם, לחצו &quot;המרשם הופק&quot;. המשפחה תקבל הודעת וואטסאפ ממספר המכון.</p>
    {r.error && <p role="alert" className="card text-red-700">לא ניתן לטעון את הבקשות כרגע.</p>}
    {!r.error && <p className="font-semibold">{waiting ? `${waiting} בקשות ממתינות להחלטה` : 'אין בקשות ממתינות.'}</p>}
    <div className="space-y-3">{rows.map(x => { const known = RECOGNITION[x.recognition]; return <article key={x.id} className={`card space-y-2 ${x.status === 'pending' ? 'border-amber-400' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{x.patient_name} · מרשם ל{x.months === 1 ? 'חודש אחד' : 'שלושה חודשים'}</h2>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${x.status === 'pending' ? 'bg-amber-100 text-amber-900' : x.status === 'rejected' ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>{STATUS[x.status] ?? x.status}</span>
      </div>
      <p className={`inline-block rounded-md px-3 py-1 text-sm font-semibold ${known?.tone ?? ''}`}>{known?.label ?? x.recognition}{x.matched_session_id && <> · <Link className="underline" href={`/admin/sessions/${x.matched_session_id}`}>פתיחת התיק</Link></>}</p>
      <p className="text-sm">תרופה ומינון: <b>{x.medication}</b></p>
      {x.note && <p className="whitespace-pre-wrap text-sm">הערת המשפחה: {x.note}</p>}
      <p className="text-sm">ת״ז: <span dir="ltr">{x.patient_id}</span> · תאריך לידה: <span dir="ltr">{day(x.birth_date)}</span> · קופה: <b>{FUND_HE[x.fund as keyof typeof FUND_HE] ?? x.fund}</b></p>
      <p className="text-sm">איש קשר: {x.contact_name} · טלפון: <span dir="ltr">{x.phone}</span> · שפת ההודעה: {LANG[x.language] ?? x.language}</p>
      <p className="text-sm">סכום כולל מע״מ: <b>{x.amount_ils} ₪</b> · אמצעי: <b>{x.payment_method === 'bit' ? 'ביט' : 'העברה בנקאית'}</b> · התקבל: {fmt(x.created_at)}{x.reviewed_at ? ` · הוחלט: ${fmt(x.reviewed_at)}` : ''}</p>
      {x.review_note && <p className="text-sm text-slate-600">הערה שנשלחה למשפחה: {x.review_note}</p>}
      <PrescriptionReview id={x.id} status={x.status} summaries={(x.summary_paths ?? []).length} />
    </article>; })}</div>
  </div>;
}
