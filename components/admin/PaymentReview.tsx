'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const WA: Record<string, string> = { accepted: 'נשלחה הודעת וואטסאפ להורה.', failed: 'הודעת הוואטסאפ לא נשלחה — העבירו את הקישור ידנית.', unknown: 'לא ודאי שהוואטסאפ נשלח — בדקו או העבירו ידנית.', not_configured: 'וואטסאפ המכון לא מחובר — העבירו את הקישור ידנית.' };

export default function PaymentReview({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [link, setLink] = useState('');
  async function call(action: 'proof' | 'approve' | 'reject', note?: string) {
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/admin/adhd-payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id, note }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(d.error === 'already_booked' ? 'כבר נקבע תור לבקשה הזו.' : 'הפעולה לא הצליחה. נסו שוב.'); return; }
      if (action === 'proof') { window.open(d.url, '_blank', 'noopener'); return; }
      if (d.link) setLink(d.link);
      setMsg(WA[d.whatsapp] ?? 'בוצע.');
      router.refresh();
    } catch { setMsg('הפעולה לא הצליחה. נסו שוב.'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-2">
    <div className="flex flex-wrap gap-2">
      <button className="btn-ghost" disabled={busy} onClick={() => call('proof')}>צפייה באסמכתה</button>
      {(status === 'pending' || status === 'approved') && <button className="btn-primary" disabled={busy} onClick={() => { if (confirm(status === 'approved' ? 'לשלוח להורה קישור חדש? הקישור הקודם יבוטל.' : 'לאשר שהתשלום התקבל ולשלוח להורה קישור לקביעת תור?')) call('approve'); }}>{status === 'approved' ? 'שליחת קישור חדש' : 'אישור תשלום ושליחת קישור'}</button>}
      {status === 'pending' && <button className="btn-ghost text-red-700" disabled={busy} onClick={() => { const note = prompt('סיבת הדחייה שתישלח להורה (לא חובה):', 'התשלום לא התקבל בחשבון.'); if (note !== null) call('reject', note); }}>דחייה</button>}
    </div>
    {msg && <p className="text-sm font-bold text-teal-900">{msg}</p>}
    {link && <p className="break-all rounded bg-slate-50 p-2 text-xs" dir="ltr">{link}</p>}
  </div>;
}
