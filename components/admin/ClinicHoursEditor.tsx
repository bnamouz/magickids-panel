'use client';
import { useEffect, useState } from 'react';

type Clinic = 'pediatrics' | 'adhd';
type Row = { clinic: Clinic; day: string; closed: boolean; open_min: number | null; close_min: number | null; note: string | null };
const CLINIC_HE: Record<Clinic, string> = { pediatrics: 'מרפאת הילדים', adhd: 'מרפאת הקשב (המכון)' };
const DAY_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const fmtDay = (d: string) => { const [y, m, dd] = d.split('-'); return `יום ${DAY_HE[new Date(d + 'T12:00:00Z').getUTCDay()]} ${dd}.${m}.${y}`; };

/** Close a clinic day or set other hours for one day. Only which new slots are offered changes; booked visits stay. */
export default function ClinicHoursEditor({ defaults, today }: { defaults: Record<Clinic, Record<number, [number, number]>>; today: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [clinic, setClinic] = useState<Clinic>('pediatrics');
  const [day, setDay] = useState(today);
  const [mode, setMode] = useState<'closed' | 'hours'>('hours');
  const [open, setOpen] = useState('10:00');
  const [close, setClose] = useState('13:00');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const load = () => fetch('/api/admin/clinic-hours').then(r => r.json()).then(d => setRows(d.overrides ?? [])).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  const weekday = new Date(day + 'T12:00:00Z').getUTCDay();
  const def = defaults[clinic][weekday] ?? null;
  useEffect(() => { if (def) { setOpen(clock(def[0])); setClose(clock(def[1])); } }, [clinic, day]); // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    setBusy(true); setMsg(null);
    try {
      const body = mode === 'closed' ? { mode, clinic, day, note } : { mode, clinic, day, open, close, note };
      const r = await fetch('/api/admin/clinic-hours', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { setMsg({ ok: true, text: mode === 'closed' ? `${CLINIC_HE[clinic]} סומנה כסגורה ב־${fmtDay(day)}. לא יוצעו תורים חדשים; תורים שכבר נקבעו נשארים.` : `השעות ל־${fmtDay(day)} ב${CLINIC_HE[clinic]} עודכנו ל־${open}–${close}. תורים חדשים יוצעו רק בטווח הזה.` }); setNote(''); load(); }
      else setMsg({ ok: false, text: d.error || 'השמירה נכשלה' });
    } catch { setMsg({ ok: false, text: 'אין תקשורת עם השרת' }); } finally { setBusy(false); }
  }
  async function remove(r: Row) {
    setBusy(true); setMsg(null); setConfirmDelete(null);
    try {
      const res = await fetch('/api/admin/clinic-hours', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinic: r.clinic, day: r.day }) });
      if (res.ok) { setMsg({ ok: true, text: `${fmtDay(r.day)} חזר לשעות הרגילות.` }); load(); } else setMsg({ ok: false, text: 'המחיקה נכשלה' });
    } catch { setMsg({ ok: false, text: 'אין תקשורת עם השרת' }); } finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <section className="card space-y-4">
      <h2 className="text-xl font-bold">שינוי ליום בודד</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block"><span className="block text-sm font-semibold text-slate-700 mb-1">מרפאה</span>
          <select className="w-full border rounded-lg p-2 bg-white" value={clinic} onChange={e => setClinic(e.target.value as Clinic)}>{(Object.keys(CLINIC_HE) as Clinic[]).map(c => <option key={c} value={c}>{CLINIC_HE[c]}</option>)}</select></label>
        <label className="block"><span className="block text-sm font-semibold text-slate-700 mb-1">תאריך</span>
          <input type="date" className="w-full border rounded-lg p-2" value={day} min={today} onChange={e => setDay(e.target.value)} /></label>
      </div>
      <p className="text-sm text-slate-600">{fmtDay(day)} · שעות רגילות: {def ? <b dir="ltr">{clock(def[0])}–{clock(def[1])}</b> : <b>סגור ביום זה בדרך כלל</b>}</p>
      <div className="flex flex-wrap gap-4">
        <label className="inline-flex items-center gap-2"><input type="radio" name="mode" checked={mode === 'hours'} onChange={() => setMode('hours')} /> שעות אחרות ליום זה</label>
        <label className="inline-flex items-center gap-2"><input type="radio" name="mode" checked={mode === 'closed'} onChange={() => setMode('closed')} /> המרפאה סגורה ביום זה</label>
      </div>
      {mode === 'hours' && <div className="grid gap-3 md:grid-cols-2">
        <label className="block"><span className="block text-sm font-semibold text-slate-700 mb-1">פתיחה</span><input type="time" step={600} className="w-full border rounded-lg p-2" value={open} onChange={e => setOpen(e.target.value)} /></label>
        <label className="block"><span className="block text-sm font-semibold text-slate-700 mb-1">סגירה (סוף התור האחרון)</span><input type="time" step={600} className="w-full border rounded-lg p-2" value={close} onChange={e => setClose(e.target.value)} /></label>
        <p className="md:col-span-2 text-xs text-slate-500">לדוגמה: כדי שהתור האחרון במרפאת הילדים יהיה 13:00, קובעים סגירה 13:10 (תור של 10 דקות).</p>
      </div>}
      <label className="block"><span className="block text-sm font-semibold text-slate-700 mb-1">הערה (לא חובה, פנימי)</span><input className="w-full border rounded-lg p-2" value={note} maxLength={200} onChange={e => setNote(e.target.value)} placeholder="למשל: כנס, חופשה, סגירה מוקדמת" /></label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" disabled={busy} onClick={save}>{busy ? 'שומר…' : 'שמירה'}</button>
        <span className="text-xs text-slate-500">משפיע על האתר, על נור בטלפון ועל הפאנל. תורים שכבר נקבעו לא משתנים ולא מבוטלים.</span>
      </div>
      {msg && <p role="status" className={`rounded-lg p-3 text-sm ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>{msg.text}</p>}
    </section>
    <section className="card space-y-3">
      <h2 className="text-xl font-bold">שינויים קרובים</h2>
      {rows === null ? <p className="text-slate-500">טוען…</p> : rows.length === 0 ? <p className="text-slate-500">אין שינויים מהיום והלאה; כל הימים לפי השעות הרגילות.</p>
        : <ul className="divide-y">{rows.map(r => <li key={`${r.clinic}-${r.day}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
          <span><b>{fmtDay(r.day)}</b> · {CLINIC_HE[r.clinic]} · {r.closed ? <span className="text-red-700 font-semibold">סגור</span> : <span dir="ltr">{clock(r.open_min!)}–{clock(r.close_min!)}</span>}{r.note && <span className="text-slate-500"> · {r.note}</span>}</span>
          {confirmDelete === `${r.clinic}-${r.day}` ? <span className="inline-flex gap-2"><button type="button" className="text-red-700 font-semibold underline" disabled={busy} onClick={() => remove(r)}>כן, להחזיר לשעות הרגילות</button><button type="button" className="underline" onClick={() => setConfirmDelete(null)}>ביטול</button></span>
            : <button type="button" className="btn-ghost text-sm" disabled={busy} onClick={() => setConfirmDelete(`${r.clinic}-${r.day}`)}>החזרה לשעות הרגילות</button>}
        </li>)}</ul>}
    </section>
  </div>;
}
