import Link from 'next/link';
import { requireStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import SessionFilters from './SessionFilters';
import { ArrowLeft, Search } from 'lucide-react';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  created: 'נוצר',
  parent_form_started: 'הורה ממלא',
  parent_form_done: 'הורה השלים',
  teacher_link_sent: 'קישור למורה נשלח',
  teacher_form_started: 'מורה ממלאה',
  teacher_form_done: 'מורה השלימה',
  profile_ready: 'מוכן לזימון',
  scheduled: 'תור נקבע',
  completed: 'הושלם',
  cancelled: 'בוטל',
};

const STATUS_COLORS: Record<string, string> = {
  created: 'bg-slate-100 text-slate-700',
  parent_form_started: 'bg-orange-100 text-orange-700',
  parent_form_done: 'bg-blue-100 text-blue-700',
  teacher_link_sent: 'bg-blue-100 text-blue-700',
  teacher_form_started: 'bg-blue-100 text-blue-700',
  teacher_form_done: 'bg-cyan-100 text-cyan-700',
  profile_ready: 'bg-green-100 text-green-700',
  scheduled: 'bg-teal-100 text-teal-700',
  completed: 'bg-slate-200 text-slate-600',
  cancelled: 'bg-red-100 text-red-700',
};

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; filter?: string };
}) {
  await requireStaff();
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('intake_sessions')
    
    .order('updated_at', { ascending: false })
    .limit(100);

  if (searchParams.status) {
    query = query.eq('status', searchParams.status);
  }

  if (searchParams.filter === 'stuck') {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    query = query.lt('updated_at', threeDaysAgo).not('status', 'in', '(completed,cancelled)');
  }

  const { data: sessions, error } = await query;

  // Client-side name filter (small dataset)
  const q = searchParams.q?.trim().toLowerCase();
  const filtered = q
    ? (sessions ?? []).filter((s: any) => {
        const name = `${s.patients?.first_name ?? ''} ${s.patients?.last_name ?? ''}`.toLowerCase();
        const parentName = (s.parents?.[0]?.name ?? '').toLowerCase();
        const phone = (s.parents?.[0]?.phone ?? '').toLowerCase();
        return name.includes(q) || parentName.includes(q) || phone.includes(q);
      })
    : sessions ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">תיקים פעילים</h1>
          <p className="text-slate-500 text-sm mt-1">
            {filtered.length} תיקים {searchParams.status && `· סטטוס: ${STATUS_LABELS[searchParams.status]}`}
          </p>
        </div>
      </div>

      <SessionFilters current={{ q: searchParams.q, status: searchParams.status, filter: searchParams.filter }} />

      <div className="card p-0 overflow-hidden">
        {error && <div className="p-4 text-red-600">שגיאה בטעינה: {error.message}</div>}
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <Search className="mx-auto mb-3 text-slate-300" size={40} />
            לא נמצאו תיקים
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-slate-600 text-right">
                <th className="p-3 font-semibold">ילד/ה</th>
                <th className="p-3 font-semibold">הורה</th>
                <th className="p-3 font-semibold">טלפון</th>
                <th className="p-3 font-semibold">סטטוס</th>
                <th className="p-3 font-semibold">עודכן</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s: any) => {
                const child = s.patients;
                const parent = s.parents?.[0];
                const childName = `${child?.first_name ?? ''} ${child?.last_name ?? ''}`.trim() || '—';
                return (
                  <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td className="p-3 font-semibold text-slate-800">
                      <Link href={`/admin/sessions/${s.id}`} className="hover:text-[#01696f]">
                        {childName}
                      </Link>
                      {child?.birth_date && (
                        <div className="text-xs text-slate-500 font-normal">
                          {calcAge(child.birth_date)} · {new Date(child.birth_date).toLocaleDateString('he-IL')}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-slate-700">{parent?.name ?? '—'}</td>
                    <td className="p-3 text-slate-600 font-mono text-xs" dir="ltr">
                      {parent?.phone ?? '—'}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[s.status] ?? 'bg-slate-100'}`}>
                        {STATUS_LABELS[s.status] ?? s.status}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-slate-500">{relativeTime(s.updated_at)}</td>
                    <td className="p-3">
                      <Link href={`/admin/sessions/${s.id}`} className="text-[#01696f] hover:text-[#025055]">
                        <ArrowLeft size={16} />
                      </Link>
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

function calcAge(dob: string): string {
  const years = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return `בן/בת ${years}`;
}

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const hours = Math.floor(diff / (60 * 60 * 1000));
  if (hours < 1) return 'לפני פחות משעה';
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `לפני ${days} ימים`;
  return new Date(ts).toLocaleDateString('he-IL');
}
