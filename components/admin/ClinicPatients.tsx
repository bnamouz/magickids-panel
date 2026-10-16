'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ClinicPatient } from '@/lib/clinic-patients/schema';

const blank = { national_id: '', first_name: '', last_name: '', phone1: '', phone2: '', birth_date: '', last_visit: '', next_visit: '', notes: '', needs_review: false };
const ERR: Record<string, string> = {
  invalid_id: 'מספר תעודת הזהות לא תקין (ספרת ביקורת שגויה).', id_exists: 'כבר קיים מטופל עם תעודת הזהות הזו.',
  invalid_phone: 'מספר טלפון לא תקין. יש להזין 9–10 ספרות שמתחילות ב־0.', invalid_date: 'תאריך לא תקין.',
};
const fmt = (d: string | null) => d ? d.split('-').reverse().join('/') : '';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

export default function ClinicPatients({ patients, siblings, archived }: { patients: ClinicPatient[]; siblings: Record<string, number>; archived: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<any>(null), [bulk, setBulk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function send(body: unknown, done: string) {
    setBusy(true); setMessage('');
    try {
      const r = await fetch('/api/admin/clinic-patients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), d = await r.json();
      if (!r.ok) throw new Error(ERR[d.error] ?? 'הפעולה לא נשמרה. בדקו את הפרטים ונסו שוב.');
      if ('inserted' in d) setMessage(`נוספו ${d.inserted} מטופלים. ${d.skipped_existing ? `${d.skipped_existing} כבר היו קיימים ולא שונו. ` : ''}${d.invalid_count ? `${d.invalid_count} שורות לא תקינות (שורות ${d.invalid.map((x: any) => x.line).join(', ')}).` : ''}`);
      else setMessage(done);
      setEditing(null); if ('inserted' in d && !d.invalid_count) setBulk(null); router.refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'אירעה שגיאה'); } finally { setBusy(false); }
  }
  function save(e: FormEvent) { e.preventDefault(); void send({ action: 'save', patient: editing }, 'הפרטים נשמרו.'); }
  const field = (key: string, label: string, type = 'text', req = false, dir?: 'ltr') =>
    <label className="block text-sm" key={key}>{label}<input type={type} dir={dir} required={req} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-200" value={editing[key] ?? ''} maxLength={key.endsWith('name') ? 80 : 20} onChange={e => setEditing({ ...editing, [key]: e.target.value })} /></label>;

  return <div className="space-y-4">
    {!archived && <div className="flex flex-wrap gap-3">
      <button disabled={busy} className="btn-primary" onClick={() => { setBulk(null); setEditing({ ...blank }); }}>הוספת מטופל</button>
      <button disabled={busy} className="btn-ghost" onClick={() => { setEditing(null); setBulk(bulk === null ? '' : null); }}>הוספה מרוכזת מאקסל</button>
    </div>}
    <p role="status" className="text-teal-800">{message}</p>

    {editing && <form onSubmit={save} className="card space-y-3"><fieldset disabled={busy} className="space-y-3">
      <h2 className="text-xl font-bold">{editing.id ? 'עריכת מטופל' : 'מטופל חדש'}</h2>
      <div className="grid gap-3 sm:grid-cols-3">{field('national_id', 'ת.ז הילד', 'text', true, 'ltr')}{field('first_name', 'שם פרטי', 'text', true)}{field('last_name', 'שם משפחה', 'text', true)}</div>
      <div className="grid gap-3 sm:grid-cols-3">{field('phone1', 'טלפון 1', 'tel', false, 'ltr')}{field('phone2', 'טלפון 2', 'tel', false, 'ltr')}{field('birth_date', 'תאריך לידה', 'date')}</div>
      <div className="grid gap-3 sm:grid-cols-3">{field('last_visit', 'ביקור אחרון', 'date')}{field('next_visit', 'ביקור קרוב', 'date')}
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={!!editing.needs_review} onChange={e => setEditing({ ...editing, needs_review: e.target.checked })} /> לבדיקה</label></div>
      <label className="block text-sm">הערות<textarea className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-200" rows={2} maxLength={2000} value={editing.notes ?? ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} /></label>
      <div className="flex gap-3"><button className="btn-primary">שמירה</button><button type="button" className="btn-ghost" onClick={() => setEditing(null)}>ביטול</button></div>
    </fieldset></form>}

    {bulk !== null && <div className="card space-y-3">
      <h2 className="text-xl font-bold">הוספה מרוכזת</h2>
      <p className="text-sm text-slate-600">העתיקו שורות מאקסל והדביקו כאן, בסדר העמודות: <b>ת.ז · שם פרטי · שם משפחה · טלפון 1 · טלפון 2 · ביקור אחרון · ביקור קרוב</b>. תאריכים בפורמט 12/10/2026. מטופל שתעודת הזהות שלו כבר קיימת לא ישתנה.</p>
      <textarea dir="auto" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-200 font-mono text-sm" rows={8} value={bulk} onChange={e => setBulk(e.target.value)} placeholder={'341571727\tג׳מיל\tעטאללה\t0549015481\t0545314020\t12/10/2026\t15/10/2026'} />
      <div className="flex gap-3"><button disabled={busy || !bulk.trim()} className="btn-primary" onClick={() => send({ action: 'bulk', text: bulk }, '')}>הוספה</button><button className="btn-ghost" onClick={() => setBulk(null)}>סגירה</button></div>
    </div>}

    {!patients.length ? <p className="card">אין מטופלים להצגה.</p> :
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-right text-slate-700"><tr>{['ת.ז', 'שם פרטי', 'שם משפחה', 'טלפון 1', 'טלפון 2', 'ביקור אחרון', 'ביקור קרוב', 'אחים', ''].map(h => <th key={h} scope="col" className="whitespace-nowrap px-3 py-2 font-bold">{h}</th>)}</tr></thead>
          <tbody>{patients.map(p => <tr key={p.id} className={`border-t border-slate-100 ${p.needs_review ? 'bg-amber-50' : ''}`}>
            <td className="px-3 py-2 font-mono" dir="ltr">{p.national_id}</td>
            <td className="px-3 py-2">{p.first_name}</td>
            <td className="px-3 py-2">{p.last_name}</td>
            <td className="px-3 py-2 font-mono" dir="ltr">{p.phone1 && <a className="underline" href={`tel:${p.phone1}`}>{p.phone1}</a>}</td>
            <td className="px-3 py-2 font-mono" dir="ltr">{p.phone2 && <a className="underline" href={`tel:${p.phone2}`}>{p.phone2}</a>}</td>
            <td className="whitespace-nowrap px-3 py-2">{fmt(p.last_visit)}</td>
            <td className={`whitespace-nowrap px-3 py-2 ${p.next_visit && p.next_visit >= today() ? 'font-bold text-teal-800' : ''}`}>{fmt(p.next_visit)}</td>
            <td className="px-3 py-2">{siblings[p.id] ? <Link className="underline" href={`/admin/clinic-patients?q=${p.phone1 ?? p.phone2}`}>{siblings[p.id]}</Link> : ''}</td>
            <td className="whitespace-nowrap px-3 py-2">
              {archived ? <button disabled={busy} className="underline" onClick={() => send({ action: 'restore', id: p.id }, 'המטופל הוחזר לרשימה.')}>החזרה</button> : <span className="flex gap-3">
                <button disabled={busy} className="underline" onClick={() => { setBulk(null); setEditing({ ...p, phone1: p.phone1 ?? '', phone2: p.phone2 ?? '', birth_date: p.birth_date ?? '', last_visit: p.last_visit ?? '', next_visit: p.next_visit ?? '', notes: p.notes ?? '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>עריכה</button>
                {p.needs_review && <button disabled={busy} className="underline text-amber-800" onClick={() => send({ action: 'reviewed', id: p.id }, 'סומן כנבדק.')}>נבדק</button>}
                <button disabled={busy} className="text-red-700 underline" onClick={() => { if (confirm(`להסתיר את ${p.first_name} ${p.last_name} מהרשימה? אפשר להחזיר בלשונית "מוסתרים".`)) void send({ action: 'archive', id: p.id, confirmed: true }, 'המטופל הוסתר.'); }}>הסתרה</button>
              </span>}
              {p.notes && <span className="block max-w-xs truncate text-xs text-slate-500" title={p.notes}>{p.notes}</span>}
            </td>
          </tr>)}</tbody>
        </table>
      </div>}
  </div>;
}
