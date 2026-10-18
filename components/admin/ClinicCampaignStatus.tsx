'use client';
import { useEffect, useState } from 'react';

const STATE: Record<string, string> = { sending: 'פעיל — נשלחת הודעה כל 30 שניות', pending: 'מושהה', accepted: 'הסתיים', failed: 'נעצר אוטומטית' };
const REASON: Record<string, string> = { whatsapp_not_connected: 'הוואטסאפ של 050-995-5137 לא מחובר.', rejected_3_in_a_row: 'שלוש הודעות נדחו ברצף. בדקו שהוואטסאפ בטלפון פתוח ולא הוגבל.', paused_by_admin: 'הושהה ידנית.' };

export default function ClinicCampaignStatus() {
  const [list, setList] = useState<any[]>([]), [busy, setBusy] = useState(false);
  const load = (body: object = {}) => fetch('/api/admin/clinic-patients/campaign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.ok ? r.json() : null).then(d => d && setList(d.campaigns)).catch(() => {});
  useEffect(() => { load(); const t = setInterval(() => load(), 30000); return () => clearInterval(t); }, []);
  if (!list.length) return null;
  return <div className="space-y-3">{list.filter(c => c.state !== 'accepted' || c.counts.pending === 0).map(c => {
    const total = Object.values(c.counts as Record<string, number>).reduce((a, b) => a + b, 0), done = total - c.counts.pending;
    return <div key={c.cid} className="card space-y-2 border-emerald-300">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">שליחה מתוזמנת: {c.label}</h2><span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-800">{STATE[c.state] ?? c.state}</span></div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-600" style={{ width: `${total ? Math.round(done / total * 100) : 0}%` }} /></div>
      <p className="text-sm">נשלחו <b>{c.counts.accepted}</b> מתוך {total}{c.counts.failed ? ` · ${c.counts.failed} לא נמסרו` : ''}{c.counts.unknown ? ` · ${c.counts.unknown} לא ודאי` : ''} · נותרו {c.counts.pending}. שעות שליחה: {c.from}:00–{c.to}:00.{c.last_sent_at ? ` אחרונה: ${new Date(c.last_sent_at).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' })}` : ''}</p>
      {c.reason && REASON[c.reason] && <p className="text-sm font-bold text-amber-800">{REASON[c.reason]}</p>}
      <p className="whitespace-pre-wrap rounded bg-slate-50 p-2 text-sm text-slate-700">{c.text}</p>
      {c.state !== 'accepted' && <div className="flex gap-3">
        {c.state === 'sending' ? <button disabled={busy} className="btn-ghost" onClick={() => { setBusy(true); load({ action: 'pause', cid: c.cid }).finally(() => setBusy(false)); }}>השהיית השליחה</button>
          : <button disabled={busy} className="btn-primary" onClick={() => { if (confirm('להמשיך את השליחה?')) { setBusy(true); load({ action: 'resume', cid: c.cid }).finally(() => setBusy(false)); } }}>המשך שליחה</button>}
      </div>}
    </div>;
  })}</div>;
}
