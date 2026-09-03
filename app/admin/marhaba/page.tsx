// app/admin/marhaba/page.tsx
// Marhaba Sales dashboard. Protected by middleware.ts (requires login).

import { getSupabaseAdmin } from '@/lib/supabase';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function loadData(searchParams: { q?: string; status?: string }) {
  const supabase = getSupabaseAdmin();

  let leadsQuery = supabase
    .from('marhaba_leads')
    .select('id, clinic_name, phone, city, status, fit_score, interest_level, call_count, last_call_at, next_action_at')
    .order('fit_score', { ascending: false, nullsFirst: false })
    .order('imported_at', { ascending: false })
    .limit(200);

  if (searchParams.q) {
    const q = `%${searchParams.q}%`;
    leadsQuery = leadsQuery.or(`clinic_name.ilike.${q},phone.ilike.${q},city.ilike.${q}`);
  }
  if (searchParams.status && searchParams.status !== 'all') {
    leadsQuery = leadsQuery.eq('status', searchParams.status);
  }

  const [dashboardRes, leadsRes, demosRes, callsRes] = await Promise.all([
    supabase.from('marhaba_sales_dashboard').select('*').single(),
    leadsQuery,
    supabase
      .from('marhaba_demos')
      .select('id, lead_id, scheduled_at, status, marhaba_leads(clinic_name, phone)')
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(20),
    supabase
      .from('marhaba_calls')
      .select('id, lead_id, started_at, duration_secs, call_successful, marhaba_leads(clinic_name)')
      .order('started_at', { ascending: false })
      .limit(10),
  ]);

  return {
    dashboard: dashboardRes.data,
    leads: leadsRes.data || [],
    demos: demosRes.data || [],
    recentCalls: callsRes.data || [],
    error: leadsRes.error?.message || null,
  };
}

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-slate-100 text-slate-700',
  queued: 'bg-blue-100 text-blue-700',
  calling: 'bg-yellow-100 text-yellow-800',
  demo_booked: 'bg-emerald-100 text-emerald-800',
  demo_completed: 'bg-teal-100 text-teal-800',
  video_sent: 'bg-purple-100 text-purple-800',
  callback_requested: 'bg-orange-100 text-orange-800',
  not_interested: 'bg-red-100 text-red-700',
  closed_won: 'bg-green-600 text-white',
  closed_lost: 'bg-gray-400 text-white',
  escalated: 'bg-pink-100 text-pink-800',
};

const STATUS_OPTIONS = [
  'all', 'new', 'queued', 'calling', 'demo_booked', 'demo_completed',
  'video_sent', 'callback_requested', 'not_interested', 'closed_won',
  'closed_lost', 'escalated',
];

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });
}

function fmtDuration(secs: number | null | undefined) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

export default async function MarhabaAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const { dashboard, leads, demos, recentCalls, error } = await loadData(sp);

  if (error) {
    return (
      <div dir="rtl" className="max-w-4xl mx-auto p-8">
        <h1 className="text-2xl font-bold mb-4">Marhaba Sales</h1>
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg">
          <div className="font-semibold mb-2">שגיאה בטעינת נתונים</div>
          <div className="text-sm">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Marhaba Sales</h1>
          <p className="text-sm text-slate-500 mt-1">
            נור-סיילס מבצעת שיחות אוטומטיות כל 30 דק' א׳-ה׳ 09-18
          </p>
        </div>
        <form action="/api/marhaba/dial-next?force=1" method="POST">
          <button
            className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700"
            type="submit"
          >
            הפעל שיחת מכירה עכשיו
          </button>
        </form>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <StatCard label="Leads חדשים" value={dashboard?.new_leads ?? 0} />
        <StatCard label="בתור" value={dashboard?.in_queue ?? 0} />
        <StatCard label="דמו נקבע" value={dashboard?.demos_booked ?? 0} highlight />
        <StatCard label="לקוחות" value={dashboard?.customers ?? 0} highlight />
        <StatCard label="שיחות השבוע" value={dashboard?.calls_this_week ?? 0} />
        <StatCard label="שיחות החודש" value={dashboard?.calls_this_month ?? 0} />
        <StatCard label="Booking %" value={`${dashboard?.demo_booking_rate_pct ?? 0}%`} />
      </div>

      {/* Recent calls */}
      {recentCalls.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-3">שיחות אחרונות</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recentCalls.map((c: any) => (
              <Link
                key={c.id}
                href={`/admin/marhaba/${c.lead_id}`}
                className="bg-white border rounded-lg px-4 py-3 hover:bg-slate-50 flex justify-between"
              >
                <div>
                  <div className="font-semibold">
                    {c.marhaba_leads?.clinic_name || `Lead #${c.lead_id}`}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {fmtDate(c.started_at)} · {fmtDuration(c.duration_secs)}
                  </div>
                </div>
                {c.call_successful === 'success' && (
                  <span className="text-green-600 text-sm">✓</span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming demos */}
      <section>
        <h2 className="text-xl font-semibold mb-3">דמו קרובים</h2>
        {demos.length === 0 ? (
          <p className="text-slate-500 text-sm">אין דמו מתוכננים.</p>
        ) : (
          <ul className="space-y-2">
            {demos.map((d: any) => (
              <li
                key={d.id}
                className="bg-white border rounded-lg px-4 py-3 flex justify-between"
              >
                <Link href={`/admin/marhaba/${d.lead_id}`} className="hover:underline">
                  <div className="font-semibold">{d.marhaba_leads?.clinic_name}</div>
                  <div className="text-sm text-slate-600">{d.marhaba_leads?.phone}</div>
                </Link>
                <div className="text-sm text-slate-700">
                  {new Date(d.scheduled_at).toLocaleString('he-IL', {
                    timeZone: 'Asia/Jerusalem',
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Leads table with search + filter */}
      <section>
        <div className="flex justify-between items-center mb-3 flex-wrap gap-3">
          <h2 className="text-xl font-semibold">Leads ({leads.length})</h2>
          <form className="flex gap-2 items-center" method="GET">
            <input
              type="text"
              name="q"
              defaultValue={sp.q || ''}
              placeholder="חפש שם מרפאה / טלפון / עיר"
              className="border rounded-lg px-3 py-1.5 text-sm w-64"
            />
            <select
              name="status"
              defaultValue={sp.status || 'all'}
              className="border rounded-lg px-3 py-1.5 text-sm"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s === 'all' ? 'כל הסטטוסים' : s}</option>
              ))}
            </select>
            <button
              type="submit"
              className="bg-slate-800 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-slate-700"
            >
              חפש
            </button>
            {(sp.q || sp.status) && (
              <Link href="/admin/marhaba" className="text-slate-500 text-sm hover:underline">
                נקה
              </Link>
            )}
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-2 text-right">מרפאה</th>
                <th className="p-2 text-right">עיר</th>
                <th className="p-2 text-right">טלפון</th>
                <th className="p-2 text-right">Fit</th>
                <th className="p-2 text-right">שיחות</th>
                <th className="p-2 text-right">סטטוס</th>
                <th className="p-2 text-right">אחרונה</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l: any) => (
                <tr key={l.id} className="border-b hover:bg-slate-50">
                  <td className="p-2 font-medium">
                    <Link
                      href={`/admin/marhaba/${l.id}`}
                      className="text-teal-700 hover:underline"
                    >
                      {l.clinic_name}
                    </Link>
                  </td>
                  <td className="p-2 text-slate-600">{l.city || '—'}</td>
                  <td className="p-2 font-mono text-xs">{l.phone}</td>
                  <td className="p-2">{l.fit_score ?? '—'}/10</td>
                  <td className="p-2">{l.call_count || 0}</td>
                  <td className="p-2">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        STATUS_COLORS[l.status] || 'bg-slate-100'
                      }`}
                    >
                      {l.status}
                    </span>
                  </td>
                  <td className="p-2 text-slate-600 text-xs">{fmtDate(l.last_call_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="text-xs text-slate-500 pt-6 border-t">
        Marhaba Sales · מותקן על בסיס נור הקיימת · Cron: כל 30 דק' א׳-ה׳ 09-18
      </footer>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: any;
  highlight?: boolean;
}) {
  return (
    <div
      className={`p-4 rounded-lg border ${
        highlight ? 'bg-teal-50 border-teal-200' : 'bg-white border-slate-200'
      }`}
    >
      <div className="text-xs text-slate-500">{label}</div>
      <div
        className={`text-2xl font-bold ${highlight ? 'text-teal-700' : 'text-slate-900'}`}
      >
        {value}
      </div>
    </div>
  );
}
