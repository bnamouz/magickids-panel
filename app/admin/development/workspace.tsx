'use client';
import { useEffect, useState, type FormEvent } from 'react';
import CaseWhatsAppButton from '@/components/admin/CaseWhatsAppButton';
import OriginalPages from '@/components/development/OriginalPages';
import type { OriginalPage } from '@/lib/development/official';

const states: Record<string, string> = { parent: 'ממתין להורה', education: 'ממתין למסגרת', review: 'לבדיקת רופא', uploading: 'העלאת מסמך', approved: 'מאושר לשליחה', sending: 'בשליחה', accepted: 'התקבל אצל ספק הדואר — מסירה לא אומתה', unknown: 'מצב שליחה לא ידוע — נדרשת בדיקה', delivered: 'נמסר', bounced: 'נדחה' };
const kinds: Record<string, string> = { parent_original: 'שאלון מכבי מלא — הורה', education_original: 'שאלון מכבי מלא — מסגרת', referral: 'הפניה רפואית', consent: 'הסכמה חתומה' };
const settings: Record<string, string> = { kindergarten: 'מעון / גן', teacher: 'בית ספר', none: 'אינו במסגרת' };
const filters: { key: string; label: string; match: (s: string) => boolean }[] = [
  { key: 'all', label: 'הכל', match: () => true },
  { key: 'parent', label: 'ממתין להורה', match: s => s === 'parent' },
  { key: 'education', label: 'ממתין למסגרת', match: s => s === 'education' },
  { key: 'review', label: 'לבדיקת רופא', match: s => s === 'review' || s === 'uploading' },
  { key: 'approved', label: 'מאושר לשליחה', match: s => s === 'approved' || s === 'sending' },
  { key: 'sent', label: 'נשלח', match: s => s === 'accepted' || s === 'delivered' },
  { key: 'check', label: 'דורש בדיקה', match: s => !['parent', 'education', 'review', 'uploading', 'approved', 'sending', 'accepted', 'delivered'].includes(s) },
];
type Role = 'parent' | 'education';
type Note = { ok: boolean; text: string; retry?: boolean } | null;
type Step = { key: string; label: string; state: 'done' | 'current' | 'todo' | 'skipped' };
const input = 'w-full border rounded-lg p-3', btn = 'rounded-lg bg-teal-800 text-white px-4 py-2 disabled:opacity-40', ghost = 'rounded-lg border border-teal-800 text-teal-900 px-4 py-2 disabled:opacity-40';
const when = (iso: string) => new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' });
const daysAgo = (iso: string) => { const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000); return d <= 0 ? 'נפתח היום' : d === 1 ? 'נפתח אתמול' : `נפתח לפני ${d} ימים`; };
const SENT = ['sending', 'accepted', 'unknown'];
const local = (p?: string | null) => !p ? '' : /^\+9725\d{8}$/.test(p) ? `0${p.slice(4, 6)}-${p.slice(6, 9)}-${p.slice(9)}` : p;

export default function Workspace({ editable }: { editable: boolean }) {
  const [cases, setCases] = useState<any[]>([]), [record, setRecord] = useState<any>(null), [documents, setDocuments] = useState<any[]>([]), [ready, setReady] = useState(false), [destination, setDestination] = useState(''), [recipients, setRecipients] = useState<Record<string, { email: string; label: string }>>({}), [recipient, setRecipient] = useState('all'), [packetFiles, setPacketFiles] = useState<{ name: string; label: string }[]>([]), [picked, setPicked] = useState<string[]>([]), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [link, setLink] = useState(''), [summary, setSummary] = useState(''), [confirmed, setConfirmed] = useState(false);
  const [extra, setExtra] = useState<{ followup: boolean; links: Record<Role, string | null> | null; reminders: Record<Role, { at: string; ok: boolean } | null>; flow: { steps: Step[]; next: string } | null; consentCurrent: boolean }>({ followup: false, links: null, reminders: { parent: null, education: null }, flow: null, consentCurrent: true });
  const [filter, setFilter] = useState('all'), [search, setSearch] = useState(''), [editing, setEditing] = useState(false), [fill, setFill] = useState<Role | null>(null);

  async function api(body?: any, id?: string, query = '') { const r = await fetch('/api/admin/development' + (id ? '?id=' + encodeURIComponent(id) + query : ''), body ? { method: 'POST', ...(body instanceof FormData ? { body } : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) } : { cache: 'no-store' }); const d = await r.json(); if (!r.ok && !d.status) throw Error(d.error || 'הפעולה נכשלה'); return d; }
  async function refresh(id?: string) {
    const d = await api(undefined, id); setReady(d.mail_configured); setDestination(d.destination); if (d.recipients) setRecipients(d.recipients);
    if (d.packet_files) { setPacketFiles(d.packet_files); setPicked(d.packet_files.map((f: any) => f.name)); }
    if (id) { setRecord(d.case); setDocuments(d.documents); setSummary(d.case.summary || ''); setConfirmed(false); setExtra({ followup: !!d.followup, links: d.links ?? null, reminders: d.reminders ?? { parent: null, education: null }, flow: d.flow ?? null, consentCurrent: d.consent_current !== false }); }
    else setCases(d.cases);
  }
  useEffect(() => { refresh().catch(e => setMessage(e.message)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [editError, setEditError] = useState('');
  async function run(fn: () => Promise<void>) { setBusy(true); setMessage(''); try { await fn(); } catch (e) { setMessage(e instanceof Error ? e.message : 'שגיאה'); } finally { setBusy(false); } }
  async function action(action: string, extra: any = {}) { await run(async () => { const d = await api({ action, id: record.id, ...extra }); if (d.token) setLink(location.origin + '/development#' + d.token); await refresh(record.id); await refresh(); setMessage(action === 'send' ? `הבקשה התקבלה אצל ספק הדואר (נמען: ${d.to || destination}). אין עדיין אישור מסירה.` : 'הפעולה נשמרה'); }); }
  const reload = async () => { await refresh(record.id); await refresh(); };
  const select = (id: string) => { if (fill && id !== record?.id && !confirm('שאלון פתוח למילוי. תשובות שלא נשמרו יאבדו. לעבור לתיק אחר?')) return; setLink(''); setEditing(false); setFill(null); run(() => refresh(id)); };

  const needle = search.trim().replace(/[\s-]/g, '');
  const shown = cases.filter(c => filters.find(f => f.key === filter)!.match(c.status) && (!needle || String(c.child_name + (c.parent_name ?? '')).replace(/\s/g, '').includes(needle) || local(c.phone).replace(/-/g, '').includes(needle) || String(c.phone ?? '').includes(needle)));
  const official = !!record?.form_version, open = record && ['parent', 'education', 'review'].includes(record.status);

  return <div className="space-y-6" dir="rtl">
    <h1 className="text-2xl font-bold">הפניות להתפתחות הילד</h1>
    <p className="rounded-xl bg-amber-50 border p-4">פניות חדשות משתמשות בעמודי ערכות מכבי המקוריות עד גיל שנה ולגילאי 1–6. יש לבדוק את מלוא התשובות, החתימות וההסכמות במסמכים שנוצרו ולצרף הפניה רפואית לפני אישור שליחה. פניות ישנות נשארות במסלול הקודם.</p>
    <p className="break-words">יעדים אפשריים: {Object.values(recipients).map(r => <span key={r.email}>{r.label} <span dir="ltr">({r.email})</span> · </span>)}חיבור דואר: {ready ? 'הוגדר — נדרשת בדיקת מסירה' : 'טרם הוגדר'}</p>
    {message && <p role="status" className="p-3 border rounded bg-white">{message}</p>}
    {link && <div className="p-4 bg-teal-50 rounded"><p>קישור אישי — למסירה רק לנמען המתאים. יצירת קישור חדש מבטלת את הקודם.</p><input className={input} dir="ltr" readOnly value={link} /><button className={btn} onClick={() => run(async () => { await navigator.clipboard.writeText(link); setMessage('הקישור הועתק'); })}>העתקה</button></div>}
    {editable && <details className="bg-white p-4 rounded-xl border"><summary className="cursor-pointer font-bold">פתיחת פנייה חדשה</summary><form className="grid gap-3 mt-4 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); run(async () => { const d = await api({ action: 'create', data: { child_name: f.get('child_name'), birth_date: f.get('birth_date'), parent_name: f.get('parent_name'), phone: f.get('phone'), education_role: f.get('education_role'), consent: f.get('consent') === 'on' } }); setLink(location.origin + '/development#' + d.parent_token); await refresh(); await refresh(d.id); }); }}>{[['child_name', 'שם הילד/ה', 'text'], ['birth_date', 'תאריך לידה', 'date'], ['parent_name', 'שם ההורה', 'text'], ['phone', 'טלפון ההורה', 'tel']].map(([name, label, type]) => <label key={name}>{label}<input required name={name} type={type} className={input} /></label>)}<label>מסגרת<select name="education_role" className={input}><option value="kindergarten">גן</option><option value="teacher">בית ספר</option><option value="none">אינו במסגרת</option></select></label><label><input name="consent" type="checkbox" required /> התקבלה הסכמת ההורה לפתיחת הפנייה ולשליחת הקישור האישי</label><button disabled={busy} className={btn}>פתיחה ויצירת קישור להורה</button></form></details>}

    <div className="grid gap-4 lg:grid-cols-3">
      <section className="space-y-2 min-w-0">
        <h2 className="font-bold">100 הפניות האחרונות</h2>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="סינון לפי שלב">{filters.map(f => { const n = cases.filter(c => f.match(c.status)).length; return f.key === 'check' && !n ? null : <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} className={`rounded-full border px-3 py-1 text-sm ${filter === f.key ? 'bg-teal-800 text-white border-teal-800' : 'bg-white'}`}>{f.label} <span className="tabular-nums opacity-80">{n}</span></button>; })}</div>
        <input type="search" aria-label="חיפוש לפי שם או טלפון" placeholder="חיפוש לפי שם או טלפון" className="w-full border rounded-lg p-2 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
        {!shown.length && <p className="text-sm text-slate-600 p-3 bg-white border rounded-lg">{cases.length ? 'אין פניות שמתאימות לסינון.' : 'עדיין אין פניות.'}</p>}
        {shown.map(c => <button key={c.id} disabled={busy} onClick={() => select(c.id)} aria-current={record?.id === c.id ? 'true' : undefined} className={`w-full text-right border p-4 bg-white rounded-lg ${record?.id === c.id ? 'border-teal-800 ring-1 ring-teal-800' : ''}`}><strong>{c.child_name}</strong><p>{states[c.status] || c.status}</p><small>הורה: {c.parent_submitted_at ? 'הושלם' : 'ממתין'} · מסגרת: {c.education_role === 'none' ? 'לא נדרש' : c.education_submitted_at ? 'הושלם' : 'ממתין'}</small><small className="block text-slate-500">{daysAgo(c.created_at)}</small></button>)}
      </section>

      {record && <section className="lg:col-span-2 min-w-0 bg-white border p-5 rounded-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">{record.child_name}</h2><CaseWhatsAppButton referralId={record.id} parentName={record.parent_name} childName={record.child_name} phone={record.phone} size="md" /></div>
        <p className="text-sm text-slate-600">הורה: {record.parent_name} · <span dir="ltr">{record.phone}</span></p>
        <p className="text-sm text-slate-600">תאריך לידה: <span dir="ltr">{String(record.birth_date).split('-').reverse().join('.')}</span> · מסגרת: {settings[record.education_role] ?? record.education_role}{record.education_role !== 'none' && (record.education_contact_name || record.education_phone) ? <> · {record.education_role === 'teacher' ? 'מורה' : 'גננת'}: {record.education_contact_name} <span dir="ltr">{local(record.education_phone)}</span></> : null}</p>
        <p>{states[record.status] || record.status}</p>
        {extra.flow && official && <div className="rounded-xl border bg-slate-50 p-3 space-y-2">
          <ol className="flex flex-wrap gap-1.5 text-sm" aria-label="שלבי התיק">{extra.flow.steps.map((s, i) => <li key={s.key} aria-current={s.state === 'current' ? 'step' : undefined} className={`rounded-full border px-3 py-1 ${s.state === 'done' ? 'bg-teal-800 border-teal-800 text-white' : s.state === 'current' ? 'bg-amber-100 border-amber-500 font-bold' : 'bg-white text-slate-600'}`}>{i + 1}. {s.label}{s.state === 'done' ? ' ✓' : s.state === 'skipped' ? '' : s.state === 'current' ? ' · עכשיו' : ''}</li>)}</ol>
          <p className="font-semibold">{extra.flow.next}</p>
        </div>}
        {official && !extra.consentCurrent && !SENT.includes(record.status) && <p className="text-sm rounded border border-amber-300 bg-amber-50 p-3">בפנייה זו לא אושר בהרשמה הנוסח הנוכחי של ההסכמה להעברה למכבי (נפתחה לפני העדכון או על ידי הצוות). לפני שליחה למכבי יש לוודא הסכמה להעברה: בחתימות שבשאלון, בהסכמה חתומה מצורפת או בהרשמה מחודשת של ההורה.</p>}
        {editable && open && !editing && <button type="button" className={ghost} disabled={busy} onClick={() => { setEditError(''); setEditing(true); }}>עריכת פרטי התיק</button>}
        {editable && open && editing && <CaseEditor key={'edit-' + record.id} record={record} official={official} followup={extra.followup} busy={busy} onCancel={() => setEditing(false)} error={editError} onSave={data => run(async () => { setEditError(''); const d = await api({ action: 'update', id: record.id, data }); if (d.error) { setEditError(d.error); return; } await reload(); setEditing(false); setMessage(d.changed?.length ? 'פרטי התיק עודכנו' : 'לא בוצע שינוי'); })} />}

        {editable && official && ['parent', 'education'].includes(record.status) && (extra.followup
          ? <LinksPanel key={'links-' + record.id} record={record} links={extra.links} reminders={extra.reminders} api={api} onChanged={reload} onRotate={role => { if (confirm('ליצור קישור חדש? הקישור הקודם יפסיק לעבוד, וצריך יהיה למסור את החדש.')) action('link', { role }); }} busy={busy} />
          : <div className="rounded-xl border p-4 space-y-2"><p className="text-sm">הצגה חוזרת של אותו קישור ותזכורות בוואטסאפ יופעלו לאחר עדכון מסד הנתונים. בינתיים אפשר להפיק קישור חדש.</p><div className="flex flex-wrap gap-2"><button className={btn} disabled={busy || !!record.parent_submitted_at} onClick={() => action('link', { role: 'parent' })}>קישור חדש להורה</button><button className={btn} disabled={busy || record.education_role === 'none' || !record.parent_submitted_at || !!record.education_submitted_at} onClick={() => action('link', { role: 'education' })}>קישור חדש למסגרת</button></div></div>)}
        {editable && !official && open && <div className="flex flex-wrap gap-2"><button className={btn} disabled={busy || !!record.parent_submitted_at} onClick={() => action('link', { role: 'parent' })}>קישור חדש להורה</button><button className={btn} disabled={busy || record.education_role === 'none' || !record.parent_submitted_at || !!record.education_submitted_at} onClick={() => action('link', { role: 'education' })}>קישור חדש למסגרת</button></div>}

        {official && <div className="space-y-2">
          <h3 className="font-bold">השאלונים המקוריים עם התשובות — לבדיקת כל העמודים והחתימות</h3>
          {record.parent_submitted_at && <a className="block underline" href={'/api/admin/development?id=' + record.id + '&document=generated-parent'}>הורדת שאלון הורים מלא</a>}
          {record.education_submitted_at && <a className="block underline" href={'/api/admin/development?id=' + record.id + '&document=generated-education'}>הורדת שאלון מסגרת מלא</a>}
          {record.education_role === 'none' && <p>לפי ההורה, הילד אינו במסגרת חינוכית.</p>}
          {editable && open && !fill && <div className="flex flex-wrap gap-2">
            <button type="button" className={ghost} disabled={busy} onClick={() => setFill('parent')}>{record.parent_submitted_at ? 'תיקון תשובות בשאלון ההורים' : 'מילוי שאלון ההורים על ידי הצוות'}</button>
            {record.education_role !== 'none' && <button type="button" className={ghost} disabled={busy || !record.parent_submitted_at} title={record.parent_submitted_at ? undefined : 'נפתח לאחר השלמת שאלון ההורים'} onClick={() => setFill('education')}>{record.education_submitted_at ? 'תיקון תשובות בשאלון המסגרת' : 'מילוי שאלון המסגרת על ידי הצוות'}</button>}
          </div>}
          {editable && open && fill && <AnswersEditor key={record.id + fill} id={record.id} form={fill} api={api} onClose={() => setFill(null)} onSaved={async text => { await reload(); setMessage(text); }} />}
        </div>}

        <h3 className="font-bold">מסמכים מצורפים</h3>
        {Object.entries(kinds).filter(([kind]) => !record.form_version || kind === 'referral' || kind === 'consent').map(([kind, label]) => { const doc = documents.find(d => d.kind === kind); return <div className="border rounded p-3" key={kind}><p>{label}: {doc ? <a className="text-teal-800 underline" href={'/api/admin/development?id=' + record.id + '&document=' + doc.id}>הורדת המסמך לבדיקה</a> : 'חסר'}</p>{editable && open && <label>העלאת PDF או תמונה (JPG/PNG) עד 5MB — תמונה תומר אוטומטית ל-PDF<input className="block max-w-full" type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (!file) return; const f = new FormData(); f.set('id', record.id); f.set('kind', kind); f.set('file', file); run(async () => { await api(f); await refresh(record.id); setMessage('המסמך נשמר'); }); }} /></label>}</div>; })}

        <h3 className="font-bold">ריכוז הדיווחים לבדיקת רופא</h3>
        <textarea className={input} rows={20} value={summary} readOnly={!editable || record.status !== 'review'} onChange={e => setSummary(e.target.value)} />
        {editable && record.status === 'review' && <><label className="block"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> בדקתי את הדיווחים, הסיכום, מסמכי המקור וההסכמה להעברה לאחד היעדים המוצגים</label><button className={btn} disabled={busy || !confirmed} onClick={() => action('approve', { summary, confirmed })}>שמירת סיכום ואישור רפואי</button></>}
        {editable && record.status === 'approved' && <div className="space-y-2 rounded-xl border p-4 bg-teal-50"><label className="block font-bold">נמען השליחה<select className={input} value={recipient} onChange={e => setRecipient(e.target.value)}>{Object.entries(recipients).map(([key, r]) => <option key={key} value={key}>{r.label}</option>)}</select></label><p className="text-sm break-words" dir="ltr">{recipients[recipient]?.email}</p><fieldset className="space-y-1"><legend className="font-bold">קבצים לשליחה</legend>{packetFiles.map(f => <label key={f.name} className="flex items-center gap-2"><input type="checkbox" checked={picked.includes(f.name)} onChange={e => setPicked(p => e.target.checked ? [...p, f.name] : p.filter(x => x !== f.name))} />{f.label} <span className="text-xs" dir="ltr">({f.name})</span></label>)}</fieldset><div className="flex flex-wrap gap-2"><button className={btn} disabled={busy || !ready || !picked.length} onClick={() => { const r = recipients[recipient]; if (recipient === 'institute' || confirm(`לשלוח את הסיכום, השאלונים המלאים וההפניה של ${record.child_name} אל: ${r?.label} (${r?.email})? הפעולה חד-פעמית ונרשמת ביומן הבקרה.`)) action('send', { recipient, confirmed: true, files: picked }); }}>שליחה ({picked.length} קבצים)</button><button className={ghost} disabled={busy} onClick={() => { if (confirm('להחזיר את התיק לעריכה? האישור הרפואי יבוטל ויהיה צורך לאשר שוב אחרי החלפת המסמכים.')) action('reopen'); }}>החזרת התיק לעריכה (להחלפת מסמכים)</button></div>{!ready && <p className="text-sm text-red-700">חיבור הדואר טרם הוגדר — לא ניתן לשלוח.</p>}</div>}
        {editable && record.status === 'accepted' && <div className="rounded-xl border p-4 space-y-2"><p className="text-sm">התיק נשלח. אם המשלוח היה לתיבת המכון בלבד, אפשר להחזיר אותו לעריכה, להחליף מסמכים ולשלוח למכבי. תיק שכבר הגיע למכבי נשאר נעול.</p><button className={ghost} disabled={busy} onClick={() => { if (confirm('להחזיר את התיק לעריכה? האישור הרפואי יבוטל ויהיה צורך לאשר ולשלוח מחדש.')) action('reopen'); }}>החזרת התיק לעריכה ושליחה למכבי</button></div>}
        <p className="text-sm">תיק נשלח פעם אחת בלבד. ב"לכולם" המייל יוצא לשתי כתובות מכבי עם העתק לתיבת המכון, ומבקש לזמן את הילד/ה להערכה התפתחותית; בכל מקרה נשמר העתק בתיקיית הנשלחים. אישור ספק הדואר אינו אישור מסירה.</p>
      </section>}
    </div>
  </div>;
}

/** Staff correction of the case details. A case from the earlier track only lets the contact details change. */
function CaseEditor({ record, official, followup, busy, error, onCancel, onSave }: { record: any; official: boolean; followup: boolean; busy: boolean; error: string; onCancel: () => void; onSave: (data: Record<string, string>) => void }) {
  const [v, setV] = useState({ child_name: record.child_name ?? '', birth_date: record.birth_date ?? '', parent_name: record.parent_name ?? '', phone: record.phone ?? '', education_role: record.education_role ?? 'kindergarten', education_contact_name: record.education_contact_name ?? '', education_phone: local(record.education_phone) });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV(x => ({ ...x, [k]: e.target.value }));
  function submit(e: FormEvent) {
    e.preventDefault();
    if (v.education_role === 'none' && record.education_role !== 'none' && record.status === 'education' && !confirm('לסמן שהילד אינו במסגרת? התיק יעבור לבדיקת רופא ללא שאלון מסגרת.')) return;
    const data: Record<string, string> = { parent_name: v.parent_name, phone: v.phone };
    if (official) Object.assign(data, { child_name: v.child_name, birth_date: v.birth_date, education_role: v.education_role }, followup && v.education_role !== 'none' ? { education_contact_name: v.education_contact_name, education_phone: v.education_phone } : {});
    onSave(data);
  }
  const educator = v.education_role === 'teacher' ? 'המורה' : 'הגננת';
  return <form onSubmit={submit} className="rounded-xl border border-teal-800 p-4 space-y-3" aria-label="עריכת פרטי התיק">
    <h3 className="font-bold">עריכת פרטי התיק</h3>
    {!official && <p className="text-sm">פנייה מהמסלול הקודם: אפשר לעדכן רק את פרטי הקשר של ההורה.</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      {official && <label>שם הילד/ה<input className={input} required maxLength={100} value={v.child_name} onChange={set('child_name')} /></label>}
      {official && <label>תאריך לידה<input className={input} type="date" required value={v.birth_date} onChange={set('birth_date')} /></label>}
      <label>שם ההורה<input className={input} required maxLength={100} value={v.parent_name} onChange={set('parent_name')} /></label>
      <label>נייד ההורה<input className={input} type="tel" dir="ltr" required maxLength={20} value={v.phone} onChange={set('phone')} /></label>
      {official && <label>מסגרת<select className={input} value={v.education_role} onChange={set('education_role')}><option value="kindergarten">מעון / גן</option><option value="teacher">בית ספר</option><option value="none">אינו במסגרת</option></select></label>}
      {official && followup && v.education_role !== 'none' && <><label>שם {educator}<input className={input} maxLength={100} value={v.education_contact_name} onChange={set('education_contact_name')} /></label><label>נייד {educator} (לתזכורות)<input className={input} type="tel" dir="ltr" maxLength={20} value={v.education_phone} onChange={set('education_phone')} /></label></>}
    </div>
    {official && <p className="text-xs text-slate-600">שינוי תאריך לידה שמחליף ערכת גיל, או שינוי סוג המסגרת, אפשרי רק לפני שנשמרו תשובות בשאלון המתאים.</p>}
    {error && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-900">{error}</p>}
    <div className="flex flex-wrap gap-2"><button className={btn} disabled={busy}>שמירת הפרטים</button><button type="button" className={ghost} disabled={busy} onClick={onCancel}>ביטול</button></div>
  </form>;
}

/** The personal links of the case, shown again as often as needed, and a WhatsApp reminder from the institute number. */
function LinksPanel({ record, links, reminders, api, onChanged, onRotate, busy }: { record: any; links: Record<Role, string | null> | null; reminders: Record<Role, { at: string; ok: boolean } | null>; api: (body: any) => Promise<any>; onChanged: () => Promise<void>; onRotate: (role: Role) => void; busy: boolean }) {
  const [lang, setLang] = useState<'he' | 'ar'>('he'), [sending, setSending] = useState<Role | null>(null), [confirmRole, setConfirmRole] = useState<Role | null>(null), [working, setWorking] = useState<Role | null>(null);
  const [note, setNote] = useState<Record<Role, Note>>({ parent: null, education: null }), [copied, setCopied] = useState<Role | null>(null), [origin, setOrigin] = useState('');
  useEffect(() => { setOrigin(location.hostname === 'localhost' ? location.origin : 'https://app.magickidsinstitute.com'); }, []);
  const educator = record.education_role === 'teacher' ? 'מורה' : 'גננת';
  const whom = (role: Role) => role === 'parent' ? 'להורה' : `ל${educator}`;
  const say = (role: Role, n: Note) => setNote(x => ({ ...x, [role]: n }));
  async function show(role: Role) { setWorking(role); say(role, null); try { await api({ action: 'show_link', id: record.id, role }); await onChanged(); } catch (e) { say(role, { ok: false, text: e instanceof Error ? e.message : 'לא ניתן להציג את הקישור' }); } finally { setWorking(null); } }
  async function remind(role: Role, force = false) {
    setSending(role); setConfirmRole(null); say(role, null);
    try {
      const d = await api({ action: 'remind', id: record.id, role, language: lang, force });
      const who = whom(role);
      if (d.status === 'sent') { say(role, { ok: true, text: `התזכורת נשלחה ${who} מהוואטסאפ של המכון (054-402-0043) עם הקישור להמשך אותו שאלון.` }); await onChanged(); }
      else if (d.status === 'recent') say(role, { ok: false, text: `כבר נשלחה תזכורת ${who} ב־${when(d.sentAt)}. לשלוח שוב בכל זאת?`, retry: true });
      else if (d.status === 'complete') { say(role, { ok: false, text: 'השאלון כבר הושלם; אין צורך בתזכורת.' }); await onChanged(); }
      else if (d.status === 'not_ready') say(role, { ok: false, text: 'שאלון המסגרת נפתח רק לאחר שאלון ההורים.' });
      else if (d.status === 'missing_phone') say(role, { ok: false, text: `אין מספר נייד תקין ${who} בתיק. הוסיפו מספר ב"עריכת פרטי התיק" ונסו שוב.` });
      else if (d.status === 'closed') { say(role, { ok: false, text: 'התיק כבר אינו ממתין לשאלון זה.' }); await onChanged(); }
      else if (d.status === 'unknown') say(role, { ok: false, text: 'תוצאת השליחה אינה ודאית. לא לשלוח שוב לפני בדיקה בוואטסאפ של המכון.' });
      else if (d.status === 'needs_update') say(role, { ok: false, text: 'התזכורות יופעלו לאחר עדכון מסד הנתונים.' });
      else say(role, { ok: false, text: 'השליחה נכשלה. בדקו שהוואטסאפ של המכון מחובר, או העתיקו את הקישור ושלחו ידנית.' });
    } catch { say(role, { ok: false, text: 'אין תקשורת עם השרת.' }); } finally { setSending(null); }
  }
  const roles: Role[] = record.education_role === 'none' ? ['parent'] : ['parent', 'education'];
  return <section className="rounded-xl border p-4 space-y-3" aria-labelledby="dev-links">
    <h3 id="dev-links" className="font-bold">קישורים ותזכורות</h3>
    <p className="text-sm text-slate-600">הקישור מחזיר לאותו שאלון, עם התשובות שכבר נשמרו. אפשר להעתיק ולשלוח אותו שוב בכל עת בלי לבטל את הקודם.</p>
    <div className={roles.length > 1 ? 'grid gap-3 md:grid-cols-2' : ''}>{roles.map(role => {
      const done = role === 'parent' ? !!record.parent_submitted_at : !!record.education_submitted_at, waitingParent = role === 'education' && !record.parent_submitted_at;
      const token = links?.[role] ?? null, url = token && origin ? `${origin}/development#${token}` : '';
      const phone = role === 'parent' ? record.phone : record.education_phone, last = reminders[role];
      return <div key={role} className="rounded-lg border border-slate-200 p-3 space-y-2 min-w-0">
        <h4 className="font-semibold">{role === 'parent' ? 'שאלון ההורים' : `שאלון ה${educator}`}</h4>
        <p className="text-sm text-slate-600">{done ? 'הושלם' : waitingParent ? 'ייפתח לאחר שההורה ישלים את השאלון שלו' : 'ממתין להשלמה'}</p>
        {!waitingParent && !(done && role === 'education') && <>
          {url ? <><input aria-label={`כתובת הקישור ${whom(role)}`} className="w-full rounded border p-2 text-sm" dir="ltr" readOnly value={url} onFocus={e => e.currentTarget.select()} />
            <div className="flex flex-wrap gap-2 text-sm"><button type="button" className="rounded-lg bg-teal-800 px-3 py-1.5 text-white" onClick={() => navigator.clipboard.writeText(url).then(() => { setCopied(role); setTimeout(() => setCopied(null), 2500); }, () => say(role, { ok: false, text: 'לא ניתן להעתיק אוטומטית. סמנו את הקישור בשדה והעתיקו.' }))}>{copied === role ? 'הועתק' : `העתקת הקישור ${whom(role)}`}</button><a className="rounded-lg border border-teal-800 px-3 py-1.5 text-teal-900" href={url} target="_blank" rel="noopener noreferrer">פתיחה</a></div></>
            : <button type="button" className="rounded-lg bg-teal-800 px-3 py-1.5 text-sm text-white disabled:opacity-40" disabled={working !== null || busy} onClick={() => show(role)}>{working === role ? 'מכין…' : `הצגת הקישור ${whom(role)}`}</button>}
          <button type="button" className="block text-xs underline text-slate-600 disabled:opacity-40" disabled={busy || (role === 'parent' && done)} onClick={() => onRotate(role)}>קישור חדש במקום הקיים (מבטל את הקודם)</button>
        </>}
        {!done && !waitingParent && <div className="border-t pt-2 space-y-2">
          <p className="text-sm font-semibold">תזכורת בוואטסאפ {phone ? <span dir="ltr" className="font-normal text-slate-600">{local(phone)}</span> : <span className="font-normal text-amber-800">אין מספר נייד בתיק</span>}</p>
          <p className="text-xs text-slate-600">נשלחת מהמספר של המכון (054-402-0043) עם הקישור לאותו שאלון.{last ? ` תזכורת אחרונה: ${when(last.at)}${last.ok ? '' : ' (נכשלה)'}.` : ' טרם נשלחה תזכורת.'}{!phone && role === 'education' ? ' אפשר להוסיף את הנייד ב"עריכת פרטי התיק".' : ''}</p>
          <div className="flex flex-wrap items-center gap-2">
            {(['he', 'ar'] as const).map(l => <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} className={`rounded-full border px-3 py-0.5 text-sm ${lang === l ? 'bg-teal-800 text-white border-teal-800' : 'bg-white'}`}>{l === 'he' ? 'עברית' : 'ערבית'}</button>)}
            {confirmRole === role
              ? <span className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-teal-800 bg-teal-50 px-3 py-1.5 text-sm"><span>לשלוח תזכורת {whom(role)} אל <b dir="ltr">{local(phone)}</b> ב{lang === 'he' ? 'עברית' : 'ערבית'}?</span><button type="button" className="rounded bg-teal-800 px-3 py-1 font-semibold text-white" onClick={() => remind(role)}>כן, לשלוח</button><button type="button" className="underline" onClick={() => setConfirmRole(null)}>ביטול</button></span>
              : <button type="button" className="rounded-lg bg-green-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50" disabled={sending !== null || !phone} onClick={() => setConfirmRole(role)}>{sending === role ? 'שולח…' : `שליחת תזכורת ${whom(role)}`}</button>}
          </div>
        </div>}
        {note[role] && <p role="status" className={`rounded p-2 text-sm ${note[role]!.ok ? 'bg-green-50 text-green-900' : 'bg-amber-50 text-amber-900'}`}>{note[role]!.text}{note[role]!.retry && <button type="button" className="mr-2 underline font-semibold" disabled={sending !== null} onClick={() => remind(role, true)}>כן, לשלוח שוב</button>}</p>}
      </div>;
    })}</div>
  </section>;
}

/** Staff fills or corrects a questionnaire on the original pages, for a parent or educator who answered by phone or on paper. */
function AnswersEditor({ id, form, api, onClose, onSaved }: { id: string; form: Role; api: (body?: any, id?: string, query?: string) => Promise<any>; onClose: () => void; onSaved: (text: string) => Promise<void> }) {
  const [data, setData] = useState<{ pages: OriginalPage[]; submitted: boolean; role: string } | null>(null), [answers, setAnswers] = useState<Record<string, string>>({}), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [note, setNote] = useState(''), [kept, setKept] = useState(false);
  useEffect(() => { api(undefined, id, '&form=' + form).then(d => { if (d.error) throw Error(d.error); setData(d); setAnswers(d.answers || {}); }).catch(e => setNote(e.message)); }, [id, form]); // eslint-disable-line react-hooks/exhaustive-deps
  const name = form === 'parent' ? 'שאלון ההורים' : data?.role === 'teacher' ? 'שאלון המורה' : 'שאלון הגננת';
  async function save(complete: boolean, regenerate = false) {
    if (complete && !confirm(`לסמן את ${name} כהושלם? התיק יתקדם לשלב הבא, כאילו ${form === 'parent' ? 'ההורה' : 'המסגרת'} שלחו אותו.`)) return;
    setBusy(true); setNote('');
    try {
      const d = await api({ action: 'answers', id, form, answers, complete, regenerate }); if (d.error) throw Error(d.error);
      setDirty(false); setKept(!!d.summary_kept);
      const text = d.completed ? `${name} סומן כהושלם על ידי הצוות` : d.summary_kept ? 'התשובות נשמרו. ריכוז הדיווחים נערך ידנית ולכן לא עודכן.' : 'התשובות נשמרו';
      await onSaved(text); if (d.completed) onClose(); else setNote(text);
    } catch (e) { setNote(e instanceof Error ? e.message : 'השמירה נכשלה'); } finally { setBusy(false); }
  }
  return <div className="rounded-xl border border-teal-800 p-4 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-bold">{data?.submitted ? 'תיקון תשובות' : 'מילוי על ידי הצוות'}: {name}</h4><button type="button" className="underline text-sm" onClick={() => { if (!dirty || confirm('יש שינויים שלא נשמרו. לסגור בכל זאת?')) onClose(); }}>סגירה</button></div>
    <p className="text-sm text-slate-600">{data?.submitted ? 'השאלון כבר הושלם. תיקון נרשם ביומן הבקרה, וריכוז הדיווחים מתעדכן בהתאם.' : 'התשובות נשמרות באותו שאלון שנפתח בקישור האישי. אפשר לשמור חלקית, או לסמן כהושלם כשהכול מולא.'}</p>
    {!data ? <p>{note || 'טוען…'}</p> : <>
      <OriginalPages pages={data.pages} answers={answers} disabled={busy} onChange={(k, value) => { setAnswers(a => ({ ...a, [k]: value })); setDirty(true); setNote(''); }} />
      <div className="flex flex-wrap gap-2 sticky bottom-0 bg-white py-2 border-t">
        <button type="button" className={btn} disabled={busy || !dirty} onClick={() => save(false)}>שמירת התשובות</button>
        {!data.submitted && <button type="button" className={ghost} disabled={busy} onClick={() => save(true)}>שמירה וסימון כהושלם</button>}
        {kept && <button type="button" className={ghost} disabled={busy} onClick={() => { if (confirm('ליצור את ריכוז הדיווחים מחדש מהתשובות? עריכות ידניות בריכוז יימחקו.')) save(false, true); }}>יצירת הריכוז מחדש מהתשובות</button>}
      </div>
      {note && <p role="status" className="text-sm rounded bg-slate-50 p-2">{note}</p>}
    </>}
  </div>;
}
