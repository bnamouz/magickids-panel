'use client';
import { useEffect, useState } from 'react';

type LinkState = { token: string | null; expiresAt: string | null };
type Kind = 'parent' | 'teacher';
export default function QuestionnaireLinks({ sessionId, parent, teacher, parentComplete, teacherComplete, closed }: {
  sessionId: string; parent: LinkState; teacher: LinkState; parentComplete: boolean; teacherComplete: boolean; closed: boolean;
}) {
  const [links, setLinks] = useState({ parent, teacher });
  const [origin, setOrigin] = useState('');
  const [busy, setBusy] = useState<Kind | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => { setOrigin(window.location.origin); }, []);
  async function restore(kind: Kind) {
    setBusy(kind); setMessage('');
    try {
      const res = await fetch('/api/admin/sessions/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, kind }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'לא ניתן להכין את הקישור');
      setLinks(current => ({ ...current, [kind]: data }));
      setMessage('הקישור מוכן להעתקה');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'אירעה שגיאה'); }
    finally { setBusy(null); }
  }
  async function copy(url: string) {
    try { await navigator.clipboard.writeText(url); setMessage('הקישור הועתק'); }
    catch { setMessage('לא ניתן להעתיק אוטומטית. סמנו את הקישור בשדה והעתיקו אותו.'); }
  }
  return <section className="card mb-6" aria-labelledby="questionnaire-links">
    <h2 id="questionnaire-links" className="font-bold text-[#01696f]">קישורים להורה ולמורה</h2>
    <p className="text-sm text-slate-500 mt-2">אפשר להעתיק שוב בכל עת. הקישור מחזיר לאותו תיק ולתשובות שכבר נשמרו, ללא רישום מחדש.</p>
    <div className="grid md:grid-cols-2 gap-4 mt-4">{(['parent', 'teacher'] as const).map(kind => {
      const link = links[kind];
      const expired = !!link.expiresAt && (!Number.isFinite(Date.parse(link.expiresAt)) || Date.parse(link.expiresAt) <= Date.now());
      const url = origin && link.token ? `${origin}/${kind === 'parent' ? 'questionnaire/parent' : 'teacher'}/${encodeURIComponent(link.token)}` : '';
      const complete = kind === 'parent' ? parentComplete : teacherComplete;
      return <div key={kind} className="rounded-lg border border-slate-200 p-4">
        <h3 className="font-semibold">{kind === 'parent' ? 'קישור להורה' : 'קישור למורה'}</h3>
        <p className="text-sm text-slate-500 my-2">{complete ? 'השאלון הושלם ונשלח' : 'ממתין להשלמה'}{expired ? ' · הקישור פג תוקף' : ''}</p>
        {url && !expired && <><input aria-label={kind === 'parent' ? 'כתובת קישור ההורה' : 'כתובת קישור המורה'} className="w-full rounded border p-2 text-sm" dir="ltr" readOnly value={url} onFocus={event => event.currentTarget.select()} /><button type="button" className="btn-primary mt-3" onClick={() => copy(url)}>העתקת קישור {kind === 'parent' ? 'להורה' : 'למורה'}</button></>}
        {(!link.token || expired) && !closed && <button type="button" className="btn-primary mt-3" disabled={busy !== null || (kind === 'teacher' && !parentComplete)} onClick={() => restore(kind)}>{busy === kind ? 'מכין קישור…' : expired ? 'חידוש הקישור' : 'יצירת קישור'}</button>}
        {kind === 'teacher' && !link.token && !parentComplete && <p className="text-sm mt-2">קישור המורה יהיה זמין לאחר השלמת שאלון ההורה.</p>}
        {closed && (!link.token || expired) && <p className="text-sm">התיק סגור. לא ניתן לחדש קישור.</p>}
      </div>;
    })}</div>
    <p role="status" className="text-sm text-[#01696f] mt-3">{message}</p>
  </section>;
}
