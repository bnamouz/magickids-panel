import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getCurrentStaff } from '@/lib/admin/auth';
import { redirect } from 'next/navigation';
import { Phone, MessageCircle, AlertTriangle, CheckCircle2, XCircle, Info } from 'lucide-react';

export const dynamic = 'force-dynamic';

type VoiceCall = {
  id: string;
  call_started_at: string | null;
  call_ended_at: string | null;
  duration_seconds: number | null;
  caller_phone: string;
  caller_name: string | null;
  child_name: string | null;
  child_age: number | null;
  hmo: string | null;
  language_used: string | null;
  purpose: string | null;
  outcome: string | null;
  next_action: string | null;
  transcript_url: string | null;
  raw_summary: Record<string, unknown> | null;
  agent_tool_calls: Record<string, unknown>[] | null;
  created_at: string;
};

function outcomeConfig(outcome: string | null) {
  switch (outcome) {
    case 'booked':
      return { label: 'תור נקבע', bg: 'bg-emerald-100', text: 'text-emerald-800', icon: CheckCircle2 };
    case 'intake_sent':
      return { label: 'קישור נשלח', bg: 'bg-sky-100', text: 'text-sky-800', icon: MessageCircle };
    case 'escalated':
      return { label: 'הועבר לרופא', bg: 'bg-amber-100', text: 'text-amber-800', icon: AlertTriangle };
    case 'info_only':
      return { label: 'מידע', bg: 'bg-slate-100', text: 'text-slate-700', icon: Info };
    case 'dropped':
      return { label: 'שיחה נותקה', bg: 'bg-rose-100', text: 'text-rose-800', icon: XCircle };
    case 'error':
      return { label: 'שגיאה', bg: 'bg-red-100', text: 'text-red-800', icon: XCircle };
    default:
      return { label: 'לא ידוע', bg: 'bg-slate-100', text: 'text-slate-600', icon: Info };
  }
}

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
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jerusalem',
  });
}

export default async function CallsPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/admin/login');

  const supabase = getSupabaseAdmin();
  const { data: calls, error } = await supabase
    .from('voice_calls')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
        שגיאה בטעינת שיחות: {error.message}
      </div>
    );
  }

  const totalCalls = calls?.length || 0;
  const booked = calls?.filter((c) => c.outcome === 'booked').length || 0;
  const escalated = calls?.filter((c) => c.outcome === 'escalated').length || 0;
  const intakeSent = calls?.filter((c) => c.outcome === 'intake_sent').length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">שיחות עם שרה</h1>
          <p className="text-sm text-slate-500 mt-1">
            שיחות טלפון שנענו אוטומטית על ידי שרה (סוכן AI קולי)
          </p>
        </div>
        <a
          href="https://elevenlabs.io/app/conversational-ai/history"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-[#01696f] hover:underline flex items-center gap-1"
        >
          תמלולים והקלטות ב-ElevenLabs ↗
        </a>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="סה״כ שיחות" value={totalCalls} color="bg-slate-800" />
        <StatCard label="תורים נקבעו" value={booked} color="bg-emerald-600" />
        <StatCard label="קישורים נשלחו" value={intakeSent} color="bg-sky-600" />
        <StatCard label="הועברו לרופא" value={escalated} color="bg-amber-600" />
      </div>

      {/* Calls list */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {totalCalls === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Phone size={48} className="mx-auto mb-3 text-slate-300" />
            <p className="font-medium">אין שיחות עדיין</p>
            <p className="text-sm mt-1">כשמישהו יתקשר למכון, השיחה תופיע כאן אחרי סיום.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-right">
                <tr>
                  <th className="p-3 font-medium">זמן</th>
                  <th className="p-3 font-medium">מתקשר</th>
                  <th className="p-3 font-medium">ילד</th>
                  <th className="p-3 font-medium">קופה</th>
                  <th className="p-3 font-medium">מטרה</th>
                  <th className="p-3 font-medium">תוצאה</th>
                  <th className="p-3 font-medium">משך</th>
                  <th className="p-3 font-medium">פרטים</th>
                </tr>
              </thead>
              <tbody>
                {calls?.map((call: VoiceCall) => {
                  const config = outcomeConfig(call.outcome);
                  const Icon = config.icon;
                  return (
                    <tr key={call.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="p-3 text-slate-700 whitespace-nowrap">
                        {formatDate(call.call_started_at || call.created_at)}
                      </td>
                      <td className="p-3">
                        <div className="font-medium text-slate-800">
                          {call.caller_name || 'לא ידוע'}
                        </div>
                        <div className="text-xs text-slate-500 ltr:text-left" dir="ltr">
                          {call.caller_phone}
                        </div>
                      </td>
                      <td className="p-3 text-slate-700">
                        {call.child_name || '—'}
                        {call.child_age && (
                          <span className="text-xs text-slate-500 mr-1">({call.child_age})</span>
                        )}
                      </td>
                      <td className="p-3">
                        {call.hmo && (
                          <span className="inline-block px-2 py-0.5 bg-slate-100 rounded text-xs">
                            {hmoLabel(call.hmo)}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-slate-600 max-w-xs truncate">{call.purpose || '—'}</td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${config.bg} ${config.text}`}
                        >
                          <Icon size={12} />
                          {config.label}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600 whitespace-nowrap">
                        {formatDuration(call.duration_seconds)}
                      </td>
                      <td className="p-3">
                        <Link
                          href={`/admin/calls/${call.id}`}
                          className="text-[#01696f] hover:underline text-xs font-medium"
                        >
                          פרטים →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color.replace('bg-', 'text-')}`}>{value}</div>
    </div>
  );
}

function hmoLabel(hmo: string): string {
  const labels: Record<string, string> = {
    maccabi: 'מכבי',
    clalit: 'כללית',
    leumit: 'לאומית',
    meuhedet: 'מאוחדת',
    private: 'פרטי',
    unknown: 'לא ידוע',
  };
  return labels[hmo] || hmo;
}
