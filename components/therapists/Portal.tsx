'use client';

import { useEffect, useRef, useState } from 'react';
import AvailabilityEditor from './AvailabilityEditor';
import AppointmentEditor, { appointmentErrors, appointmentResultText, type AppointmentResult } from './AppointmentEditor';
import TreatmentChangeHistory from './TreatmentChangeHistory';
import { availabilitySchema } from '@/lib/therapists/schema';

const when = (s: string) => new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' }).format(new Date(s));
const messages: Record<string, string> = {
  invalid_link: 'הקישור אינו תקין, פג תוקף או בוטל. פנו למכון לקבלת קישור חדש.',
  slot_taken: 'המועד נתפס. רעננו ובחרו מועד אחר.',
  outside_hours: 'המועד מחוץ לשעות העבודה.',
  on_leave: 'המועד חל בחופשה.',
  not_assigned: 'הפנייה אינה מוקצית לך.',
  closed: 'הפנייה נסגרה.',
  syncing: 'מתבצע סנכרון ליומן. נסו שוב בעוד רגע.',
  confirm_parent: 'יש לאשר תיאום עם ההורים.',
};

export default function Portal() {
  const credentials = useRef({ id: '', token: '' });
  const resultLine = useRef<HTMLParagraphElement>(null);
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('טוען…');

  async function call(body: { action: string; [key: string]: unknown }, editor = false) {
    const r = await fetch('/api/therapist', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...credentials.current, ...body }),
    }).catch(() => { throw new Error('אין חיבור למערכת. רענני את הרשימה לפני ניסיון נוסף.'); });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d) throw new Error((editor && appointmentErrors[d?.error]) || messages[d?.error] || 'לא ניתן להשלים כרגע. רענני את הרשימה לפני ניסיון נוסף.');
    return d;
  }
  async function load() {
    const d = await call({ action: 'read' });
    setData(d);
  }
  useEffect(() => {
    const p = new URLSearchParams(location.hash.slice(1));
    credentials.current = { id: p.get('id') ?? '', token: p.get('token') ?? '' };
    void load().then(() => setMessage('')).catch(e => setMessage(e.message));
  }, []);
  async function act(body: Parameters<typeof call>[0]) {
    setBusy(true);
    setMessage('');
    try {
      const d = await call(body);
      await load();
      setMessage(d.calendar && d.calendar !== 'synced' ? 'התור נשמר במכון, אך עדיין לא סונכרן ליומן Google. צוות המכון יכול לראות זאת.' : 'נשמר בהצלחה.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'אירעה שגיאה');
    } finally {
      setBusy(false);
    }
  }
  async function changeDone(requestId: string, result: AppointmentResult, start?: string) {
    const outcome = appointmentResultText(result);
    setMessage(outcome);
    setBusy(true);
    setData((prev: any) => ({
      ...prev,
      requests: prev.requests.flatMap((row: any) => {
        if (row.id !== requestId) return [row];
        if (result.status === 'removed') return [];
        return [{ ...row, status: result.status === 'cancelled' ? 'contacted' : 'scheduled', scheduled_at: start ?? null, calendar_sync: result.calendar }];
      }),
    }));
    requestAnimationFrame(() => resultLine.current?.focus());
    try {
      await load();
    } catch {
      setMessage(`${outcome} הרשימה לא התרעננה. רענני אותה לפני פעולה נוספת.`);
    } finally {
      setBusy(false);
    }
  }

  return <main className="max-w-3xl mx-auto p-5 space-y-5" dir="rtl">
    <h1 className="text-3xl font-bold text-teal-800">פורטל המטפלים · ילדי הקסם</h1>
    <p ref={resultLine} role="status" tabIndex={-1}>{message}</p>
    {data && <>
      <h2 className="text-xl">שלום {data.profile.name}</h2>
      <form className="card space-y-4" onSubmit={e => {
        e.preventDefault();
        const availability = { hours: data.profile.hours, leave_dates: data.profile.leave_dates };
        if (!availabilitySchema.safeParse(availability).success) {
          setMessage('בדקו שעות עבודה וחופשות; אין להזין טווחים חופפים.');
          return;
        }
        void act({ action: 'hours', availability });
      }}>
        <AvailabilityEditor value={data.profile} onChange={v => setData({ ...data, profile: { ...data.profile, ...v } })} />
        <button disabled={busy} className="btn-primary">שמירת שעות העבודה</button>
      </form>
      <h2 className="text-xl font-bold">פניות שהוקצו לך</h2>
      <button className="btn-ghost" disabled={busy} onClick={() => void load().catch(e => setMessage(e.message))}>רענון פניות וזמינות</button>
      {!data.requests.length && <p>אין פניות שהוקצו לך כרגע.</p>}
      {data.requests.map((r: any) => <article key={r.id} className="card space-y-3 !p-4 sm:!p-6">
        <h3 className="font-bold">{r.patient_name}</h3>
        <p>ת.ז. הילד/ה: <bdi>{r.national_id ?? 'לא נמסרה'}</bdi></p>
        <p>איש קשר: {r.contact_name} · <a className="underline" href={`tel:${r.phone}`} dir="ltr">{r.phone}</a></p>
        <p>העדפות המשפחה: {r.availability || 'לא צוינו, יש לתאם בשיחה'}</p>
        {r.status === 'scheduled'
          ? <p>נקבע ל־<bdi>{when(r.scheduled_at)}</bdi> · {r.duration_minutes} דקות · {r.calendar_sync === 'synced' ? 'סונכרן ליומן' : 'ממתין לסנכרון ליומן'}</p>
          : <form className="space-y-3" onSubmit={e => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void act({ action: 'schedule', requestId: r.id, start: f.get('start'), confirmed: f.get('confirmed') === 'on' });
          }}>
            <label className="block">מועד שסוכם עם ההורים
              <select name="start" className="input" required disabled={busy}>
                <option value="">בחרו מועד פנוי</option>
                {data.slots.map((s: string) => <option key={s} value={s}>{when(s)}</option>)}
              </select>
            </label>
            <label className="block"><input name="confirmed" type="checkbox" required disabled={busy} />תיאמתי עם ההורים ובדקתי שהחדר זמין</label>
            <button className="btn-primary" disabled={busy || !data.slots.length}>אישור ושמירת המועד</button>
          </form>}
        <AppointmentEditor requestId={r.id} patientName={r.patient_name} scheduledAt={r.scheduled_at}
          scheduled={r.status === 'scheduled'} slots={data.slots} disabled={busy}
          call={body => call(body, true)}
          onDone={(result, action) => void changeDone(r.id, result, action.action === 'reschedule' ? action.start : undefined)} />
        <TreatmentChangeHistory changes={r.changes} />
      </article>)}
    </>}
  </main>;
}
