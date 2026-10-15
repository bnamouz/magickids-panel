'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const categories = { general: 'כללי', clinical: 'קליני', follow_up: 'מעקב', flag: 'דגל אדום' };
type Category = keyof typeof categories;
type Note = { id: string; staff_id: string; content: string; category: Category; version?: number;
  created_at: string; updated_at?: string; voided_at?: string | null; void_reason?: string | null;
  staff_users?: { full_name: string } | null };
type Revision = { id: number; version: number; content: string; category: Category; changed_at: string;
  reason: string; action: string; staff_users?: { full_name: string } | { full_name: string }[] | null };
type Change = { note: Note; action: 'edit' | 'void'; content: string; category: Category; reason: string };
const date = (value: string) => new Date(value).toLocaleString('he-IL-u-nu-latn', { timeZone: 'Asia/Jerusalem' });

export default function ClinicalNotes({ sessionId, notes, currentStaffId, isAdmin = false }: {
  sessionId: string; notes: Note[]; currentStaffId: string; isAdmin?: boolean;
}) {
  const router = useRouter();
  const [content, setContent] = useState(''), [category, setCategory] = useState<Category>('general');
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [change, setChange] = useState<Change | null>(null);
  const [showVoided, setShowVoided] = useState(false);
  const [history, setHistory] = useState<Record<string, Revision[]>>({});
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);
  const [historyBusy, setHistoryBusy] = useState<string | null>(null);
  const pendingCreate = useRef<string | null>(null);
  async function save(body: unknown, method: 'POST' | 'PATCH') {
    if (busy || uncertain) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/notes', {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status >= 500 || response.status === 409) setUncertain(true);
        throw new Error(result.error || 'לא ניתן לשמור את הפעולה.');
      }
      if (!result.ok) { setUncertain(true); throw new Error('תוצאת השמירה אינה ודאית. יש לרענן את התיק.'); }
      if (method === 'POST') { setContent(''); pendingCreate.current = null; }
      setChange(null); setHistory({}); setHistoryOpen(null);
      setNotice('הפעולה נשמרה עם תיעוד בהיסטוריית התיק.'); router.refresh();
    } catch (e) {
      if (!(e instanceof Error) || e instanceof TypeError) setUncertain(true);
      // A JSON parse failure after a request is an ambiguous write too.
      if (e instanceof SyntaxError) setUncertain(true);
      setError(e instanceof Error ? e.message : 'אין אישור לשמירה. יש לרענן את התיק.');
    } finally { setBusy(false); }
  }
  function add() {
    if (!content.trim()) return;
    pendingCreate.current ??= crypto.randomUUID();
    void save({ id: pendingCreate.current, session_id: sessionId, content, category }, 'POST');
  }
  async function loadHistory(id: string) {
    if (historyBusy) return;
    if (historyOpen === id) { setHistoryOpen(null); return; }
    setHistoryBusy(id); setError('');
    try {
      const response = await fetch(`/api/admin/notes?id=${id}&session_id=${sessionId}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.revisions)) throw new Error('לא ניתן לטעון היסטוריה. נסו שוב.');
      setHistory(h => ({ ...h, [id]: result.revisions })); setHistoryOpen(id);
    } catch { setError('לא ניתן לטעון היסטוריה. אין בכך אישור שאין גרסאות קודמות.'); }
    finally { setHistoryBusy(null); }
  }
  const voided = notes.filter(n => n.voided_at);
  return <section className="card space-y-5 scroll-mt-24" id="clinical-notes" dir="rtl">
    <header><h2 className="text-lg font-bold text-slate-800">ממצאים והערות קליניות</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">אפשר לערוך או לבטל הערה שלך; מנהל יכול לשנות כל הערה. ביטול שומר את המקור ואת סיבת הביטול, ומוציא את ההערה מדוחות חדשים. דוחות קיימים אינם משתנים.</p></header>
    <fieldset disabled={busy || uncertain} className="space-y-3">
      <label className="block text-sm font-semibold">סוג הממצא
        <select value={category} onChange={e => setCategory(e.target.value as Category)} className="mr-2 rounded-lg border p-2">
          {Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
      <label className="block text-sm font-semibold">הוספת ממצא או הערה
        <textarea value={content} onChange={e => setContent(e.target.value)} maxLength={5000} rows={3}
          className="mt-2 w-full rounded-lg border border-slate-300 p-3 font-normal" /></label>
      <button type="button" onClick={add} disabled={!content.trim()} className="btn-primary disabled:opacity-50">שמירת הערה חדשה</button>
    </fieldset>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-teal-50 p-3 text-sm text-teal-900">{notice}</p>}
    {uncertain && <div className="rounded-lg border border-amber-200 p-3 text-sm">
      <p>פעולות השמירה נעצרו כדי למנוע כפילות או דריסת שינוי. רעננו ובדקו את ההערות לפני המשך.</p>
      <button type="button" className="mt-2 underline" onClick={() => window.location.reload()}>רענון התיק ובדיקת המצב</button>
    </div>}
    {!!voided.length && <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={showVoided} onChange={e => setShowVoided(e.target.checked)} />
      הצגת ממצאים שבוטלו ({voided.length})
    </label>}
    {!notes.some(n => !n.voided_at) && <p className="text-sm text-slate-500">אין ממצאים פעילים להצגה.</p>}
    <ul className="space-y-4">
      {notes.filter(n => !n.voided_at || showVoided).map(n => {
        const canChange = !n.voided_at && (isAdmin || currentStaffId === n.staff_id);
        const editing = change?.note.id === n.id ? change : null;
        return <li key={n.id} className={`rounded-xl border p-4 ${n.voided_at ? 'border-slate-300 bg-slate-50' : 'border-slate-200'}`}>
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <b>{categories[n.category]}{n.voided_at ? ' · מבוטל' : ''}</b>
            <span className="text-slate-500">{n.staff_users?.full_name || 'צוות המכון'} · {date(n.created_at)}</span>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{n.content}</p>
          {n.voided_at && <p className="mt-2 text-sm text-slate-600">בוטל ב־{date(n.voided_at)}. סיבה: {n.void_reason}</p>}
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            {canChange && <>
              <button type="button" disabled={busy || uncertain} className="font-semibold text-teal-800 underline disabled:opacity-50"
                onClick={() => { setChange({ note: n, action: 'edit', content: n.content, category: n.category, reason: '' }); setError(''); }}>עריכת הממצא</button>
              <button type="button" disabled={busy || uncertain} className="text-red-800 underline disabled:opacity-50"
                onClick={() => { setChange({ note: n, action: 'void', content: n.content, category: n.category, reason: '' }); setError(''); }}>ביטול הממצא</button>
            </>}
            <button type="button" disabled={!!historyBusy} className="text-slate-700 underline"
              aria-expanded={historyOpen === n.id} onClick={() => loadHistory(n.id)}>{historyBusy === n.id ? 'טוען היסטוריה…' : 'היסטוריית שינויים'}</button>
          </div>
          {editing && <form className="mt-4 space-y-3 rounded-lg border border-teal-200 bg-teal-50 p-4"
            onSubmit={e => { e.preventDefault(); void save({ action: editing.action, session_id: sessionId, id: n.id,
              version: editing.note.version ?? 0, reason: editing.reason,
              ...(editing.action === 'edit' ? { content: editing.content, category: editing.category } : {}) }, 'PATCH'); }}>
            <h3 className="font-bold">{editing.action === 'edit' ? 'עריכת ממצא עם שמירת המקור' : 'אישור ביטול ממצא'}</h3>
            <fieldset disabled={busy || uncertain} className="space-y-3">
              {editing.action === 'edit' ? <>
                <label className="block text-sm">סוג מעודכן
                  <select className="mr-2 rounded border p-2" value={editing.category} onChange={e => setChange({ ...editing, category: e.target.value as Category })}>
                    {Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select></label>
                <label className="block text-sm">תוכן מעודכן
                  <textarea required maxLength={5000} rows={4} className="mt-1 w-full rounded border p-3" value={editing.content}
                    onChange={e => setChange({ ...editing, content: e.target.value })} /></label>
              </> : <p className="text-sm leading-6">הממצא יוסר מהתצוגה הפעילה ולא ישמש להפקת דוחות חדשים. המקור יישאר בהיסטוריה; אין זו מחיקה לצמיתות.</p>}
              <label className="block text-sm">סיבת {editing.action === 'edit' ? 'העריכה' : 'הביטול'} (חובה)
                <textarea required minLength={3} maxLength={1000} rows={2} className="mt-1 w-full rounded border p-3"
                  value={editing.reason} onChange={e => setChange({ ...editing, reason: e.target.value })} /></label>
              <div className="flex flex-wrap gap-3">
                <button type="submit" disabled={editing.reason.trim().length < 3 || (editing.action === 'edit' && !editing.content.trim())}
                  className="btn-primary disabled:opacity-50">{editing.action === 'edit' ? 'שמירת הממצא המעודכן' : 'אישור ביטול ושמירת היסטוריה'}</button>
                <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm" onClick={() => setChange(null)}>חזרה ללא שינוי</button>
              </div>
            </fieldset>
          </form>}
          {historyOpen === n.id && <div className="mt-4 space-y-3 border-t pt-3">
            <h3 className="text-sm font-bold">גרסאות קודמות</h3>
            {!history[n.id]?.length && <p className="text-sm text-slate-500">לא נרשמו שינויים מאז הוספת ההערה.</p>}
            {history[n.id]?.map(r => <div key={r.id} className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-semibold">גרסה {r.version} לפני {r.action === 'void' ? 'ביטול' : 'עריכה'} · {date(r.changed_at)}</p>
              <p>בוצע על ידי: {(Array.isArray(r.staff_users) ? r.staff_users[0] : r.staff_users)?.full_name || 'צוות המכון'}</p>
              <p>סיבה: {r.reason}</p><p className="mt-2 whitespace-pre-wrap leading-6">{r.content}</p>
            </div>)}
          </div>}
        </li>;
      })}
    </ul>
  </section>;
}
