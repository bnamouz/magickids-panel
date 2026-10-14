'use client';

import { useEffect, useState } from 'react';
import { MAIL_TEST_LABELS, OWNER_MAIL_TEST } from '@/lib/therapists/owner-mail-test-copy';

export default function OwnerMailTest() {
  const [state, setState] = useState('loading');
  const [configured, setConfigured] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  async function refresh() {
    setBusy(true);
    try {
      const response = await fetch('/api/admin/mail-test', { cache: 'no-store' });
      const data = await response.json();
      setConfigured(response.ok && data.configured === true);
      setState(typeof data.state === 'string' ? data.state : 'unavailable');
    } catch { setConfigured(false); setState('unavailable'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void refresh(); }, []);
  async function send() {
    if (busy || !reviewed || !configured || !['not_requested', 'pending'].includes(state)) return;
    setBusy(true);
    setState('sending');
    try {
      const response = await fetch('/api/admin/mail-test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await response.json();
      setState(typeof data.state === 'string' ? data.state : 'unknown');
    } catch { setState('unknown'); }
    finally { setReviewed(false); setBusy(false); }
  }
  const canSend = configured && ['not_requested', 'pending'].includes(state);
  return <section dir="rtl" className="mx-auto max-w-2xl space-y-5 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 sm:p-7">
    <div>
      <p className="mb-2 text-sm font-bold text-teal-800">בדיקה מוגבלת לבעל המכון</p>
      <h1 className="text-xl font-bold">בדיקת מייל המכון</h1>
      <p className="mt-3 text-sm leading-7 text-slate-600">הבדיקה משתמשת בחיבור המייל של האתר. היא אינה יוצרת תור, אינה כוללת פרטי מטופלים ואינה מפעילה הודעות אוטומטיות להורים.</p>
    </div>
    <dl className="space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
      <div><dt className="font-bold">שולח</dt><dd dir="ltr" className="mt-1 break-all text-right">{OWNER_MAIL_TEST.sender}</dd></div>
      <div><dt className="font-bold">נמען יחיד</dt><dd dir="ltr" className="mt-1 break-all text-right">{OWNER_MAIL_TEST.to}</dd></div>
      <div><dt className="font-bold">נושא</dt><dd className="mt-1">{OWNER_MAIL_TEST.subject}</dd></div>
    </dl>
    <div className="rounded-xl border border-slate-200 p-4">
      <h2 className="mb-2 text-sm font-bold">תוכן ההודעה שאושר</h2>
      <p className="whitespace-pre-line text-sm leading-7">{OWNER_MAIL_TEST.body}</p>
    </div>
    <p role="status" aria-live="polite" data-testid="mail-test-status" className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm leading-7 text-teal-950">
      {state === 'loading' ? 'בודק את מצב הבדיקה…' : MAIL_TEST_LABELS[state] ?? MAIL_TEST_LABELS.unknown}
      {!configured && ['not_requested', 'pending'].includes(state) && ` ${MAIL_TEST_LABELS.not_configured}`}
    </p>
    <label className="flex items-start gap-3 text-sm leading-6">
      <input type="checkbox" checked={reviewed} disabled={busy || !canSend}
        onChange={event => setReviewed(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-teal-700" />
      <span>בדקתי את הנמען ואת הנוסח, ואני מאשר שליחת הודעת בדיקה אחת בלבד.</span>
    </label>
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={busy || !reviewed || !canSend} onClick={send}
        className="rounded-lg bg-teal-700 px-5 py-3 text-sm font-bold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50">שליחת מייל הבדיקה</button>
      <button type="button" disabled={busy} onClick={refresh}
        className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-bold hover:bg-slate-50 disabled:opacity-50">רענון מצב בלבד</button>
    </div>
    <p className="text-xs leading-6 text-slate-600">רענון העמוד אינו שולח מייל. לאחר ניסיון שליחה לא ודאי לא מתבצעת שליחה חוזרת אוטומטית.</p>
  </section>;
}
