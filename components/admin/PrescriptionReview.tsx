'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const WA: Record<string, string> = { accepted: 'נשלחה הודעת וואטסאפ למשפחה.', failed: 'הודעת הוואטסאפ לא נשלחה. עדכנו את המשפחה ידנית.', unknown: 'לא ודאי שהוואטסאפ נשלח. בדקו או עדכנו ידנית.', not_configured: 'וואטסאפ המכון לא מחובר. עדכנו את המשפחה ידנית.', unavailable: 'ההחלטה נשמרה, אך הודעת הוואטסאפ לא נשלחה. עדכנו את המשפחה ידנית.' };

/** Manager actions on one renewal request. The decision is saved first; the family is then told on WhatsApp. */
export default function PrescriptionReview({ id, status, summaries }: { id: string; status: string; summaries: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [mode, setMode] = useState<'' | 'issue' | 'reject'>(''), [note, setNote] = useState('');
  async function call(action: 'file' | 'issue' | 'reject', extra: { file?: number; note?: string } = {}) {
    setBusy(true); setMsg('');
    // Opened before the request so the browser does not block it as a pop-up.
    const tab = action === 'file' ? window.open('', '_blank') : null;
    try {
      const r = await fetch('/api/admin/prescriptions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id, ...extra }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { tab?.close(); setMsg(d.error === 'invalid_state' ? 'הבקשה כבר טופלה. רעננו את הדף.' : 'הפעולה לא הצליחה. נסו שוב.'); return; }
      if (action === 'file') { if (tab) { tab.opener = null; tab.location.href = d.url; } else window.location.href = d.url; return; }
      setMode(''); setNote(''); setMsg(WA[d.whatsapp] ?? 'בוצע.'); router.refresh();
    } catch { tab?.close(); setMsg('הפעולה לא הצליחה. נסו שוב.'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn-ghost" disabled={busy} onClick={() => call('file', { file: 0 })}>צפייה באסמכתה לתשלום</button>
      {Array.from({ length: summaries }, (_, i) => <button key={i} type="button" className="btn-ghost" disabled={busy} onClick={() => call('file', { file: i + 1 })}>סיכום אבחון{summaries > 1 ? ` ${i + 1}` : ''}</button>)}
      {status === 'pending' && !mode && <>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => { setMode('issue'); setNote(''); }}>המרשם הופק</button>
        <button type="button" className="btn-ghost !border-red-700 !text-red-700 hover:!bg-red-700 hover:!text-white" disabled={busy} onClick={() => { setMode('reject'); setNote(''); }}>דחיית הבקשה</button>
      </>}
    </div>
    {mode && <form className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3" onSubmit={e => { e.preventDefault(); call(mode, { note: note.trim() || undefined }); }}>
      <label className="block text-sm font-semibold">{mode === 'issue' ? 'הערה למשפחה שתצורף להודעה (לא חובה)' : 'סיבת הדחייה שתישלח למשפחה (לא חובה)'}
        <textarea className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 font-normal" rows={2} maxLength={300} value={note} onChange={e => setNote(e.target.value)} placeholder={mode === 'issue' ? 'לדוגמה: המרשם ממתין בבית המרקחת.' : 'לדוגמה: נדרש ביקור מעקב לפני חידוש המרשם.'} /></label>
      <p className="text-sm text-slate-600">{mode === 'issue' ? 'המשפחה תקבל בוואטסאפ ממספר המכון הודעה שהמרשם הופק.' : 'המשפחה תקבל בוואטסאפ ממספר המכון הודעה שהבקשה לא אושרה.'}</p>
      <div className="flex flex-wrap gap-2"><button className="btn-primary" disabled={busy}>{mode === 'issue' ? 'אישור ושליחת הודעה' : 'דחייה ושליחת הודעה'}</button><button type="button" className="btn-ghost" disabled={busy} onClick={() => setMode('')}>ביטול</button></div>
    </form>}
    {msg && <p role="status" className="text-sm font-bold text-teal-900">{msg}</p>}
  </div>;
}
