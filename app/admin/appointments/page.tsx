import { requireStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import Link from 'next/link';
import { Calendar } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AppointmentsPage() {
  await requireStaff();
  const supabase = getSupabaseAdmin();

  const { data: upcoming } = await supabase
    .from('appointments')
    .select('*, intake_sessions!inner(id, patients(first_name, last_name))')
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at')
    .limit(50);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">יומן פגישות</h1>
        <p className="text-slate-500 mt-1">
          {upcoming?.length ?? 0} פגישות עתידיות · אינטגרציית Google Calendar בפיתוח (שלב 6)
        </p>
      </div>

      <div className="card p-0 overflow-hidden">
        {!upcoming?.length ? (
          <div className="p-12 text-center">
            <Calendar className="mx-auto mb-4 text-slate-300" size={48} />
            <p className="text-slate-500">אין פגישות מתוזמנות</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-slate-600 text-right">
                <th className="p-3 font-semibold">תאריך + שעה</th>
                <th className="p-3 font-semibold">ילד/ה</th>
                <th className="p-3 font-semibold">סוג</th>
                <th className="p-3 font-semibold">משך</th>
                <th className="p-3 font-semibold">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((a: any) => {
                const p = a.intake_sessions?.patients;
                const name = `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim();
                return (
                  <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-3 font-mono text-xs">
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
                    <td className="p-3 text-slate-700">{a.appointment_type ?? 'אבחון'}</td>
                    <td className="p-3 text-slate-600">{a.duration_min ?? 30} דק'</td>
                    <td className="p-3">
                      <span className="px-2 py-1 rounded text-xs bg-teal-100 text-teal-700">
                        {a.status}
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
