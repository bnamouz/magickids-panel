import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/admin/auth';
import { runSystemHealth, type Check } from '@/lib/admin/system-health';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const STYLE = {
  ok: { dot: 'bg-emerald-500', text: 'text-emerald-800', label: 'תקין' },
  warn: { dot: 'bg-amber-500', text: 'text-amber-800', label: 'דורש בדיקה' },
  fail: { dot: 'bg-red-600', text: 'text-red-800', label: 'לא עובד' },
} as const;

export default async function SystemHealthPage() {
  const staff = await requireStaff();
  if (staff.role !== 'admin') redirect('/admin/dashboard');
  const checks = await runSystemHealth();
  const groups = Array.from(new Set(checks.map((c) => c.group)));
  const bad = checks.filter((c) => c.level !== 'ok').length;
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">בריאות המערכת</h1>
          <p className="mt-1 text-sm text-slate-600">כל החיבורים של הפאנל והמענה הקולי במקום אחד. הבדיקה רצה בכל פתיחה של הדף ואינה שולחת הודעות או משנה נתונים.</p>
        </div>
        <a href="/admin/system-health" className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">בדיקה מחדש</a>
      </header>
      <p role="status" className={`rounded-xl p-4 font-semibold ${bad ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'}`}>
        {bad ? `${bad} מתוך ${checks.length} בדיקות דורשות תשומת לב` : `כל ${checks.length} הבדיקות תקינות`}
      </p>
      {groups.map((g) => (
        <section key={g} className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 font-bold text-slate-800">{g}</h2>
          <ul className="divide-y divide-slate-100">
            {checks.filter((c) => c.group === g).map((c: Check) => (
              <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                <div className="flex items-start gap-3">
                  <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${STYLE[c.level].dot}`} aria-hidden="true" />
                  <div><b className="text-sm text-slate-800">{c.label}</b><p className="text-xs text-slate-600">{c.detail}</p></div>
                </div>
                <span className={`text-xs font-bold ${STYLE[c.level].text}`}>{STYLE[c.level].label}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
