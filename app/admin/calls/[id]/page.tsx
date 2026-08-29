import { getSupabaseAdmin } from '@/lib/supabase';
import { getCurrentStaff } from '@/lib/admin/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Phone, Clock, User, Baby, Building2, Target, MessageSquare, Wrench } from 'lucide-react';

export const dynamic = 'force-dynamic';

function formatDuration(sec: number | null): string {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')} דקות`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Jerusalem',
  });
}

function hmoLabel(hmo: string | null): string {
  if (!hmo) return '—';
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

function outcomeLabel(outcome: string | null): string {
  if (!outcome) return '—';
  const labels: Record<string, string> = {
    booked: 'תור נקבע',
    intake_sent: 'קישור נשלח',
    escalated: 'הועבר לרופא',
    info_only: 'מסירת מידע',
    dropped: 'שיחה נותקה',
    error: 'שגיאה',
  };
  return labels[outcome] || outcome;
}

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/admin/login');

  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const { data: call, error } = await supabase
    .from('voice_calls')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !call) return notFound();

  const toolCalls = (call.agent_tool_calls as any[] | null) || [];
  const rawSummary = call.raw_summary as Record<string, unknown> | null;
  const transcript = extractTranscript(rawSummary);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Back */}
      <Link
        href="/admin/calls"
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-[#01696f]"
      >
        <ArrowRight size={16} />
        חזרה לרשימת שיחות
      </Link>

      {/* Header */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Phone size={20} className="text-[#01696f]" />
              שיחה עם {call.caller_name || 'לא מזוהה'}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {formatDate(call.call_started_at || call.created_at)}
            </p>
          </div>
          <div className="text-left">
            <div className="text-xs text-slate-500 mb-1">משך שיחה</div>
            <div className="text-lg font-semibold text-slate-800">
              {formatDuration(call.duration_seconds)}
            </div>
          </div>
        </div>
      </div>

      {/* Summary grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InfoCard icon={<User size={18} />} label="מתקשר">
          <div className="font-medium">{call.caller_name || 'לא ידוע'}</div>
          <div className="text-sm text-slate-600 ltr:text-left" dir="ltr">
            {call.caller_phone}
          </div>
        </InfoCard>
        <InfoCard icon={<Baby size={18} />} label="ילד/ה">
          {call.child_name ? (
            <>
              <div className="font-medium">{call.child_name}</div>
              {call.child_age && <div className="text-sm text-slate-600">גיל: {call.child_age}</div>}
            </>
          ) : (
            <div className="text-slate-400">לא נמסר</div>
          )}
        </InfoCard>
        <InfoCard icon={<Building2 size={18} />} label="קופת חולים">
          {hmoLabel(call.hmo)}
        </InfoCard>
        <InfoCard icon={<Target size={18} />} label="תוצאה">
          <div className="font-medium">{outcomeLabel(call.outcome)}</div>
          {call.next_action && (
            <div className="text-sm text-slate-600 mt-1">{call.next_action}</div>
          )}
        </InfoCard>
      </div>

      {/* Purpose */}
      {call.purpose && (
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center gap-2 text-slate-700 font-semibold mb-2">
            <Target size={18} />
            מטרת השיחה
          </div>
          <p className="text-slate-700">{call.purpose}</p>
        </div>
      )}

      {/* Tool calls */}
      {toolCalls.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center gap-2 text-slate-700 font-semibold mb-3">
            <Wrench size={18} />
            פעולות שביצעה שרה
          </div>
          <ul className="space-y-2">
            {toolCalls.map((tc, i) => (
              <li key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg text-sm">
                <div className="flex-shrink-0 w-7 h-7 bg-[#01696f] text-white rounded-full flex items-center justify-center text-xs font-bold">
                  {i + 1}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-slate-800">{toolLabel(tc.tool_name || tc.name)}</div>
                  {tc.result && (
                    <pre className="text-xs text-slate-500 mt-1 overflow-x-auto" dir="ltr">
                      {JSON.stringify(tc.result, null, 2).slice(0, 400)}
                    </pre>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Transcript */}
      {transcript && transcript.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center gap-2 text-slate-700 font-semibold mb-3">
            <MessageSquare size={18} />
            תמלול השיחה
          </div>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {transcript.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                    msg.role === 'user'
                      ? 'bg-slate-100 text-slate-800'
                      : 'bg-[#01696f] text-white'
                  }`}
                >
                  <div className="text-xs opacity-70 mb-1">
                    {msg.role === 'user' ? 'מתקשר' : 'שרה'}
                  </div>
                  <div className="text-sm whitespace-pre-wrap">{msg.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transcript link */}
      {call.transcript_url && (
        <a
          href={call.transcript_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-[#01696f] hover:underline"
        >
          🎧 האזן להקלטת השיחה המלאה ב-ElevenLabs
        </a>
      )}

      {/* Raw data (collapsed) */}
      <details className="bg-slate-50 rounded-lg border border-slate-200 p-4">
        <summary className="cursor-pointer text-sm text-slate-600 font-medium">
          נתונים גולמיים (מפתחים)
        </summary>
        <pre className="mt-3 text-xs text-slate-600 overflow-x-auto" dir="ltr">
          {JSON.stringify(call, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function InfoCard({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
        <span className="text-[#01696f]">{icon}</span>
        {label}
      </div>
      <div className="text-slate-800">{children}</div>
    </div>
  );
}

function toolLabel(name: string): string {
  const labels: Record<string, string> = {
    check_intake_status: '🔍 בדיקת מילוי שאלונים',
    get_maccabi_slots: '📅 חיפוש מועדים פנויים',
    book_maccabi_appointment: '✅ קביעת תור מכבי',
    send_intake_link: '📱 שליחת קישור בוואטסאפ',
    escalate_to_human: '🚨 העברה לד״ר בסים',
  };
  return labels[name] || name;
}

function extractTranscript(
  raw: Record<string, unknown> | null,
): { role: 'user' | 'assistant'; text: string }[] | null {
  if (!raw) return null;
  const t = (raw as any).transcript;
  if (Array.isArray(t)) return t;
  return null;
}
