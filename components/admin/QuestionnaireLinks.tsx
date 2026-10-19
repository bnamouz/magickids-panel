'use client';
import { useEffect, useState } from 'react';

type LinkState = { token: string | null; expiresAt: string | null };
type Kind = 'parent' | 'teacher';
type Reminder = { at: string; status: string } | null;
export default function QuestionnaireLinks({ sessionId, parent, teacher, parentComplete, teacherComplete, closed, phones, lastReminders }: {
  sessionId: string; parent: LinkState; teacher: LinkState; parentComplete: boolean; teacherComplete: boolean; closed: boolean;
  phones?: { parent: string | null; teacher: string | null }; lastReminders?: { parent: Reminder; teacher: Reminder };
}) {
  const [reminderLang, setReminderLang] = useState<'he' | 'ar'>('he');
  const [reminding, setReminding] = useState<Kind | null>(null);
  const [confirmKind, setConfirmKind] = useState<Kind | null>(null);
  const [reminders, setReminders] = useState(lastReminders ?? { parent: null, teacher: null });
  const [reminderNote, setReminderNote] = useState<Record<Kind, { ok: boolean; text: string; retry?: boolean } | null>>({ parent: null, teacher: null });
  const fmt = (iso: string) => new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' });
  async function remind(kind: Kind, force = false) {
    setReminding(kind); setConfirmKind(null); setReminderNote(n => ({ ...n, [kind]: null }));
    try {
      const res = await fetch('/api/admin/sessions/reminder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, kind, language: reminderLang, force }) });
      const d = await res.json().catch(() => ({}));
      const who = kind === 'parent' ? 'להורה' : 'למורה';
      if (d.status === 'sent') { setReminders(r => ({ ...r, [kind]: { at: new Date().toISOString(), status: 'sent' } })); setReminderNote(n => ({ ...n, [kind]: { ok: true, text: `התזכורת נשלחה ${who} מהוואטסאפ של המכון (054-402-0043) עם קישור להמשך אותו שאלון.` } })); }
      else if (d.status === 'recent') setReminderNote(n => ({ ...n, [kind]: { ok: false, text: `כבר נשלחה תזכורת ${who} ב־${fmt(d.sentAt)}. לשלוח שוב בכל זאת?`, retry: true } }));
      else if (d.status === 'complete') setReminderNote(n => ({ ...n, [kind]: { ok: false, text: 'השאלון כבר הושלם; אין צורך בתזכורת. רעננו את הדף.' } }));
      else if (d.status === 'missing_phone') setReminderNote(n => ({ ...n, [kind]: { ok: false, text: `אין מספר נייד תקין ${who} בתיק. הוסיפו מספר בעריכת הפרטים ונסו שוב.` } }));
      else if (d.status === 'closed') setReminderNote(n => ({ ...n, [kind]: { ok: false, text: 'התיק סגור; לא נשלחות תזכורות מתיק סגור.' } }));
      else if (d.status === 'unknown') setReminderNote(n => ({ ...n, [kind]: { ok: false, text: 'תוצאת השליחה אינה ודאית. לא לשלוח שוב לפני בדיקה בוואטסאפ של המכון.' } }));
      else setReminderNote(n => ({ ...n, [kind]: { ok: false, text: d.error ? `השליחה נכשלה (${d.error}). אפשר להעתיק את הקישור ולשלוח ידנית.` : 'השליחה נכשלה. אפשר להעתיק את הקישור ולשלוח ידנית.' } }));
    } catch { setReminderNote(n => ({ ...n, [kind]: { ok: false, text: 'אין תקשורת עם השרת.' } })); }
    finally { setReminding(null); }
  }
  const [links, setLinks] = useState({ parent, teacher });
  const [origin, setOrigin] = useState('');
  const [busy, setBusy] = useState<Kind | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => { setOrigin(window.location.hostname === 'localhost' ? window.location.origin : 'https://app.magickidsinstitute.com'); }, []);
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
    {closed && <p className="text-sm mt-2">גם בתיק סגור אפשר לחדש קישור ולהשלים שאלון שטרם נשלח.</p>}
    <div className="grid md:grid-cols-2 gap-4 mt-4">{(['parent', 'teacher'] as const).map(kind => {
      const link = links[kind];
      const expired = !!link.expiresAt && (!Number.isFinite(Date.parse(link.expiresAt)) || Date.parse(link.expiresAt) <= Date.now());
      const url = origin && link.token ? `${origin}/${kind === 'parent' ? 'questionnaire/parent' : 'teacher'}/${encodeURIComponent(link.token)}` : '';
      const complete = kind === 'parent' ? parentComplete : teacherComplete;
      return <div key={kind} className="rounded-lg border border-slate-200 p-4">
        <h3 className="font-semibold">{kind === 'parent' ? 'קישור להורה' : 'קישור למורה'}</h3>
        <p className="text-sm text-slate-500 my-2">{complete ? 'השאלון הושלם ונשלח' : 'ממתין להשלמה'}{expired ? ' · הקישור פג תוקף' : ''}</p>
        {url && !expired && <><input aria-label={kind === 'parent' ? 'כתובת קישור ההורה' : 'כתובת קישור המורה'} className="w-full rounded border p-2 text-sm" dir="ltr" readOnly value={url} onFocus={event => event.currentTarget.select()} /><button type="button" className="btn-primary mt-3" onClick={() => copy(url)}>העתקת קישור {kind === 'parent' ? 'להורה' : 'למורה'}</button><a className="btn-ghost mt-3" href={`https://wa.me/?text=${encodeURIComponent('שלום, זה הקישור האישי למילוי השאלון: ' + url)}`} target="_blank" rel="noopener noreferrer">הכנת הודעת WhatsApp</a><a className="btn-ghost mt-3" href={url} target="_blank" rel="noopener noreferrer">פתיחת הקישור</a></>}
        {(!link.token || expired) && <button type="button" className="btn-primary mt-3" disabled={busy !== null} onClick={() => restore(kind)}>{busy === kind ? 'מכין קישור…' : expired ? 'חידוש הקישור' : 'יצירת קישור'}</button>}
        {!complete && !closed && <div className="mt-4 border-t pt-3 space-y-2">
          <p className="text-sm font-semibold">תזכורת בוואטסאפ מהמערכת {phones?.[kind] ? <span dir="ltr" className="font-normal text-slate-500">{phones[kind]}</span> : <span className="font-normal text-amber-700">אין מספר נייד בתיק</span>}</p>
          <p className="text-xs text-slate-500">נשלחת מהמספר של המכון (054-402-0043) וכוללת את הקישור שמחזיר לאותו שאלון, עם התשובות שכבר נשמרו.{reminders[kind] ? ` תזכורת אחרונה: ${fmt(reminders[kind]!.at)}${reminders[kind]!.status === 'sent' ? '' : ' (נכשלה)'}.` : ''}</p>
          <div className="flex flex-wrap items-center gap-2">
            {(['he', 'ar'] as const).map(l => <button key={l} type="button" onClick={() => setReminderLang(l)} className={`rounded-full border px-3 py-0.5 text-sm ${reminderLang === l ? 'bg-[#01696f] text-white border-[#01696f]' : 'bg-white'}`}>{l === 'he' ? 'עברית' : 'ערבית'}</button>)}
            {confirmKind === kind
              ? <span className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-[#01696f] bg-teal-50 px-3 py-1.5 text-sm"><span>לשלוח תזכורת {kind === 'parent' ? 'להורה' : 'למורה'} אל <b dir="ltr">{phones?.[kind]}</b>?</span><button type="button" className="rounded bg-[#01696f] px-3 py-1 font-semibold text-white" onClick={() => remind(kind)}>כן, לשלוח</button><button type="button" className="underline" onClick={() => setConfirmKind(null)}>ביטול</button></span>
              : <button type="button" className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50" disabled={reminding !== null || !phones?.[kind]} onClick={() => setConfirmKind(kind)}>{reminding === kind ? 'שולח…' : `שליחת תזכורת ${kind === 'parent' ? 'להורה' : 'למורה'}`}</button>}
          </div>
          {reminderNote[kind] && <p role="status" className={`rounded p-2 text-sm ${reminderNote[kind]!.ok ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'}`}>{reminderNote[kind]!.text}{reminderNote[kind]!.retry && <button type="button" className="mr-2 underline font-semibold" disabled={reminding !== null} onClick={() => remind(kind, true)}>כן, לשלוח שוב</button>}</p>}
        </div>}
      </div>;
    })}</div>
    <p role="status" className="text-sm text-[#01696f] mt-3">{message}</p>
  </section>;
}
