import { requireStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import Link from 'next/link';
import { Calendar, CheckCircle2, AlertCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
  assessment: 'אבחון ADHD',
  followup: 'מעקב',
  moxo: 'בדיקת Moxo',
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  scheduled: { label: 'מתוזמן', color: 'bg-teal-100 text-teal-700' },
  confirmed: { label: 'אושר', color: 'bg-green-100 text-green-700' },
  attended: { label: 'התקיים', color: 'bg-slate-100 text-slate-700' },
  no_show: { label: 'לא הופיע', color: 'bg-orange-100 text-orange-700' },
  cancelled: { label: 'בוטל', color: 'bg-red-100 text-red-700' },
  rescheduled: { label: 'תוזמן מחדש', color: 'bg-blue-100 text-blue-700' },
};

export default async function AppointmentsPage() {
  await requireStaff();
  const supabase = getSupabaseAdmin();

  const gcalConfigured = !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_CALENDAR_ID
  );

  const { data: upcoming } = await supabase
    .from('appointments')
    .select('*, intake_sessions!inner(id, patients(first_name, last_name))')
    .gte('scheduled_at', new Date().toISOString())
    .neq('status', 'cancelled')
    .order('scheduled_at')
    .limit(50);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">יומן פגישות</h1>
          <p className="text-slate-500 mt-1">
            {upcoming?.length ?? 0} פגישות עתידיות
          </p>
        </div>
        <div>
          {gcalConfigured ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-sm">
              <CheckCircle2 size={16} /> Google Calendar מחובר
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 text-sm">
              <AlertCircle size={16} /> Google Calendar לא מוגדר
            </div>
          )}
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {!upcoming?.length ? (
          <div className="p-12 text-center">
            <Calendar className="mx-auto mb-4 text-slate-300" size={48} />
            <p className="text-slate-500 mb-2">אין פגישות מתוזמנות</p>
            <p className="text-slate-400 text-sm">
              קבע פגישה חדשה מעמוד פרטי התיק
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-slate-600 text-right">
                <th className="p-3 font-semibold">תאריך + שעה</th>
                <th className="p-3 font-semibold">ילד/ה</th>
                <th className="p-3 font-semibold">סוג</th>
                <th className="p-3 font-semibold">משך</th>
                <th className="p-3 font-semibold">מיקום</th>
                <th className="p-3 font-semibold">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((a: any) => {
                const p = a.intake_sessions?.patients;
                const name = `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim() || '—';
                const st = STATUS_LABEL[a.status] ?? { label: a.status, color: 'bg-slate-100 text-slate-700' };
                return (
                  <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-3 font-mono text-xs whitespace-nowrap">
                      {new Date(a.scheduled_at).toLocaleString('he-IL', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="p-3 font-semibold text-slate-800">
                      <Link href={`/admin/sessions/${a.session_id}`} className="hover:text-[#01696f]">
                        {name}
                      </Link>
                    </td>
                    <td className="p-3 text-slate-700">
                      {TYPE_LABEL[a.appointment_type] ?? a.appointment_type}
                    </td>
                    <td className="p-3 text-slate-600 whitespace-nowrap">{a.duration_minutes ?? 30} דק׳</td>
                    <td className="p-3 text-slate-500 text-xs">{a.location ?? '—'}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs ${st.color}`}>
                        {st.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
