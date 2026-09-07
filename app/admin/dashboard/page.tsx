import { loadIntakeQueue } from '@/lib/intake/queue';
import Link from 'next/link';
import { requireStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { Users, Clock, AlertTriangle, CheckCircle2, ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const staff = await requireStaff();
  const supabase = getSupabaseAdmin();

  const [queue, stuck, todayAppointments] = await Promise.all([
    loadIntakeQueue().catch(() => null),
    supabase.from('v_stuck_sessions').select('*').limit(5),
    supabase.from('v_today_appointments').select('*').limit(10),
  ]);
  const ready = queue?.filter(row => row.readyToSchedule) ?? [];
  const stats = [
    { label: 'תיקים פעילים', value: queue?.length, icon: Users, color: 'teal', href: '/admin/intake?stage=all' },
    { label: 'ממתינים להורה', value: queue?.filter(row => row.stage === 'parent').length, icon: Clock, color: 'orange', href: '/admin/intake?stage=parent' },
    { label: 'ממתינים למורה', value: queue?.filter(row => row.stage === 'teacher').length, icon: Clock, color: 'blue', href: '/admin/intake?stage=teacher' },
    { label: 'מוכנים לזימון', value: queue ? ready.length : undefined, icon: CheckCircle2, color: 'green', href: '/admin/intake?stage=ready' },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">שלום {staff.full_name.split(' ')[0]}</h1>
        <p className="text-slate-500 mt-1">להלן סקירה יומית של הפעילות במכון.</p>
      </div>

      <div className="card mb-6 bg-teal-50 flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-bold text-[#01696f]">כל תהליך הקשב, במקום אחד</h2><p className="text-sm text-slate-600 mt-1">פתיחת תיק, שאלון הורים, שאלון מורה וזימון לפגישה.</p></div><div className="flex flex-wrap gap-3"><Link href="/admin/intake" className="btn-primary">קליטה וזימון לפגישה</Link><a href="/onboarding/public" target="_blank" rel="noopener noreferrer" className="btn-ghost">טופס פתיחת תיק ↗</a></div></div>
      {queue === null && <p role="alert" className="text-red-700 mb-4">לא ניתן לטעון כרגע את נתוני הקליטה. נסו לרענן; המספרים אינם זמינים.</p>}
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      <div className="mb-6"><Panel title="מוכנים לזימון לפגישה" icon={<CheckCircle2 className="text-emerald-600" size={20} />} href="/admin/intake?stage=ready">
        {queue === null ? <EmptyRow text="הרשימה אינה זמינה כרגע" /> : ready.length === 0 ? <EmptyRow text="אין כרגע תיקים שממתינים לזימון לאחר השלמת שני השאלונים" /> : <ul className="divide-y divide-slate-100">{ready.slice(0, 8).map(row => <li key={row.id} className="py-3 flex flex-wrap items-center justify-between gap-3"><div><Link href={'/admin/sessions/' + row.id} className="font-bold text-[#01696f] hover:underline">{row.childName}</Link><p className="text-xs text-slate-500">✓ שאלון הורים נשלח · ✓ שאלון מורה נשלח</p></div><Link href={'/admin/sessions/' + row.id + '#appointments'} className="btn-ghost text-sm">תיק, דוחות וזימון ←</Link></li>)}</ul>}
      </Panel></div>
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Stuck sessions */}
        <Panel title="דורש טיפול" icon={<AlertTriangle className="text-orange-500" size={20} />} href="/admin/sessions?filter=stuck">
          {(stuck.data ?? []).length === 0 ? (
            <EmptyRow text="הכול תחת בקרה 🎉" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {(stuck.data as any[]).map((row) => (
                <li key={row.id} className="py-3">
                  <Link href={`/admin/sessions/${row.id}`} className="flex items-center justify-between hover:bg-slate-50 -mx-3 px-3 py-1 rounded">
                    <div>
                      <div className="font-semibold text-slate-800">{row.child_name}</div>
                      <div className="text-xs text-slate-500">
                        {statusLabel(row.status)} · תקוע {row.days_stuck} ימים
                      </div>
                    </div>
                    <ArrowLeft size={16} className="text-slate-400" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Today's appointments */}
        <Panel title="פגישות היום" icon={<Users className="text-[#01696f]" size={20} />} href="/admin/appointments">
          {(todayAppointments.data ?? []).length === 0 ? (
            <EmptyRow text="אין פגישות מתוזמנות היום" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {(todayAppointments.data as any[]).map((row) => (
                <li key={row.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-800">{row.child_name}</div>
                    <div className="text-xs text-slate-500">{row.appointment_type} · {row.duration_min} דק'</div>
                  </div>
                  <div className="text-sm font-mono text-[#01696f]">
                    {new Date(row.scheduled_at).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, href }: { label: string; value?: number; icon: any; color: string; href: string }) {
  const colors: Record<string, string> = {
    teal: 'bg-teal-50 text-[#01696f]',
    orange: 'bg-orange-50 text-orange-600',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
  };
  return (
    <Link href={href} className="card hover:border-teal-600">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-500 mb-1">{label}</div>
          <div className="text-3xl font-bold text-slate-800">{value ?? '—'}</div>
        </div>
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon size={22} />
        </div>
      </div>
    </Link>
  );
}

function Panel({ title, icon, href, children }: { title: string; icon: React.ReactNode; href?: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="font-bold text-slate-800">{title}</h2>
        </div>
        {href && (
          <Link href={href} className="text-sm text-[#01696f] hover:underline">
            הצג הכול
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <div className="text-sm text-slate-500 py-4 text-center">{text}</div>;
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    created: 'נוצר',
    parent_form_started: 'הורה מילא/מלא',
    parent_form_done: 'הורה השלים',
    teacher_link_sent: 'קישור למורה נוצר',
    teacher_form_started: 'מורה מלא/ה',
    teacher_form_done: 'מורה השלים/ה',
    profile_ready: 'מוכן לזימון',
    scheduled: 'תור נקבע',
    completed: 'הושלם',
    cancelled: 'בוטל',
  };
  return map[s] ?? s;
}
