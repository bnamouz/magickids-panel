'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Case-page controls for one visit: after the time has passed the staff records
 *  "attended" / "no-show"; an active visit can be cancelled (Google event removed). */
export default function AppointmentOutcome({ id, status, start }: { id: string; status: string; start: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const past = Date.parse(start) <= Date.now();
  const active = status === 'scheduled' || status === 'confirmed';
  const decided = status === 'attended' || status === 'no_show';
  if (!active && !decided) return null;

  async function call(url: string, body: unknown, label: string) {
    setBusy(label); setError('');
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(typeof data.error === 'string' && data.error.length > 20 ? data.error : 'הפעולה לא נשמרה. נסו שוב.');
      setConfirmCancel(false);
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'הפעולה לא נשמרה. נסו שוב.'); }
    finally { setBusy(null); }
  }
  const outcome = (next: 'attended' | 'no_show' | 'scheduled', label: string) => call(`/api/admin/appointments/${id}/outcome`, { status: next }, label);
  const cls = 'rounded-lg border px-2.5 py-1 text-xs font-semibold disabled:opacity-50';

  return <div className="mt-2 space-y-1">
    <div className="flex flex-wrap gap-2">
      {active && past && <>
        <button type="button" disabled={!!busy} onClick={() => outcome('attended', 'התקיים')} className={`${cls} border-emerald-200 text-emerald-800 hover:bg-emerald-50`}>{busy === 'התקיים' ? 'שומר…' : 'התקיים'}</button>
        <button type="button" disabled={!!busy} onClick={() => outcome('no_show', 'לא הופיע')} className={`${cls} border-amber-200 text-amber-800 hover:bg-amber-50`}>{busy === 'לא הופיע' ? 'שומר…' : 'לא הופיע/ה'}</button>
      </>}
      {decided && <button type="button" disabled={!!busy} onClick={() => outcome('scheduled', 'החזרה')} className={`${cls} border-slate-200 text-slate-700 hover:bg-slate-50`}>{busy === 'החזרה' ? 'שומר…' : 'ביטול הסימון'}</button>}
      {active && !confirmCancel && <button type="button" disabled={!!busy} onClick={() => setConfirmCancel(true)} className={`${cls} border-red-200 text-red-700 hover:bg-red-50`}>ביטול הפגישה</button>}
    </div>
    {confirmCancel && <div role="alertdialog" className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs space-y-2">
      <p>הפגישה תבוטל ותימחק מיומן Google. להורה לא נשלחת הודעה אוטומטית.</p>
      <div className="flex gap-2">
        <button type="button" disabled={!!busy} onClick={() => call('/api/admin/appointments/cancel', { appointment_id: id, reason: 'בוטל על ידי הצוות מדף התיק' }, 'ביטול')} className={`${cls} border-red-300 bg-white text-red-700`}>{busy === 'ביטול' ? 'מבטל…' : 'כן, לבטל'}</button>
        <button type="button" disabled={!!busy} onClick={() => setConfirmCancel(false)} className={`${cls} border-slate-200 bg-white text-slate-700`}>חזרה</button>
      </div>
    </div>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </div>;
}
