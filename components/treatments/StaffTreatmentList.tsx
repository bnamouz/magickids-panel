import Link from 'next/link';
import { labels, treatments } from '@/lib/treatments/schema';
import type { TreatmentChange } from '@/lib/therapists/change-reasons';
import RequestControls from '@/components/therapists/RequestControls';
import TreatmentChangeHistory from '@/components/therapists/TreatmentChangeHistory';
import StaffActions from './StaffActions';

export const treatmentStateNames: Record<string, string> = {
  pending: 'ממתין לתיאום', contacted: 'נוצר קשר', scheduled: 'נקבע תור', closed: 'סגור',
};
export type TreatmentFilters = { treatment?: string; status?: string };
type Therapist = { name: string; duration: number };
type StaffTreatment = {
  id: string;
  patient_name: string;
  national_id: string | null;
  contact_name: string;
  phone: string;
  treatment: typeof treatments[number];
  language: string;
  availability: string | null;
  status: string;
  therapist: string | null;
  scheduled_at: string | null;
  duration_minutes: number | null;
  created_at: string;
  therapist_id: string | null;
  calendar_sync: string;
  therapists: Therapist | Therapist[] | null;
};
const date = (s: string) => new Intl.DateTimeFormat('he-IL', {
  timeZone: 'Asia/Jerusalem', dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(s));

export default function StaffTreatmentList({ filters, rows, error, history }: {
  filters: TreatmentFilters;
  rows: StaffTreatment[] | null;
  error: boolean;
  history: Record<string, TreatmentChange[]>;
}) {
  return <section className="space-y-5">
    <h1 className="text-3xl font-bold text-teal-800">פניות וטיפולים במכון</h1>
    <p>הפניות מוצגות מהוותיקה לחדשה, לפי סוג הטיפול שנבחר. לפני שיבוץ יש לתאם עם ההורה ולבדוק זמינות מטפל/ת וחדר. תורים מסונכרנים ליומן Google לפי מצב החיבור המוצג. פניות מוקצות לפי תחום וזמינות; ההעדפות החופשיות של המשפחה דורשות תיאום עם המטפל.</p>
    <div><Link className="btn-primary inline-flex min-h-11 items-center" href="/admin/therapists">ניהול מטפלים ושעות עבודה</Link></div>
    <form className="flex flex-wrap items-end gap-3">
      <label className="grid min-w-0 gap-1">טיפול<select name="treatment" defaultValue={filters.treatment ?? ''} className="input w-full min-w-0 rounded-md border border-slate-300 bg-white p-2">
        <option value="">כל הטיפולים</option>{treatments.map((v, i) => <option key={v} value={v}>{labels.he[i]}</option>)}
      </select></label>
      <label className="grid min-w-0 gap-1">מצב<select name="status" defaultValue={filters.status ?? ''} className="input w-full min-w-0 rounded-md border border-slate-300 bg-white p-2">
        <option value="">כל הפניות הפתוחות</option>{Object.entries(treatmentStateNames).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
      </select></label>
      <button className="btn-ghost min-h-11 !px-4 !py-2">סינון</button>
    </form>
    {error ? <p role="alert">לא ניתן לטעון את הפניות. יש לבדוק את חיבור המערכת.</p>
      : !rows?.length ? <p className="card">אין פניות להצגה.</p>
      : rows.map((row, i) => <article key={row.id} className="card space-y-3">
        <h2 className="text-xl font-bold">{i + 1}. {row.patient_name} · {labels.he[treatments.indexOf(row.treatment)] ?? row.treatment}</h2>
        <p>{treatmentStateNames[row.status]} · התקבלה: {date(row.created_at)} · שפה: {row.language}</p>
        <p>ת.ז. הילד/ה: <bdi>{row.national_id ?? 'לא נמסרה'}</bdi></p>
        <p>{row.contact_name} · <a dir="ltr" href={`tel:${row.phone}`}>{row.phone}</a> · <a href={`https://wa.me/${row.phone.replace('+', '')}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></p>
        {row.availability && <p>זמינות המשפחה: {row.availability}</p>}
        {row.status === 'scheduled' && row.scheduled_at && <p className="font-bold text-teal-800">{date(row.scheduled_at)} · {row.duration_minutes} דקות · {row.therapist}</p>}
        <TreatmentChangeHistory changes={history[row.id]} closed={row.status === 'closed'} />
        <RequestControls id={row.id} assigned={row.therapist_id ? row.therapist : null} status={row.status} calendar={row.calendar_sync} />
        <StaffActions id={row.id} status={row.status} assigned={row.therapist_id ? (Array.isArray(row.therapists) ? row.therapists[0] : row.therapists) ?? undefined : undefined} />
      </article>)}
    {rows?.length === 200 && <p>מוצגות 200 הפניות הראשונות. סננו לפי סוג טיפול ומצב להמשך טיפול.</p>}
  </section>;
}
