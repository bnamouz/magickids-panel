import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentStaff, isAdmin } from '@/lib/admin/auth';
import { Usage, Leads } from '@/components/admin/LeadsBoard';

export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: { tab?: string; q?: string; source?: string; days?: string; stage?: string; view?: string; range?: string } }) {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/admin/login');
  if (!isAdmin(staff)) return <section className="card"><h1 className="text-2xl font-bold text-teal-800">לידים ושימוש באתר</h1><p className="mt-2">הדף זמין למנהל המערכת בלבד.</p></section>;
  const tab = searchParams.tab === 'usage' ? 'usage' : 'leads';
  const range = [7, 30, 90].includes(Number(searchParams.range)) ? Number(searchParams.range) : 30;
  const days = [7, 30, 90, 365].includes(Number(searchParams.days)) ? Number(searchParams.days) : 0;
  const grouped = searchParams.view !== 'all';
  const Tab = ({ id, label }: { id: string; label: string }) => <Link href={`/admin/leads?tab=${id}`} className={`px-4 py-2 rounded-full text-sm font-semibold ${tab === id ? 'bg-teal-700 text-white' : 'bg-white border text-teal-800'}`}>{label}</Link>;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-teal-800">לידים ושימוש באתר</h1><p className="text-sm text-slate-600">כל מי שהשאיר פרטים בכל הערוצים, ומדידת הביקורים באתר ובעמודים הציבוריים של המערכת.</p></div>
      <div className="flex gap-2"><Tab id="leads" label="מאגר לידים" /><Tab id="usage" label="שימוש באתר" /></div></div>

    {tab === 'usage' ? await Usage(range) : await Leads({ q: searchParams.q?.trim() || undefined, source: searchParams.source || undefined, days: days || undefined, stage: searchParams.stage || undefined }, grouped)}
  </div>;
}

