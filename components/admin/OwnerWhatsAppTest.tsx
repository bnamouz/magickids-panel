'use client';
import { useEffect, useState } from 'react';
import { OWNER_WHATSAPP_TEST as test, WHATSAPP_TEST_LABELS as labels } from '@/lib/appointments/owner-whatsapp-test';

export default function OwnerWhatsAppTest() {
  const [state, setState] = useState('loading');
  const [identity, setIdentity] = useState('loading');
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  // A lost POST response must not become retryable simply because a subsequent
  // GET momentarily sees the record before the original POST has claimed it.
  const [attempted, setAttempted] = useState(false);
  async function refresh() {
    setBusy(true); setReviewed(false);
    try {
      const response = await fetch('/api/admin/whatsapp-test', { cache: 'no-store' });
      const data = await response.json();
      setState(response.ok && typeof data.state === 'string' ? data.state : 'unavailable');
      setIdentity(response.ok && data.configured === true ? 'verified' : data.identity ?? 'identity_unavailable');
    } catch { setState('unavailable'); setIdentity('identity_unavailable'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void refresh(); }, []);
  const canSend = !attempted && identity === 'verified' && ['not_requested', 'pending'].includes(state);
  async function send() {
    if (busy || !reviewed || !canSend) return;
    setBusy(true); setAttempted(true); setState('sending');
    try {
      const response = await fetch('/api/admin/whatsapp-test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await response.json();
      setState(typeof data.state === 'string' ? data.state : 'unknown');
    } catch { setState('unknown'); }
    finally { setReviewed(false); setBusy(false); }
  }
  return <section dir="rtl" className="mx-auto max-w-2xl space-y-5 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 sm:p-7">
    <header>
      <p className="mb-2 text-sm font-bold text-teal-800">בדיקה מוגבלת לבעל המכון</p>
      <h1 className="text-xl font-bold">בדיקת וואטסאפ המכון</h1>
      <p className="mt-3 text-sm leading-7 text-slate-600">שליחה אחת באמצעות חיבור האתר. ללא יצירת תור, ללא פרטי מטופלים וללא הפעלת אישורי תורים להורים.</p>
    </header>
    <dl className="space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
      <div><dt className="font-bold">מספר המכון הנדרש</dt><dd dir="ltr" className="mt-1 text-right">{test.sender}</dd></div>
      <div><dt className="font-bold">נמען יחיד</dt><dd dir="ltr" className="mt-1 text-right">{test.to}</dd></div>
    </dl>
    <div className="rounded-xl border border-slate-200 p-4">
      <h2 className="mb-2 text-sm font-bold">ההודעה שתישלח</h2>
      <p className="whitespace-pre-line text-sm leading-7">{test.body}</p>
    </div>
    <div role="status" aria-live="polite" className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm leading-7 text-teal-950">
      <p>{labels[state] ?? labels.unknown}</p>
      <p>{labels[identity] ?? labels.identity_unavailable}</p>
      {attempted && ['not_requested', 'pending'].includes(state) && <p>בוצע ניסיון בחלון זה. אין לשלוח שוב לפני בירור.</p>}
    </div>
    <label className="flex items-start gap-3 text-sm leading-6">
      <input type="checkbox" checked={reviewed} disabled={busy || !canSend}
        onChange={e => setReviewed(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-teal-700" />
      <span>בדקתי את הנמען ואת הנוסח, ואני מאשר שליחת הודעת בדיקה אחת בלבד.</span>
    </label>
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={busy || !reviewed || !canSend} onClick={send}
        className="rounded-lg bg-teal-700 px-5 py-3 text-sm font-bold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50">שליחת וואטסאפ הבדיקה</button>
      <button type="button" disabled={busy} onClick={refresh}
        className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-bold hover:bg-slate-50 disabled:opacity-50">רענון מצב בלבד</button>
    </div>
    <p className="text-xs leading-6 text-slate-600">פתיחת העמוד ורענון המצב אינם שולחים הודעה. לאחר תוצאה לא ודאית אין ניסיון חוזר אוטומטי. הבדיקה אינה מוכיחה את כל תהליך קביעת התור.</p>
  </section>;
}
