'use client';
import { useState } from 'react';
import { MessageCircle } from 'lucide-react';

const ERR: Record<string, string> = {
  not_mobile: 'למספר ההורה אין נייד ישראלי תקין.',
  forbidden: 'נדרשת כניסה מחדש לפאנל.',
};

export default function CaseWhatsAppButton({ sessionId, parentName, childName, phone }: { sessionId: string; parentName?: string | null; childName: string; phone?: string | null }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [status, setStatus] = useState('');
  const [text, setText] = useState(''), [requestId, setRequestId] = useState('');
  if (!phone) return null;
  const start = () => {
    const first = (parentName ?? '').trim().split(/\s+/)[0];
    setText(`שלום${first ? ` ${first}` : ''}, כאן מכון ילדי הקסם לגבי ${childName}. `);
    setRequestId(crypto.randomUUID()); setStatus(''); setOpen(true);
  };
  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setStatus('');
    try {
      const r = await fetch('/api/admin/sessions/whatsapp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, text, request_id: requestId }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(ERR[d.error] ?? 'ההודעה לא נשלחה. בדקו שהוואטסאפ של המכון מחובר ונסו שוב.');
      setStatus('ההודעה נשלחה.'); setTimeout(() => setOpen(false), 1200);
    } catch (err: any) { setStatus(err.message); } finally { setBusy(false); }
  }
  return <>
    <button type="button" onClick={start} title="מענה בוואטסאפ מהמכון" aria-label={`מענה בוואטסאפ להורה של ${childName}`}
      className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100">
      <MessageCircle size={14} /> וואטסאפ
    </button>
    {open && <div role="dialog" aria-modal="true" aria-label="מענה בוואטסאפ" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 text-right font-normal">
      <form onSubmit={send} className="card w-full max-w-lg space-y-3">
        <h2 className="text-xl font-bold text-slate-800">מענה בוואטסאפ · {childName}</h2>
        <p className="text-sm text-slate-600">אל {parentName ?? 'ההורה'} <span dir="ltr" className="font-mono">{phone}</span> · נשלח מהוואטסאפ של המכון 054-402-0043.</p>
        <textarea dir="auto" required minLength={2} maxLength={1000} rows={5} value={text} onChange={e => setText(e.target.value)}
          className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
        {status && <p role="status" className="text-sm font-bold text-teal-800">{status}</p>}
        <div className="flex gap-3"><button disabled={busy || text.trim().length < 2} className="btn-primary">שליחה</button>
          <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>סגירה</button></div>
      </form>
    </div>}
  </>;
}
