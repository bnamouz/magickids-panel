import Link from 'next/link';
import { PhoneCall } from 'lucide-react';
import { getSupabaseAdmin } from '@/lib/supabase';
import { phoneVariants } from '@/lib/voice/link-case';
import LinkCallButton from './LinkCallButton';

const OUTCOME: Record<string, string> = {
  booked: 'תור נקבע', intake_sent: 'קישור נשלח', escalated: 'הועבר לצוות',
  info_only: 'מסירת מידע', dropped: 'שיחה נותקה', error: 'שגיאה',
};

type Call = {
  id: string; call_started_at: string | null; created_at: string; duration_seconds: number | null;
  outcome: string | null; purpose: string | null; next_action: string | null;
  linked_case_id: string | null; raw_summary: Record<string, any> | null;
};

const COLS = 'id, call_started_at, created_at, duration_seconds, outcome, purpose, next_action, linked_case_id, raw_summary';

function when(c: Call) {
  return new Date(c.call_started_at || c.created_at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' });
}
function dur(s: number | null) { return s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '—'; }

/** Voice calls inside the case file: linked calls, plus unlinked calls from the parent's phone. */
export default async function CaseCalls({ sessionId, parentPhone }: { sessionId: string; parentPhone?: string | null }) {
  const db = getSupabaseAdmin();
  const variants = phoneVariants(parentPhone);
  const [linked, suggested] = await Promise.all([
    db.from('voice_calls').select(COLS).eq('linked_case_id', sessionId).order('created_at', { ascending: false }).limit(30),
    variants.length
      ? db.from('voice_calls').select(COLS).is('linked_case_id', null).in('caller_phone', variants).order('created_at', { ascending: false }).limit(10)
      : Promise.resolve({ data: [] as Call[], error: null }),
  ]);

  return (
    <div id="calls" className="card scroll-mt-24">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-slate-800 flex items-center gap-2">
          <PhoneCall size={18} className="text-[#01696f]" /> שיחות טלפון
        </h2>
        <Link href="/admin/calls" className="text-xs underline text-teal-800">כל השיחות</Link>
      </div>
      {linked.error ? (
        <p role="alert" className="text-sm text-red-700">לא ניתן לטעון שיחות. אין בכך אישור שלא היו שיחות.</p>
      ) : !linked.data?.length ? (
        <p className="text-sm text-slate-500">אין שיחות משויכות לתיק</p>
      ) : (
        <ul className="space-y-3">
          {(linked.data as Call[]).map((c) => (
            <li key={c.id} className="text-sm border-r-2 border-r-[#01696f] pr-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-800">{OUTCOME[c.outcome ?? ''] ?? 'שיחה'}</span>
                <span className="text-xs text-slate-500">{when(c)} · {dur(c.duration_seconds)}</span>
              </div>
              {(c.raw_summary?.title || c.purpose) && <div className="text-slate-600 text-xs mt-1">{c.raw_summary?.title || c.purpose}</div>}
              {c.next_action && <div className="text-amber-800 text-xs mt-1">המשך: {c.next_action}</div>}
              <div className="flex gap-3 mt-1 items-center">
                <Link href={`/admin/calls/${c.id}`} className="text-xs underline text-teal-800">תמלול ופרטים</Link>
                <LinkCallButton callId={c.id} caseId={null} label="ניתוק מהתיק" />
              </div>
            </li>
          ))}
        </ul>
      )}
      {!suggested.error && !!suggested.data?.length && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-500 mb-2">שיחות ממספר ההורה שלא שויכו אוטומטית (למשל כשלמספר יש יותר מתיק אחד):</p>
          <ul className="space-y-2">
            {(suggested.data as Call[]).map((c) => (
              <li key={c.id} className="text-xs flex flex-wrap items-center justify-between gap-2">
                <span>{when(c)} · {OUTCOME[c.outcome ?? ''] ?? 'שיחה'}</span>
                <span className="flex gap-2 items-center">
                  <Link href={`/admin/calls/${c.id}`} className="underline text-teal-800">פרטים</Link>
                  <LinkCallButton callId={c.id} caseId={sessionId} label="שיוך לתיק" />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
