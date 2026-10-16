import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentStaff, isAdmin } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import ClinicPatients from '@/components/admin/ClinicPatients';
import type { ClinicPatient } from '@/lib/clinic-patients/schema';

export const dynamic = 'force-dynamic';
const PAGE = 100;
const COLS = 'id,national_id,first_name,last_name,phone1,phone2,birth_date,last_visit,next_visit,notes,needs_review,source,updated_at';
const SORTS: Record<string, [string, boolean]> = { last_visit: ['last_visit', false], next_visit: ['next_visit', true], name: ['last_name', true] };

export default async function Page({ searchParams }: { searchParams: { q?: string; f?: string; p?: string; s?: string } }) {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/admin/login');
  if (!isAdmin(staff)) return <section className="card"><h1 className="text-2xl font-bold text-teal-800">מטופלי המרפאה</h1><p className="mt-2">הדף זמין למנהל המערכת בלבד.</p></section>;

  const db = getSupabaseAdmin();
  const page = Math.max(0, Number(searchParams.p) || 0);
  const f = searchParams.f ?? '';
  const [sortCol, asc] = SORTS[searchParams.s ?? ''] ?? SORTS.last_visit;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  let q = db.from('clinic_patients').select(COLS, { count: 'exact' });
  q = f === 'archived' ? q.not('archived_at', 'is', null) : q.is('archived_at', null);
  if (f === 'upcoming') q = q.gte('next_visit', today);
  if (f === 'review') q = q.eq('needs_review', true);
  const words = (searchParams.q ?? '').replace(/[^\p{L}\p{N}' \-]/gu, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 4);
  for (const w of words) {
    const digits = w.replace(/\D/g, '');
    q = /^\d+$/.test(w)
      ? q.or(`national_id.ilike.%${digits}%,phone1.ilike.%${digits}%,phone2.ilike.%${digits}%`)
      : q.or(`first_name.ilike.%${w}%,last_name.ilike.%${w}%`);
  }
  const r = await q.order(f === 'upcoming' ? 'next_visit' : sortCol, { ascending: f === 'upcoming' ? true : asc, nullsFirst: false }).order('last_name').range(page * PAGE, page * PAGE + PAGE - 1);

  // Siblings: other active patients sharing a phone number.
  const rows = (r.data ?? []) as ClinicPatient[];
  const phones = Array.from(new Set(rows.flatMap(p => [p.phone1, p.phone2]).filter(Boolean))) as string[];
  const siblings: Record<string, number> = {};
  if (phones.length) {
    const list = phones.join(',');
    const s = await db.from('clinic_patients').select('id,phone1,phone2').is('archived_at', null).or(`phone1.in.(${list}),phone2.in.(${list})`).limit(5000);
    for (const p of rows) {
      const mine = new Set([p.phone1, p.phone2].filter(Boolean));
      siblings[p.id] = (s.data ?? []).filter(o => o.id !== p.id && (mine.has(o.phone1) || mine.has(o.phone2))).length;
    }
  }
  const [total, review, upcoming] = await Promise.all([
    db.from('clinic_patients').select('id', { count: 'exact', head: true }).is('archived_at', null),
    db.from('clinic_patients').select('id', { count: 'exact', head: true }).is('archived_at', null).eq('needs_review', true),
    db.from('clinic_patients').select('id', { count: 'exact', head: true }).is('archived_at', null).gte('next_visit', today),
  ]);
  const link = (o: Record<string, string | number | undefined>) => {
    const sp = new URLSearchParams();
    const m = { q: searchParams.q, f, s: searchParams.s, p: undefined as any, ...o };
    for (const [k, v] of Object.entries(m)) if (v !== undefined && v !== '' && v !== 0) sp.set(k, String(v));
    return `/admin/clinic-patients${sp.size ? '?' + sp : ''}`;
  };
  const count = r.count ?? 0;
  const tab = (key: string, label: string, n?: number | null) => <Link href={link({ f: key })} aria-current={f === key ? 'page' : undefined} className={`rounded-lg border px-3 py-2 text-sm ${f === key ? 'border-teal-700 bg-teal-700 font-bold text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-teal-50'}`}>{label}{n != null ? ` (${n})` : ''}</Link>;

  return <section className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-3xl font-bold text-teal-800">מטופלי המרפאה</h1><p className="text-slate-600">מאגר מטופלי מרפאת הילדים של ד״ר בסים נמוז. נפרד מתיקי הקשב. גלוי למנהל בלבד.</p></div>
      <a href="/api/admin/clinic-patients" className="btn-ghost">ייצוא לאקסל (CSV)</a>
    </div>
    <div className="flex flex-wrap gap-2">{tab('', 'כל המטופלים', total.count)}{tab('upcoming', 'ביקור קרוב', upcoming.count)}{tab('review', 'לבדיקה', review.count)}{tab('archived', 'מוסתרים')}</div>
    <form className="flex flex-wrap gap-3" action="/admin/clinic-patients">
      {f && <input type="hidden" name="f" value={f} />}
      <input className=" rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-200 min-w-[16rem] flex-1" name="q" aria-label="חיפוש" placeholder="חיפוש לפי שם, ת.ז או טלפון" defaultValue={searchParams.q} />
      <select className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-200" name="s" aria-label="מיון" defaultValue={searchParams.s ?? ''}><option value="">מיון: ביקור אחרון</option><option value="next_visit">מיון: ביקור קרוב</option><option value="name">מיון: שם משפחה</option></select>
      <button className="btn-primary">חיפוש</button>
      {searchParams.q && <Link href={link({ q: undefined })} className="self-center underline">ניקוי</Link>}
    </form>
    {r.error ? <p role="alert" className="card">לא ניתן לטעון את המטופלים. נסו שוב.</p>
      : <ClinicPatients patients={rows} siblings={siblings} archived={f === 'archived'} />}
    <div className="flex items-center justify-between text-sm text-slate-600">
      <span>{count ? `מוצגים ${page * PAGE + 1}–${Math.min(count, page * PAGE + rows.length)} מתוך ${count}` : 'אין תוצאות'}</span>
      <span className="flex gap-3">{page > 0 && <Link className="underline" href={link({ p: page - 1 })}>הקודם</Link>}{(page + 1) * PAGE < count && <Link className="underline" href={link({ p: page + 1 })}>הבא</Link>}</span>
    </div>
  </section>;
}
