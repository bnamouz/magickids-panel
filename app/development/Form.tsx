'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { OriginalPage } from '@/lib/development/official';
import { CONSENT_TEXT } from '@/lib/development/consent';
import OriginalPages from '@/components/development/OriginalPages';
import LegacyForm from './LegacyForm';

type Education = { submitted: boolean; token: string | null; contact_name: string; phone: string; can_save_contact: boolean };
type Info = { legacy?: boolean; role: 'parent' | 'teacher' | 'kindergarten'; child_name: string; education_role: string; pages: OriginalPage[]; answers: Record<string, string>; submitted: boolean; expires_at?: string; education?: Education };
type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
const STORE = 'mk-development-link';
const input = 'block border rounded p-2 w-full';
const linkOf = (t: string) => `${location.origin}/development#${t}`;
/** The device remembers the parent's own link so a questionnaire that was started can be continued without the message that carried it. */
const stored = () => { try { const v = JSON.parse(localStorage.getItem(STORE) || 'null'); return v && /^[a-f0-9]{64}$/.test(v.token) ? v as { token: string; child: string } : null; } catch { return null; } };
const remember = (token: string, child: string) => { try { localStorage.setItem(STORE, JSON.stringify({ token, child })); } catch { /* private mode */ } };
const forget = () => { try { localStorage.removeItem(STORE); } catch { /* private mode */ } };

export default function Form() {
  const [token, setToken] = useState(''), [info, setInfo] = useState<Info | null>(null), [answers, setAnswers] = useState<Record<string, string>>({}), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [teacher, setTeacher] = useState(''), [saved, setSaved] = useState(false), [confirmed, setConfirmed] = useState(false), [loaded, setLoaded] = useState(false);
  const [resumed, setResumed] = useState(false), [device, setDevice] = useState<{ token: string; child: string } | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle'), [savedAt, setSavedAt] = useState('');
  const [contact, setContact] = useState({ name: '', phone: '' }), [contactNote, setContactNote] = useState(''), [copied, setCopied] = useState(false);
  const latest = useRef(answers), dirty = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | null>(null), inflight = useRef<Promise<void> | null>(null), locked = useRef(false), tokenRef = useRef('');
  latest.current = answers; tokenRef.current = token;

  async function load(t: string) {
    const r = await fetch('/api/development/official', { headers: { Authorization: 'Bearer ' + t }, cache: 'no-store' });
    const d = await r.json(); if (!r.ok) throw Error(d.error);
    setToken(t); setInfo(d); setAnswers(d.answers || {}); locked.current = !!d.submitted;
    if (d.education) { setContact({ name: d.education.contact_name || '', phone: d.education.phone ? '0' + String(d.education.phone).slice(4) : '' }); if (d.education.token) setTeacher(linkOf(d.education.token)); }
    if (d.role === 'parent' && !d.legacy) remember(t, d.child_name);
    return d as Info;
  }
  async function open(t: string) {
    setError('');
    try { await load(t); if (location.hash.slice(1) !== t) history.replaceState(null, '', '#' + t); }
    catch {
      if (stored()?.token === t) forget();
      setToken(''); setInfo(null); setDevice(null); history.replaceState(null, '', location.pathname);
      setError('הקישור אינו תקף או שפג תוקפו. הורים: הירשמו שוב עם אותם פרטים ותמשיכו מאותה נקודה, עם התשובות שנשמרו. גננת/מורה: בקשו מההורים או מהמכון קישור מעודכן.');
    }
  }
  useEffect(() => { const t = location.hash.slice(1); if (t) open(t).finally(() => setLoaded(true)); else { setDevice(stored()); setLoaded(true); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const post = async (body: unknown, keepalive = false) => {
    const text = JSON.stringify(body);
    const r = await fetch('/api/development/official', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tokenRef.current }, body: text, keepalive: keepalive && text.length < 60000 });
    const d = await r.json(); if (!r.ok) throw Error(d.error); return d;
  };
  /** Quiet save a moment after the last change, so nothing is lost when the page is closed halfway. */
  async function autosave(leaving = false) {
    if (!dirty.current || locked.current) return;
    if (inflight.current) await inflight.current;
    if (!dirty.current || locked.current) return;
    dirty.current = false; setSaveState('saving');
    const run = post({ answers: latest.current, submit: false }, leaving)
      .then(() => { setSavedAt(new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })); setSaveState(dirty.current ? 'pending' : 'saved'); })
      .catch(() => { dirty.current = true; setSaveState('error'); })
      .finally(() => { inflight.current = null; });
    inflight.current = run; await run;
  }
  function change(id: string, value: string) {
    setAnswers(a => ({ ...a, [id]: value })); setSaved(false); setConfirmed(false);
    dirty.current = true; setSaveState('pending');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { autosave(); }, 2500);
  }
  useEffect(() => {
    const leave = () => { if (document.visibilityState === 'hidden') autosave(true); };
    document.addEventListener('visibilitychange', leave); window.addEventListener('pagehide', leave);
    return () => { document.removeEventListener('visibilitychange', leave); window.removeEventListener('pagehide', leave); if (timer.current) clearTimeout(timer.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function register(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError(''); const f = new FormData(e.currentTarget);
    try {
      const r = await fetch('/api/development/official', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'register', data: { child_name: f.get('child_name'), birth_date: f.get('birth_date'), parent_name: f.get('parent_name'), phone: f.get('phone'), education_role: f.get('education_role'), consent: f.get('consent') === 'on', website: f.get('website') } }) });
      const d = await r.json(); if (!r.ok) throw Error(d.error);
      history.replaceState(null, '', '#' + d.parent_token); await load(d.parent_token); setResumed(!!d.resumed);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  async function save(submit: boolean) {
    setBusy(true); setError(''); setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    if (inflight.current) await inflight.current;
    try {
      if (submit) locked.current = true;
      const d = await post({ answers: latest.current, submit, confirmed });
      dirty.current = false; setSaveState('idle'); setSaved(true);
      if (submit) { const fresh = await load(tokenRef.current).catch(() => null); if (!fresh) setInfo(i => i && { ...i, submitted: true }); if (d.education_token && !fresh?.education?.token) setTeacher(linkOf(d.education_token)); }
    } catch (e: any) { if (submit) locked.current = false; setError(e.message); } finally { setBusy(false); }
  }
  async function saveContact(e: FormEvent) {
    e.preventDefault(); setBusy(true); setContactNote('');
    try { const d = await post({ action: 'education_contact', data: contact }); setContact({ name: d.contact_name, phone: d.phone ? '0' + String(d.phone).slice(4) : '' }); setContactNote('הפרטים נשמרו. אם השאלון לא יושלם, המכון יוכל לשלוח תזכורת.'); }
    catch (e: any) { setContactNote(e.message); } finally { setBusy(false); }
  }

  if (info?.legacy) return <LegacyForm />;
  const educator = info?.education_role === 'teacher' ? 'המורה' : 'הגננת';
  const shareDigits = /^0?5\d{8}$/.test(contact.phone.replace(/\D/g, '')) ? '972' + contact.phone.replace(/\D/g, '').replace(/^0/, '') : '';
  const shareText = info ? `שלום${contact.name.trim() ? ' ' + contact.name.trim().split(/\s+/)[0] : ''}, אנחנו ההורים של ${info.child_name}. נשמח שתמלא/י את שאלון ${educator} של מכבי להתפתחות הילד בקישור האישי הבא:\n${teacher}\nתודה רבה.` : '';
  const until = info?.expires_at && Number.isFinite(Date.parse(info.expires_at)) ? new Date(info.expires_at).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '';

  return <>
    {error && <p role="alert" className="bg-red-50 p-3 rounded mb-3">{error}</p>}
    {!loaded ? <p>טוען…</p> : !token ? <>
      {device && <div className="mb-5 rounded-xl border border-teal-700 bg-teal-50 p-4 space-y-3">
        <p className="font-bold">במכשיר זה נשמר שאלון שהתחלתם למלא{device.child ? ` עבור ${device.child}` : ''}.</p>
        <div className="flex flex-wrap items-center gap-3"><button type="button" className="btn-primary" onClick={() => open(device.token)}>המשך מילוי השאלון</button><button type="button" className="underline text-sm p-2" onClick={() => { forget(); setDevice(null); }}>הסרה מהמכשיר</button></div>
      </div>}
      <form onSubmit={register} className="space-y-4">
        <h2 className="text-xl font-bold">הרשמה והפקת קישור אישי לשאלון הורים</h2>
        <p>המערכת תבחר את ערכת מכבי שצורפה למכון לפי תאריך הלידה: עד גיל שנה או גילאי 1–6. לאחר השלמת שאלון ההורים תוכלו להעביר קישור נפרד למסגרת. אם הילד אינו במסגרת, הפנייה תעבור לבדיקת הרופא ללא שאלון מסגרת.</p>
        <p className="text-sm rounded bg-slate-50 p-3">כבר נרשמתם ולא סיימתם? הירשמו שוב עם אותם פרטים (שם הילד/ה, תאריך הלידה והנייד) ותמשיכו מאותה נקודה, עם התשובות שנשמרו.</p>
        <fieldset disabled={busy} className="space-y-3">
          {[['child_name', 'שם הילד/ה', 'text'], ['birth_date', 'תאריך לידה', 'date'], ['parent_name', 'שם ההורה', 'text'], ['phone', 'נייד ההורה', 'tel']].map(([name, label, type]) => <label key={name} className="block">{label}<input required name={name} type={type} maxLength={100} className={input} /></label>)}
          <label className="block">מסגרת חינוכית<select name="education_role" className={input}><option value="kindergarten">מעון / גן</option><option value="teacher">בית ספר</option><option value="none">אינו במסגרת</option></select></label>
          <input className="hidden" name="website" tabIndex={-1} autoComplete="off" />
          <label className="block"><input type="checkbox" name="consent" required /> {CONSENT_TEXT}</label>
          <button className="btn-primary">{busy ? 'פותח…' : 'הרשמה וקבלת קישור לשאלון'}</button>
        </fieldset>
      </form>
    </> : info && <>
      <h2 className="text-xl my-3">{info.child_name} · {info.role === 'parent' ? 'שאלון הורים' : info.role === 'teacher' ? 'שאלון מורה' : 'שאלון גננת'}</h2>
      {resumed && <p role="status" className="rounded bg-teal-50 border border-teal-200 p-3 my-3">נמצאה פנייה פתוחה עם אותם פרטים, ולכן לא נפתחה פנייה נוספת. ממשיכים מאותה נקודה, עם התשובות שנשמרו.</p>}
      <p>עמודי ערכת מכבי המקורית עם שדות מילוי. הנוסח והאפשרויות מופיעים בעמודים ללא שינוי. יש למלא את כל הפרטים הרלוונטיים ולבדוק את החתימות.</p>
      <details className="my-4"><summary>הקישור האישי לחזרה לשאלון — שמרו אצלכם</summary><input readOnly value={typeof location === 'undefined' ? '' : linkOf(token)} className={input} dir="ltr" onFocus={e => e.currentTarget.select()} /></details>
      {info.submitted ? <div className="bg-teal-50 p-4 rounded-xl space-y-3">
        <h3 className="font-bold">השאלון נשמר ונשלח לבדיקת המכון</h3>
        {info.role !== 'parent' ? <p>תודה רבה. אין צורך בפעולה נוספת.</p>
          : info.education_role === 'none' ? <p>סומן שהילד אינו במסגרת. הפנייה ממתינה לבדיקת הרופא.</p>
          : info.education?.submitted ? <p>שאלון {educator} הושלם. הפנייה ממתינה לבדיקת הרופא, והמכון ייצור קשר להמשך.</p>
          : teacher ? <>
            <p className="font-semibold">השלב הבא: שאלון {educator}</p>
            <p>העבירו את הקישור הבא ל{educator.slice(1)} בלבד. אפשר לחזור לדף זה בכל עת כדי למצוא אותו שוב ולראות אם השאלון הושלם.</p>
            <input readOnly aria-label="קישור לשאלון המסגרת" value={teacher} className={input + ' bg-white'} dir="ltr" onFocus={e => e.currentTarget.select()} />
            {info.education?.can_save_contact && <form onSubmit={saveContact} className="rounded-lg bg-white border p-3 space-y-2">
              <p className="text-sm">לא חובה: שם ונייד של {educator}. כך ההודעה תיפתח ישירות מולה, והמכון יוכל לשלוח לה תזכורת אם השאלון לא יושלם.</p>
              <div className="grid gap-2 sm:grid-cols-2"><label className="block text-sm">שם {educator}<input className={input} maxLength={100} value={contact.name} onChange={e => setContact(c => ({ ...c, name: e.target.value }))} /></label><label className="block text-sm">נייד<input className={input} type="tel" dir="ltr" maxLength={20} value={contact.phone} onChange={e => setContact(c => ({ ...c, phone: e.target.value }))} /></label></div>
              <button className="border border-teal-800 text-teal-900 rounded px-4 py-2 disabled:opacity-50" disabled={busy}>שמירת הפרטים</button>
              {contactNote && <p role="status" className="text-sm">{contactNote}</p>}
            </form>}
            <div className="flex flex-wrap gap-3">
              <a className="rounded-lg bg-green-600 px-5 py-3 font-semibold text-white hover:bg-green-700" href={`https://wa.me/${shareDigits}?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer">שליחה בוואטסאפ ל{educator.slice(1)}</a>
              <button type="button" className="rounded-lg border border-teal-800 px-5 py-3 font-semibold text-teal-900" onClick={() => navigator.clipboard.writeText(teacher).then(() => setCopied(true), () => setError('העתיקו מהשדה'))}>{copied ? 'הקישור הועתק' : 'העתקת קישור למסגרת'}</button>
            </div>
          </> : <p>אם קישור המסגרת אינו אצלכם, ניתן להפיק קישור חדש דרך צוות המכון.</p>}
      </div> : <form onSubmit={e => { e.preventDefault(); save(true); }}>
        <p className="text-sm my-3">בנייד ניתן לגלול לרוחב ולהגדיל את העמוד. התשובות נשמרות אוטומטית תוך כדי מילוי, ואפשר לסגור את הדף ולחזור לאותו קישור כדי להמשיך.{until ? ` הקישור תקף עד ${until}.` : ' הקישור תקף ל־30 יום.'}</p>
        <OriginalPages pages={info.pages} answers={answers} onChange={change} disabled={busy} />
        <label className="block"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} required /> עברתי על כל העמודים, השלמתי את הפרטים הרלוונטיים ואת החתימות, ואני מאשר/ת את העברת דיווחי לצוות המכון. השאלון יינעל לאחר השליחה.</label>
        <div className="flex flex-wrap gap-4 my-4"><button className="border p-3 rounded" type="button" disabled={busy} onClick={() => save(false)}>שמירת טיוטה</button><button className="btn-primary" disabled={busy || !confirmed}>{busy ? 'שומר…' : 'אישור ושליחת השאלון למכון'}</button></div>
        <p role="status" className="text-sm min-h-[1.5rem]">{saved ? 'הטיוטה נשמרה' : saveState === 'saving' ? 'שומר…' : saveState === 'saved' ? `נשמר אוטומטית בשעה ${savedAt}` : saveState === 'pending' ? 'יש שינויים שיישמרו מיד' : saveState === 'error' ? 'השמירה האוטומטית לא הצליחה. בדקו את החיבור ולחצו "שמירת טיוטה".' : ''}</p>
      </form>}
    </>}
  </>;
}
