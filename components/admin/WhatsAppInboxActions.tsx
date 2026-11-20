'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Pause/resume the institute bot for one chat and mark a flagged chat as handled. */
export default function WhatsAppInboxActions({ chatPhone, paused, needsStaff }: { chatPhone: string; paused: boolean; needsStaff: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function act(action: 'pause' | 'resume' | 'handled') {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/admin/whatsapp-inbox', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_phone: chatPhone, action }) });
      if (!res.ok) setError('הפעולה לא נשמרה. נסו שוב.');
      else router.refresh();
    } catch { setError('הפעולה לא נשמרה. נסו שוב.'); }
    finally { setBusy(false); }
  }
  const btn = 'rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50';
  return <div className="flex flex-wrap items-center gap-2">
    {paused
      ? <button type="button" disabled={busy} onClick={() => act('resume')} className={`${btn} bg-teal-700 text-white`}>חידוש מענה אוטומטי</button>
      : <button type="button" disabled={busy} onClick={() => act('pause')} className={`${btn} border border-amber-600 bg-white text-amber-800`}>השהיית הבוט בשיחה (7 ימים)</button>}
    {needsStaff && <button type="button" disabled={busy} onClick={() => act('handled')} className={`${btn} bg-slate-800 text-white`}>סימון כטופל</button>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
