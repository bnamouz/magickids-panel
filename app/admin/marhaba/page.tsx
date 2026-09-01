// app/admin/marhaba/page.tsx
// Marhaba Sales dashboard. Protected by middleware.ts (requires login).

import { getSupabaseAdmin } from '@/lib/supabase';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function loadData() {
  const supabase = getSupabaseAdmin();
  const [dashboardRes, leadsRes, demosRes] = await Promise.all([
    supabase.from('marhaba_sales_dashboard').select('*').single(),
    supabase
      .from('marhaba_leads')
      .select('id, clinic_name, phone, city, status, fit_score, interest_level, call_count, last_call_at, next_action_at')
      .order('fit_score', { ascending: false, nullsFirst: false })
      .order('imported_at', { ascending: false })
      .limit(100),
    supabase
      .from('marhaba_demos')
      .select('id, lead_id, scheduled_at, status, marhaba_leads(clinic_name, phone)')
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(20),
  ]);

  return {
    dashboard: dashboardRes.data,
    leads: leadsRes.data || [],
    demos: demosRes.data || [],
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

export default async function MarhabaAdminPage() {
  const { dashboard, leads, demos, error } = await loadData();

  if (error) {
    return (
      <div dir="rtl" className="max-w-4xl mx-auto p-8">
        <h1 className="text-2xl font-bold mb-4">Marhaba Sales</h1>
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg">
          <div className="font-semibold mb-2">שגיאה בטעינת נתונים</div>
          <div className="text-sm">{error}</div>
          <div className="text-sm mt-3 text-red-600">
            ודא שהרצת את ה-SQL migration: <code>db/migrations/20260901_marhaba_sales.sql</code>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Marhaba Sales</h1>
          <p className="text-sm text-slate-500 mt-1">נור-סיילס מבצעת שיחות אוטומטיות כל 30 דק' א׳-ה׳ 09-18</p>
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

      {/* Dashboard cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <StatCard label="Leads חדשים" value={dashboard?.new_leads ?? 0} />
        <StatCard label="בתור" value={dashboard?.in_queue ?? 0} />
        <StatCard label="דמו נקבע" value={dashboard?.demos_booked ?? 0} highlight />
        <StatCard label="לקוחות" value={dashboard?.customers ?? 0} highlight />
        <StatCard label="שיחות השבוע" value={dashboard?.calls_this_week ?? 0} />
        <StatCard label="שיחות החודש" value={dashboard?.calls_this_month ?? 0} />
        <StatCard label="Booking %" value={`${dashboard?.demo_booking_rate_pct ?? 0}%`} />
      </div>

      {/* Upcoming demos */}
      <section>
        <h2 className="text-xl font-semibold mb-3">דמו קרובים</h2>
        {demos.length === 0 ? (
          <p className="text-slate-500 text-sm">אין דמו מתוכננים.</p>
        ) : (
          <ul className="space-y-2">
            {demos.map((d: any) => (
              <li key={d.id} className="bg-white border rounded-lg px-4 py-3 flex justify-between">
                <div>
                  <div className="font-semibold">{d.marhaba_leads?.clinic_name}</div>
                  <div className="text-sm text-slate-600">{d.marhaba_leads?.phone}</div>
                </div>
                <div className="text-sm text-slate-700">
                  {new Date(d.scheduled_at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Leads table */}
      <section>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-xl font-semibold">Leads ({leads.length})</h2>
          <details className="text-sm">
            <summary className="cursor-pointer text-teal-600">ייבא Leads מ־Google</summary>
            <div className="mt-2 text-slate-600 text-xs">
              הפעל בטרמינל: <br />
              <code className="block bg-slate-100 p-2 mt-1 font-mono text-xs">
                curl -X POST https://[your-domain]/api/marhaba/import-leads \<br />
                &nbsp;&nbsp;-H "Content-Type: application/json" \<br />
                &nbsp;&nbsp;-H "x-admin-secret: $MARHABA_CRON_SECRET" \<br />
                &nbsp;&nbsp;-d '{'{'}"city":"ירושלים","dry_run":true{'}'}'
              </code>
            </div>
          </details>
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
                <th className="p-2 text-right">פעולה אחרונה</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l: any) => (
                <tr key={l.id} className="border-b hover:bg-slate-50">
                  <td className="p-2 font-medium">{l.clinic_name}</td>
                  <td className="p-2 text-slate-600">{l.city || '—'}</td>
                  <td className="p-2 font-mono text-xs">{l.phone}</td>
                  <td className="p-2">{l.fit_score ?? '—'}/10</td>
                  <td className="p-2">{l.call_count || 0}</td>
                  <td className="p-2">
                    <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[l.status] || 'bg-slate-100'}`}>
                      {l.status}
                    </span>
                  </td>
                  <td className="p-2 text-slate-600 text-xs">
                    {l.last_call_at ? new Date(l.last_call_at).toLocaleDateString('he-IL') : '—'}
                  </td>
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

function StatCard({ label, value, highlight }: { label: string; value: any; highlight?: boolean }) {
  return (
    <div className={`p-4 rounded-lg border ${highlight ? 'bg-teal-50 border-teal-200' : 'bg-white border-slate-200'}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-bold ${highlight ? 'text-teal-700' : 'text-slate-900'}`}>{value}</div>
    </div>
  );
}
