import { redirect } from 'next/navigation';
import { getCurrentStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { FUND_HE } from '@/lib/booking/payments';
import PaymentReview from '@/components/admin/PaymentReview';

export const dynamic = 'force-dynamic';
const STATUS: Record<string, string> = { pending: 'ממתין לאימות', approved: 'אושר — נשלח קישור לקביעת תור', booked: 'אושר ונקבע תור', rejected: 'נדחה' };

export default async function Page() {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/admin/login');
  if (!['admin', 'assistant'].includes(staff.role)) return <section className="card"><h1 className="text-2xl font-bold text-teal-800">אימות תשלומים לקשב</h1><p className="mt-2">הדף זמין למנהל ולמזכירות בלבד.</p></section>;
  const r = await getSupabaseAdmin().from('adhd_payment_requests').select('id,visit_type,fund,moxo,amount_ils,payment_method,child_name,child_id,parent_name,phone,status,review_note,created_at,reviewed_at,booked_at').neq('status', 'uploading').order('created_at', { ascending: false }).limit(300);
  const rows = (r.data ?? []).sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'));
  const fmt = (d: string | null) => d ? new Date(d).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' }) : '';
  return <div className="space-y-5">
    <h1 className="text-3xl font-bold text-teal-800">אימות תשלומים — אבחון ומעקב קשב</h1>
    <p className="text-slate-700">מטופלי כללית, מאוחדת, לאומית ופרטי משלמים מראש ומעלים אסמכתה באתר. אחרי שבדקתם שהכסף התקבל בחשבון 731-465946 או בביט 050-995-5137, לחצו "אישור תשלום". ההורה יקבל בוואטסאפ ממספר המכון קישור אישי לבחירת מועד. מטופלי מכבי קובעים תור ישירות ומשלמים בהעברת כרטיס בביקור.</p>
    {r.error && <p className="card text-red-700">לא ניתן לטעון את הבקשות כרגע.</p>}
    {!rows.length && !r.error && <p className="card">אין עדיין בקשות תשלום.</p>}
    <div className="space-y-3">{rows.map(x => <div key={x.id} className={`card space-y-2 ${x.status === 'pending' ? 'border-amber-400' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{x.child_name} · {x.visit_type === 'assessment' ? 'אבחון קשב וריכוז' : 'מעקב קשב וריכוז'}{x.moxo ? ' + MOXO' : ''}</h2>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${x.status === 'pending' ? 'bg-amber-100 text-amber-900' : x.status === 'rejected' ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>{STATUS[x.status] ?? x.status}</span>
      </div>
      <p className="text-sm">קופה: <b>{FUND_HE[x.fund as keyof typeof FUND_HE]}</b> · סכום: <b>{x.amount_ils ? `${x.amount_ils.toLocaleString('en-US')} ₪` : 'מעקב — לפי המזכירות'}</b> · אמצעי: <b>{x.payment_method === 'bit' ? 'ביט' : 'העברה בנקאית'}</b></p>
      <p className="text-sm">ת״ז: <span dir="ltr">{x.child_id}</span> · הורה: {x.parent_name} · טלפון: <span dir="ltr">{x.phone}</span> · התקבל: {fmt(x.created_at)}{x.reviewed_at ? ` · נבדק: ${fmt(x.reviewed_at)}` : ''}{x.booked_at ? ` · תור נקבע: ${fmt(x.booked_at)}` : ''}</p>
      {x.review_note && <p className="text-sm text-slate-600">הערה: {x.review_note}</p>}
      <PaymentReview id={x.id} status={x.status} />
    </div>)}</div>
  </div>;
}
