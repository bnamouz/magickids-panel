import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getCurrentStaff } from '@/lib/admin/auth';
import { redirect } from 'next/navigation';
import { Phone, Calendar, MessageCircle, Star, XCircle, AlertTriangle, CheckCircle2, PhoneOff } from 'lucide-react';

export const dynamic = 'force-dynamic';

function formatDuration(sec: number | null): string {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jerusalem',
  });
}

function urgencyBadge(u: string | null) {
  if (u === 'urgent') return { label: 'דחוף', bg: 'bg-red-100', text: 'text-red-800' };
  if (u === 'high') return { label: 'חשוב', bg: 'bg-amber-100', text: 'text-amber-800' };
  if (u === 'low') return { label: 'רגיל-נמוך', bg: 'bg-slate-100', text: 'text-slate-600' };
  return { label: 'רגיל', bg: 'bg-slate-100', text: 'text-slate-700' };
}

function outcomeBadge(o: string | null) {
  switch (o) {
    case 'meeting_booked':
      return { label: 'פגישה נקבעה', bg: 'bg-emerald-100', text: 'text-emerald-800', icon: Calendar };
    case 'callback_requested':
      return { label: 'ביקש התקשרות', bg: 'bg-sky-100', text: 'text-sky-800', icon: Phone };
    case 'task_created':
      return { label: 'משימה נוצרה', bg: 'bg-indigo-100', text: 'text-indigo-800', icon: CheckCircle2 };
    case 'escalated':
      return { label: 'הועבר אליך', bg: 'bg-amber-100', text: 'text-amber-800', icon: AlertTriangle };
    case 'info_only':
      return { label: 'מסירת מידע', bg: 'bg-slate-100', text: 'text-slate-700', icon: MessageCircle };
    case 'dropped':
      return { label: 'שיחה נותקה', bg: 'bg-rose-100', text: 'text-rose-800', icon: PhoneOff };
    default:
      return { label: '—', bg: 'bg-slate-100', text: 'text-slate-600', icon: MessageCircle };
  }
}

function callerTypeBadge(t: string | null) {
  switch (t) {
    case 'vip_rejected':
      return { label: 'VIP - נדחה', bg: 'bg-yellow-100', text: 'text-yellow-800', icon: Star };
    case 'known_contact':
      return { label: 'ידוע', bg: 'bg-emerald-50', text: 'text-emerald-700', icon: CheckCircle2 };
    case 'spam':
      return { label: 'ספאם', bg: 'bg-rose-50', text: 'text-rose-700', icon: XCircle };
    case 'unknown':
    default:
      return { label: 'לא ידוע', bg: 'bg-slate-50', text: 'text-slate-600', icon: Phone };
  }
}

export default async function NourCallsPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/admin/login');

  const supabase = getSupabaseAdmin();
  const { data: calls, error } = await supabase
    .from('nour_calls')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
        שגיאה: {error.message}
      </div>
    );
  }

  const total = calls?.length || 0;
  const meetings = calls?.filter((c) => c.outcome === 'meeting_booked').length || 0;
  const callbacks = calls?.filter((c) => c.callback_requested).length || 0;
  const urgent = calls?.filter((c) => c.urgency === 'urgent' || c.urgency === 'high').length || 0;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">שיחות אישיות (נור)</h1>
          <p className="text-sm text-slate-500 mt-1">
            שיחות שנור ענתה במקומך כשלא היית זמין
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/personal/vip"
            className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 text-sm flex items-center gap-2"
          >
            <Star size={16} />
            ניהול VIP
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="סה״כ שיחות" value={total} />
        <Stat label="פגישות נקבעו" value={meetings} color="text-emerald-600" />
        <Stat label="ביקשו התקשרות" value={callbacks} color="text-sky-600" />
        <Stat label="דחוף/חשוב" value={urgent} color="text-amber-600" />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {total === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Phone size={48} className="mx-auto mb-3 text-slate-300" />
            <p className="font-medium">אין שיחות עדיין</p>
            <p className="text-sm mt-1">
              כשמישהו יתקשר לפלאפון האישי שלך ולא תענה, נור תענה ותופיע כאן.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-right">
              <tr>
                <th className="p-3">זמן</th>
                <th className="p-3">מתקשר</th>
                <th className="p-3">סוג</th>
                <th className="p-3">דחיפות</th>
                <th className="p-3">מטרה</th>
                <th className="p-3">תוצאה</th>
                <th className="p-3">משך</th>
                <th className="p-3">פרטים</th>
              </tr>
            </thead>
            <tbody>
              {calls?.map((call: any) => {
                const outcomeInfo = outcomeBadge(call.outcome);
                const OutcomeIcon = outcomeInfo.icon;
                const typeInfo = callerTypeBadge(call.caller_type);
                const TypeIcon = typeInfo.icon;
                const urgencyInfo = urgencyBadge(call.urgency);
                return (
                  <tr key={call.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="p-3 whitespace-nowrap">{formatDate(call.call_started_at || call.created_at)}</td>
                    <td className="p-3">
                      <div className="font-medium">{call.caller_name || 'לא ידוע'}</div>
                      <div className="text-xs text-slate-500 ltr:text-left" dir="ltr">{call.caller_phone}</div>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${typeInfo.bg} ${typeInfo.text}`}>
                        <TypeIcon size={12} />
                        {typeInfo.label}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs ${urgencyInfo.bg} ${urgencyInfo.text}`}>
                        {urgencyInfo.label}
                      </span>
                    </td>
                    <td className="p-3 max-w-xs truncate text-slate-600">{call.purpose || '—'}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${outcomeInfo.bg} ${outcomeInfo.text}`}>
                        <OutcomeIcon size={12} />
                        {outcomeInfo.label}
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap">{formatDuration(call.duration_seconds)}</td>
                    <td className="p-3">
                      {call.transcript_url && (
                        <a href={call.transcript_url} target="_blank" rel="noopener noreferrer" className="text-[#01696f] hover:underline text-xs">
                          תמלול ↗
                        </a>
                      )}
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

function Stat({ label, value, color = 'text-slate-800' }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
