'use client';
import { useState } from 'react';

type Preview = { failed_before: number; patients: number; phones: number; already_sent: number; pending: number; this_round: number; max_per_round: number; no_mobile: number; opted_out: number; sample: string | null };
const FILTER_LABEL: Record<string, string> = { '': 'כל המטופלים', upcoming: 'מטופלים עם ביקור קרוב', hw: 'חסרי גובה ומשקל', review: 'מטופלים לבדיקה' };

export default function ClinicBroadcast({ filter, sender, connected }: { filter: { f: string; q: string }; sender: string; connected: boolean }) {
  const [open, setOpen] = useState(false), [text, setText] = useState('שלום, כאן מרפאת הילדים של ד״ר בסים נמוז.\nלגבי {שם}: ');
  const [preview, setPreview] = useState<Preview | null>(null), [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [progress, setProgress] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const audience = `${FILTER_LABEL[filter.f] ?? 'המטופלים המסוננים'}${filter.q ? ` · חיפוש: "${filter.q}"` : ''}`;
  const call = async (body: unknown) => { const r = await fetch('/api/admin/clinic-patients/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; };
  const notConnected = !connected;

  async function check() { setBusy(true); setStatus(''); try { setPreview(await call({ action: 'preview', filter, text })); } catch { setStatus('לא ניתן לחשב את רשימת הנמענים. נסו שוב.'); } finally { setBusy(false); } }
  async function send() {
    if (!preview?.this_round) return;
    if (prompt(`לשלוח עכשיו ${preview.this_round} הודעות וואטסאפ מהמספר ${sender}?\nלאישור הקלידו: שלח`) !== 'שלח') return;
    setBusy(true); setStatus(''); let round = 0, sent = 0, failed = 0;
    setProgress({ sent: 0, failed: 0, total: preview.this_round });
    try {
      for (;;) {
        const d = await call({ action: 'send_batch', filter, text, round_sent: round, confirmed: true });
        round = d.round_sent; sent += d.sent; failed += d.failed; setProgress({ sent, failed, total: preview.this_round });
        if (d.stop) { setStatus('השליחה נעצרה אוטומטית: הוואטסאפ שלך דחה כמה הודעות ברצף (ייתכן שהחיבור התנתק או שהמספר הוגבל). בדקו בטלפון שהוואטסאפ פתוח ומחובר. אחר כך אפשר להמשיך באותה הודעה — מי שכבר קיבל לא יקבל שוב, ומי שנכשל יקבל בניסיון הבא.'); break; }
        if (d.round_done) { setStatus(d.remaining_total > 0 ? `נשלחו ${sent} הודעות בסבב הזה. נותרו ${d.remaining_total} מספרים. כדי להמשיך, לחצו שוב "בדיקת נמענים" עם אותה הודעה (מומלץ סבב אחד ביום).` : `הסתיים. נשלחו ${sent} הודעות${failed ? `, ${failed} לא אושרו` : ''}.`); break; }
      }
    } catch { setStatus(`השליחה נקטעה אחרי ${sent} הודעות. לחצו שוב "בדיקת נמענים" עם אותה הודעה כדי להמשיך. מי שכבר קיבל לא יקבל שוב.`); }
    finally { setBusy(false); setPreview(null); }
  }

  if (!open) return <button className="btn-ghost" onClick={() => setOpen(true)}>שליחת הודעה כללית בוואטסאפ</button>;
  return <div className="card space-y-3 border-emerald-200">
    <h2 className="text-xl font-bold">הודעה כללית בוואטסאפ</h2>
    <p className="text-sm text-slate-700">נמענים: <b>{audience}</b>. כדי לשלוח לקבוצה אחרת, בחרו לשונית או חפשו לפני הפתיחה.</p>
    <ul className="list-disc space-y-1 pr-5 text-sm text-slate-600">
      <li>נשלח מהוואטסאפ שלך {sender}, הודעה אחת לכל מספר נייד. אחים עם אותו מספר יקבלו הודעה אחת עם כל השמות.</li>
      <li>במקום <b>{'{שם}'}</b> יופיע שם הילד. לא נשלח למספרים שאינם ניידים או למי שסומן "לא לשלוח הודעות כלליות".</li>
      <li>עד {500} מספרים בכל סבב. הודעה זהה לאותה קבוצה לעולם לא תישלח פעמיים לאותו מספר.</li>
    </ul>
    <textarea dir="auto" rows={5} maxLength={1000} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2" value={text} onChange={e => { setText(e.target.value); setPreview(null); }} />
    {preview && <div className="rounded-lg bg-slate-50 p-3 text-sm">
      <p><b>{preview.this_round}</b> הודעות יישלחו בסבב הזה · {preview.phones} מספרים ניידים מתוך {preview.patients} מטופלים{preview.already_sent ? ` · ${preview.already_sent} כבר קיבלו` : ''}{preview.no_mobile ? ` · ${preview.no_mobile} בלי נייד` : ''}{preview.opted_out ? ` · ${preview.opted_out} ביקשו הסרה` : ''}</p>
      {preview.failed_before > 0 && <p className="mt-1 text-amber-800">{preview.failed_before} הודעות נכשלו בניסיון קודם ולא הגיעו. הן כלולות בסבב הזה.</p>}
      {preview.sample && <p className="mt-2 whitespace-pre-wrap rounded bg-white p-2 text-slate-800">דוגמה: {preview.sample}</p>}
    </div>}
    {progress && <p role="status" className="text-sm">נשלחו {progress.sent} מתוך {progress.total}{progress.failed ? ` · ${progress.failed} לא אושרו` : ''}</p>}
    {notConnected && <p className="text-sm font-bold text-amber-800">השליחה חסומה עד שהוואטסאפ של {sender} יחובר.</p>}
    {status && <p role="status" className="text-sm font-bold text-teal-800">{status}</p>}
    <div className="flex flex-wrap gap-3">
      <button disabled={busy || text.trim().length < 2} className="btn-ghost" onClick={check}>בדיקת נמענים</button>
      <button disabled={busy || !connected || !preview?.this_round} className="btn-primary" onClick={send}>שליחה</button>
      <button disabled={busy} className="underline" onClick={() => { setOpen(false); setPreview(null); }}>סגירה</button>
    </div>
  </div>;
}
