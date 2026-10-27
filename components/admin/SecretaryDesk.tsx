'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { STATUS_LABEL, type CommitmentStatus } from '@/lib/maccabi/commitment-shared';

type Row = { id: string; reference: string; patient_name: string; national_id: string; phone: string; service: string; status: CommitmentStatus; sent_at: string; last_reminder_at: string | null; reminders_count: number; last_checked_at: string | null; last_reply_at: string | null; last_reply_snippet: string | null; ready_at: string | null; ready_source: string | null; patient_notified_at: string | null; notify_error: string | null; attachments: { filename: string }[]; note: string | null };
type Patient = { id: string; name: string; national_id: string | null; phone: string; birth_date: string | null };
type MailStatus = { send: boolean; read: 'ok' | 'unauthorized' | 'not_configured' | 'error'; client_id: string | null; client_email: string | null };
type Upload = { path: string; filename: string };

const CHIP: Record<CommitmentStatus, string> = { sent: 'bg-sky-100 text-sky-800', reminded: 'bg-amber-100 text-amber-800', reply_received: 'bg-violet-100 text-violet-800', ready: 'bg-emerald-100 text-emerald-800', rejected: 'bg-rose-100 text-rose-800', cancelled: 'bg-slate-200 text-slate-700' };
const ERR: Record<string, string> = { invalid_body: 'בדקו את השדות (שם, ת.ז. 5–9 ספרות, טלפון 05X…)', mail_not_configured: 'שליחת מייל אינה מוגדרת במערכת', send_failed: 'שליחת המייל נכשלה – נסו שוב', file_missing: 'קובץ מצורף חסר – העלו שוב', too_large: 'הקבצים גדולים מדי (עד 15MB לקובץ, 20MB סה״כ)', unsupported_type: 'סוג קובץ לא נתמך (PDF/JPG/PNG בלבד)', mail_read_unauthorized: 'אין הרשאת קריאת מייל – ראו ההנחיה למעלה', mail_read_not_configured: 'קריאת מייל אינה מוגדרת', not_open: 'הבקשה אינה פתוחה', action_failed: 'הפעולה נכשלה – נסו שוב', forbidden: 'אין הרשאה' };
const fmt = (d: string | null) => d ? new Date(d).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' }) : '—';

export default function SecretaryDesk({ services, branchEmail, staffName }: { services: string[]; branchEmail: string; staffName: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [mail, setMail] = useState<MailStatus | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ clinic_patient_id: null as string | null, patient_name: '', national_id: '', birth_date: '', phone: '', service: services[0], serviceOther: '', note: '', test_to_self: false });
  const [q, setQ] = useState(''); const [hits, setHits] = useState<Patient[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [confirm, setConfirm] = useState<{ id: string; action: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/secretary/commitments', { cache: 'no-store' });
    if (r.ok) setRows((await r.json()).commitments); else setMsg({ kind: 'err', text: 'טעינת הרשימה נכשלה' });
  }, []);
  useEffect(() => { load(); fetch('/api/admin/secretary/mail-status', { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).then(setMail).catch(() => null); }, [load]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(async () => { const r = await fetch(`/api/admin/secretary/patients?q=${encodeURIComponent(q)}`, { cache: 'no-store' }); if (r.ok) setHits((await r.json()).patients); }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const pick = (p: Patient) => { setForm((f) => ({ ...f, clinic_patient_id: p.id, patient_name: p.name, national_id: p.national_id ?? '', phone: p.phone, birth_date: p.birth_date ?? '' })); setHits([]); setQ(''); };

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy('upload');
    try {
      for (const f of Array.from(files)) {
        const r = await fetch('/api/admin/secretary/commitments', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: f.name, type: f.type, size: f.size }) });
        const d = await r.json();
        if (!r.ok) { setMsg({ kind: 'err', text: `${f.name}: ${ERR[d.error] ?? 'העלאה נכשלה'}` }); continue; }
        const fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', f);
        const up = await fetch(d.signedUrl, { method: 'PUT', headers: { apikey: d.apikey }, body: fd });
        if (!up.ok) { setMsg({ kind: 'err', text: `${f.name}: העלאה נכשלה` }); continue; }
        setUploads((u) => [...u, { path: d.path, filename: f.name }]);
      }
    } finally { setBusy(null); if (fileRef.current) fileRef.current.value = ''; }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null); setBusy('send');
    const service = form.service === 'אחר' ? form.serviceOther.trim() : form.service;
    const r = await fetch('/api/admin/secretary/commitments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clinic_patient_id: form.clinic_patient_id, patient_name: form.patient_name, national_id: form.national_id, birth_date: form.birth_date || null, phone: form.phone, service, note: form.note, uploads, test_to_self: form.test_to_self }) });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { setMsg({ kind: 'err', text: ERR[d.error] ?? 'השליחה נכשלה' }); return; }
    setMsg({ kind: 'ok', text: form.test_to_self ? `מייל בדיקה נשלח לתיבת המכון (אסמכתא ${d.commitment.reference})` : `הבקשה נשלחה לסניף מכבי (אסמכתא ${d.commitment.reference}). המזכירה תעקוב כל בוקר ותעדכן את המשפחה כשההתחייבות מוכנה.` });
    setForm({ clinic_patient_id: null, patient_name: '', national_id: '', birth_date: '', phone: '', service: services[0], serviceOther: '', note: '', test_to_self: false }); setUploads([]);
    load();
  };

  const act = async (id: string, action: string) => {
    setConfirm(null); setMsg(null); setBusy(id + action);
    const r = await fetch(`/api/admin/secretary/commitments/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { setMsg({ kind: 'err', text: ERR[d.error] ?? 'הפעולה נכשלה' }); return; }
    if (action === 'check') { const a = d.result?.action as string; setMsg({ kind: 'ok', text: a === 'no_change' ? 'אין תשובה חדשה ממכבי' : a === 'ready_notified' ? 'ההתחייבות מוכנה – המשפחה עודכנה ב־WhatsApp' : a === 'ready_notify_failed' ? 'ההתחייבות מוכנה אך שליחת ה־WhatsApp נכשלה – שלחו שוב' : a === 'no_thread' ? 'אין שרשור מייל לבקשה' : `התקבלה תשובה (${d.result?.verdict}) – ראו בכרטיס` }); }
    else if (action === 'ready' || action === 'notify_again') setMsg(d.whatsapp?.ok ? { kind: 'ok', text: `ההודעה נשלחה למשפחה מ${d.whatsapp.sender === 'clinic' ? 'מספר המרפאה' : d.whatsapp.sender === 'doctor' ? 'מספר ד״ר נמוז' : 'מספר המכון'}` } : { kind: 'err', text: `סומן כמוכן, אך ה־WhatsApp לא נשלח (${d.whatsapp?.error ?? 'שגיאה'}) – נסו "שליחה חוזרת"` });
    else setMsg({ kind: 'ok', text: 'עודכן' });
    load();
  };

  const open = rows?.filter((r) => ['sent', 'reminded', 'reply_received'].includes(r.status)) ?? [];
  const closed = rows?.filter((r) => !['sent', 'reminded', 'reply_received'].includes(r.status)) ?? [];
  const input = 'w-full border rounded-lg p-2 bg-white';
  const small = 'rounded-lg border px-3 py-1.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50';

  return <div className="space-y-5">
    {mail && mail.read !== 'ok' && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 space-y-1">
      <p className="font-bold">המזכירה יכולה לשלוח בקשות, אבל עדיין לא לקרוא את תשובות מכבי אוטומטית.</p>
      {mail.read === 'unauthorized' ? <><p>כדי להפעיל מעקב אוטומטי, במסוף הניהול של Google Workspace (אבטחה ← בקרת API ← האצלה ברמת הדומיין) הוסיפו ל־Client ID הקיים את ההיקף <code dir="ltr" className="rounded bg-white px-1">https://www.googleapis.com/auth/gmail.readonly</code> לצד ההיקפים הקיימים.</p>
        {mail.client_id && <p>Client ID: <code dir="ltr" className="rounded bg-white px-1">{mail.client_id}</code></p>}</> : <p>שליחת מייל אינה מוגדרת במערכת ({mail.read}).</p>}
      <p>עד אז אפשר לבדוק את התיבה ידנית ולסמן "ההתחייבות מוכנה" – ההודעה למשפחה תישלח אוטומטית.</p>
    </div>}
    {msg && <div role="status" className={`rounded-xl border p-3 text-sm ${msg.kind === 'ok' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-rose-300 bg-rose-50 text-rose-900'}`}>{msg.text}</div>}

    <form onSubmit={submit} className="card space-y-4">
      <h2 className="text-xl font-bold text-teal-900">בקשת התחייבות חדשה ממכבי</h2>
      <p className="text-sm text-slate-600">הבקשה נשלחת מהמייל של המכון אל {branchEmail} בשם {staffName}. חפשו מטופל/ת ממאגר מרפאת הילדים או מלאו ידנית.</p>
      <div className="relative">
        <label className="block text-sm font-semibold">חיפוש במטופלי המרפאה (שם / ת.ז. / טלפון)<input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="לדוגמה: אחמד או 052…" autoComplete="off" /></label>
        {hits.length > 0 && <ul className="absolute z-10 mt-1 w-full rounded-lg border bg-white shadow-lg max-h-64 overflow-auto">{hits.map((p) => <li key={p.id}><button type="button" className="w-full text-right px-3 py-2 hover:bg-teal-50 text-sm" onClick={() => pick(p)}>{p.name} · ת.ז. {p.national_id ?? '—'} · {p.phone || 'ללא טלפון'}</button></li>)}</ul>}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm font-semibold">שם המטופל/ת *<input className={input} required minLength={2} value={form.patient_name} onChange={(e) => setForm({ ...form, patient_name: e.target.value, clinic_patient_id: null })} /></label>
        <label className="block text-sm font-semibold">ת.ז. *<input className={input} required inputMode="numeric" value={form.national_id} onChange={(e) => setForm({ ...form, national_id: e.target.value })} /></label>
        <label className="block text-sm font-semibold">טלפון ההורה (לעדכון ב־WhatsApp) *<input className={input} required inputMode="tel" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label className="block text-sm font-semibold">תאריך לידה<input type="date" className={input} value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></label>
        <label className="block text-sm font-semibold">השירות המבוקש *<select className={input} value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })}>{services.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
        {form.service === 'אחר' && <label className="block text-sm font-semibold">פירוט השירות *<input className={input} required minLength={2} value={form.serviceOther} onChange={(e) => setForm({ ...form, serviceOther: e.target.value })} /></label>}
      </div>
      <label className="block text-sm font-semibold">הערה לסניף (לא חובה)<textarea className={input} rows={2} maxLength={2000} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
      <div className="space-y-2">
        <label className="block text-sm font-semibold">הפניה / מסמכים לצירוף (PDF, JPG, PNG)<input ref={fileRef} type="file" multiple accept="application/pdf,image/jpeg,image/png" className="block text-sm" disabled={busy === 'upload'} onChange={(e) => addFiles(e.target.files)} /></label>
        {uploads.length > 0 && <ul className="text-sm text-slate-700 space-y-1">{uploads.map((u) => <li key={u.path} className="flex items-center gap-2">📎 {u.filename}<button type="button" className="text-rose-700 underline" onClick={() => setUploads(uploads.filter((x) => x.path !== u.path))}>הסרה</button></li>)}</ul>}
      </div>
      <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={form.test_to_self} onChange={(e) => setForm({ ...form, test_to_self: e.target.checked })} /> בדיקה: לשלוח לתיבת המכון במקום למכבי</label>
      <div><button type="submit" className="btn-primary" disabled={busy === 'send' || busy === 'upload'}>{busy === 'send' ? 'שולחת…' : form.test_to_self ? 'שליחת בדיקה' : 'שליחת הבקשה למכבי'}</button></div>
    </form>

    <section className="card space-y-3">
      <h2 className="text-xl font-bold text-teal-900">בקשות פתוחות ({open.length})</h2>
      {rows === null ? <p className="text-slate-500">טוען…</p> : open.length === 0 ? <p className="text-slate-500">אין בקשות פתוחות.</p> : open.map((r) => <Card key={r.id} r={r} />)}
    </section>
    <section className="card space-y-3">
      <h2 className="text-xl font-bold text-teal-900">הושלמו / נסגרו (60 הימים האחרונים)</h2>
      {closed.length === 0 ? <p className="text-slate-500">אין עדיין.</p> : closed.map((r) => <Card key={r.id} r={r} />)}
    </section>
  </div>;

  function Card({ r }: { r: Row }) {
    const isOpen = ['sent', 'reminded', 'reply_received'].includes(r.status);
    const b = (a: string) => busy === r.id + a;
    return <article className="rounded-xl border border-slate-200 p-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${CHIP[r.status]}`}>{STATUS_LABEL[r.status]}</span>
        <span className="font-bold text-teal-900">{r.patient_name}</span><span className="text-sm text-slate-600">ת.ז. {r.national_id} · {r.phone} · {r.service}</span>
        <span className="ms-auto text-xs text-slate-500" dir="ltr">{r.reference}</span>
      </div>
      <p className="text-xs text-slate-600">נשלח: {fmt(r.sent_at)} · תזכורות: {r.reminders_count}{r.last_reminder_at ? ` (אחרונה ${fmt(r.last_reminder_at)})` : ''} · נבדק לאחרונה: {fmt(r.last_checked_at)}{r.attachments?.length ? ` · ${r.attachments.length} קבצים` : ''}</p>
      {r.last_reply_snippet && <blockquote className="rounded-lg bg-slate-50 p-2 text-sm text-slate-800"><span className="text-xs text-slate-500">תשובת מכבי ({fmt(r.last_reply_at)}):</span><br />{r.last_reply_snippet}</blockquote>}
      {r.status === 'ready' && <p className="text-sm text-emerald-800">מוכן מאז {fmt(r.ready_at)} ({r.ready_source === 'email' ? 'זוהה מהמייל' : 'סומן ידנית'}) · {r.patient_notified_at ? `המשפחה עודכנה ב־WhatsApp ${fmt(r.patient_notified_at)}` : `המשפחה לא עודכנה${r.notify_error ? ` (${r.notify_error})` : ''}`}</p>}
      {confirm?.id === r.id ? <div className="flex flex-wrap items-center gap-2 text-sm"><span>{confirm.action === 'ready' ? `לסמן כמוכן ולשלוח WhatsApp ל־${r.phone}?` : confirm.action === 'notify_again' ? `לשלוח שוב WhatsApp ל־${r.phone}?` : confirm.action === 'remind' ? 'לשלוח תזכורת לסניף עכשיו?' : 'לאשר?'}</span><button type="button" className="btn-primary !px-4 !py-1.5 text-sm" onClick={() => act(r.id, confirm.action)}>כן</button><button type="button" className={small} onClick={() => setConfirm(null)}>ביטול</button></div>
        : <div className="flex flex-wrap gap-2">
          {isOpen && <><button type="button" className={small} disabled={b('check')} onClick={() => act(r.id, 'check')}>{b('check') ? 'בודקת…' : 'בדיקת מייל עכשיו'}</button>
            <button type="button" className={small} disabled={b('remind')} onClick={() => setConfirm({ id: r.id, action: 'remind' })}>תזכורת לסניף</button>
            <button type="button" className={`${small} border-emerald-600 text-emerald-800`} disabled={b('ready')} onClick={() => setConfirm({ id: r.id, action: 'ready' })}>ההתחייבות מוכנה – עדכון המשפחה</button>
            <button type="button" className={small} onClick={() => act(r.id, 'rejected')}>נדחה / חסר</button>
            <button type="button" className={small} onClick={() => act(r.id, 'cancel')}>ביטול בקשה</button></>}
          {r.status === 'ready' && <button type="button" className={small} disabled={b('notify_again')} onClick={() => setConfirm({ id: r.id, action: 'notify_again' })}>שליחה חוזרת למשפחה</button>}
          {!isOpen && <button type="button" className={small} onClick={() => act(r.id, 'reopen')}>פתיחה מחדש</button>}
        </div>}
      {r.note && <p className="text-xs text-slate-500">הערה: {r.note}</p>}
    </article>;
  }
}
