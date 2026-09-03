// app/admin/marhaba/[id]/page.tsx
// Marhaba lead drill-down: full profile + call log + transcripts

import { getSupabaseAdmin } from '@/lib/supabase';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function loadLead(id: number) {
  const supabase = getSupabaseAdmin();
  const [leadRes, callsRes, demosRes] = await Promise.all([
    supabase.from('marhaba_leads').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('marhaba_calls')
      .select('*')
      .eq('lead_id', id)
      .order('started_at', { ascending: false }),
    supabase
      .from('marhaba_demos')
      .select('*')
      .eq('lead_id', id)
      .order('scheduled_at', { ascending: false }),
  ]);
  return { lead: leadRes.data, calls: callsRes.data || [], demos: demosRes.data || [] };
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

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
}

function fmtDuration(secs: number | null | undefined) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) return notFound();

  const { lead, calls, demos } = await loadLead(id);
  if (!lead) return notFound();

  return (
    <div dir="rtl" className="max-w-5xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div>
        <Link href="/admin/marhaba" className="text-teal-600 text-sm hover:underline">
          ← חזרה לדשבורד
        </Link>
        <div className="flex justify-between items-start mt-2">
          <div>
            <h1 className="text-3xl font-bold">{lead.clinic_name}</h1>
            <p className="text-slate-600 mt-1 font-mono text-sm">{lead.phone}</p>
            {lead.city && <p className="text-slate-500 text-sm">{lead.city}</p>}
          </div>
          <span className={`text-sm px-3 py-1 rounded-full ${STATUS_COLORS[lead.status] || 'bg-slate-100'}`}>
            {lead.status}
          </span>
        </div>
      </div>

      {/* Metadata cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetaCard label="Contact" value={lead.contact_name || '—'} />
        <MetaCard label="Fit Score" value={lead.fit_score != null ? `${lead.fit_score}/10` : '—'} />
        <MetaCard label="שיחות" value={lead.call_count ?? 0} />
        <MetaCard label="Interest" value={lead.interest_level || '—'} />
        <MetaCard label="שיחה אחרונה" value={fmtDate(lead.last_call_at)} />
        <MetaCard label="פעולה הבאה" value={fmtDate(lead.next_action_at)} />
        <MetaCard label="נוסף" value={fmtDate(lead.imported_at)} />
        <MetaCard label="מקור" value={lead.source || '—'} />
      </div>

      {/* Demos */}
      {demos.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-3">דמו ({demos.length})</h2>
          <ul className="space-y-2">
            {demos.map((d: any) => (
              <li key={d.id} className="bg-white border rounded-lg px-4 py-3 flex justify-between">
                <div className="text-sm">
                  <div className="font-semibold">{fmtDate(d.scheduled_at)}</div>
                  <div className="text-slate-600 mt-1">
                    סטטוס: {d.status} · סוג: {d.type || 'zoom'}
                  </div>
                  {d.notes && <div className="text-slate-500 text-xs mt-1">{d.notes}</div>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Calls with transcripts */}
      <section>
        <h2 className="text-xl font-semibold mb-3">שיחות ({calls.length})</h2>
        {calls.length === 0 ? (
          <p className="text-slate-500 text-sm">עדיין אין שיחות מוקלטות.</p>
        ) : (
          <div className="space-y-4">
            {calls.map((c: any) => (
              <CallCard key={c.id} call={c} />
            ))}
          </div>
        )}
      </section>

      {/* Notes */}
      {lead.notes && (
        <section>
          <h2 className="text-xl font-semibold mb-3">הערות</h2>
          <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg text-sm whitespace-pre-wrap">
            {lead.notes}
          </div>
        </section>
      )}
    </div>
  );
}

function MetaCard({ label, value }: { label: string; value: any }) {
  return (
    <div className="p-3 rounded-lg border bg-white border-slate-200">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-900 mt-1 truncate">{value}</div>
    </div>
  );
}

function CallCard({ call }: { call: any }) {
  const transcript = Array.isArray(call.transcript) ? call.transcript : [];
  const isSuccess = call.call_successful === 'success';

  return (
    <details className="bg-white border rounded-lg p-4">
      <summary className="cursor-pointer flex justify-between items-center">
        <div>
          <div className="font-semibold">
            {fmtDate(call.started_at)} · {fmtDuration(call.duration_secs)}
            {isSuccess && <span className="mr-2 text-green-600 text-sm">✓ successful</span>}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono">{call.conversation_id}</div>
        </div>
        <div className="text-xs text-slate-500">
          {call.termination_reason || call.status}
        </div>
      </summary>

      {call.transcript_summary && (
        <div className="mt-4 p-3 bg-teal-50 border border-teal-100 rounded text-sm">
          <div className="text-xs font-semibold text-teal-800 mb-1">סיכום</div>
          <div>{call.transcript_summary}</div>
        </div>
      )}

      {transcript.length > 0 ? (
        <div className="mt-4 space-y-2 max-h-96 overflow-y-auto pr-2">
          {transcript.map((t: any, i: number) => (
            <div
              key={i}
              className={`p-2 rounded text-sm ${
                t.role === 'agent' ? 'bg-slate-50 ml-4' : 'bg-teal-50 mr-4'
              }`}
            >
              <div className="text-xs font-semibold text-slate-500 mb-1">
                {t.role === 'agent' ? 'נור' : 'לקוח'}
                {t.time_in_call_secs != null && (
                  <span className="mr-2 font-mono">· {fmtDuration(t.time_in_call_secs)}</span>
                )}
              </div>
              <div>{t.message}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 text-slate-500 text-sm">אין תמליל.</div>
      )}
    </details>
  );
}
