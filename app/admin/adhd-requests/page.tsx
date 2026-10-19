import { redirect } from 'next/navigation';
import { calendar_v3 } from 'googleapis';
import { getCurrentStaff } from '@/lib/admin/auth';
import RequestWhatsApp from '@/components/admin/RequestWhatsApp';
import { parseRequest } from '@/lib/admin/request-templates';
import { getCalendarClient, getCalendarId } from '@/lib/google-calendar';
import { localParts, localToUTC, TIME_ZONE } from '@/lib/booking/schedule';

export const dynamic = 'force-dynamic';
const shift = (day: string, n: number) => new Date(Date.parse(day + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);

/** Doctor requests without an appointment for the ADHD clinic (all-day, non-blocking events in the ADHD calendar). */
export default async function AdhdDoctorRequests() {
  if (!await getCurrentStaff()) redirect('/admin/login');
  const today = localParts(new Date()).date;
  let events: calendar_v3.Schema$Event[] = [], failed = false;
  try {
    const client = getCalendarClient(); let pageToken: string | undefined;
    do {
      const r = await client.events.list({ calendarId: getCalendarId(), timeMin: localToUTC(shift(today, -14), 0).toISOString(), timeMax: localToUTC(shift(today, 22), 0).toISOString(), timeZone: TIME_ZONE, singleEvents: true, showDeleted: false, orderBy: 'startTime', maxResults: 2500, pageToken, privateExtendedProperty: ['clinic=adhd'], fields: 'nextPageToken,items(id,summary,description,start,status,created,extendedProperties)' }, { timeout: 15000 });
      events.push(...(r.data.items ?? [])); pageToken = r.data.nextPageToken ?? undefined;
    } while (pageToken);
    events = events.filter(e => e.status !== 'cancelled' && e.extendedProperties?.private?.doctorRequest);
  } catch { failed = true; }
  const upcoming = events.filter(e => (e.start?.date ?? '') >= today), past = events.filter(e => (e.start?.date ?? '') < today).reverse();
  const dayLabel = (d?: string | null) => d ? new Date(d + 'T12:00:00Z').toLocaleDateString('he-IL', { timeZone: TIME_ZONE, dateStyle: 'full' }) : '';
  const sentAt = (c?: string | null) => c ? new Date(c).toLocaleString('he-IL', { timeZone: TIME_ZONE, dateStyle: 'short', timeStyle: 'short' }) : '';
  const card = (e: calendar_v3.Schema$Event) => { const r = parseRequest(e.description, e.summary); return <article key={e.id} className="rounded border bg-white p-3"><h3 className="font-bold">{e.summary}</h3><p className="text-xs text-slate-500">ביומן: {dayLabel(e.start?.date)} · נשלחה: {sentAt(e.created)}</p><p className="whitespace-pre-wrap break-words text-sm" dir="auto">{e.description}</p><RequestWhatsApp clinic="adhd" eventId={e.id ?? ''} phone={r.phone} parent={r.parent} child={r.child} lang={r.lang} /></article>; };
  return <section dir="rtl" className="space-y-4">
    <h1 className="text-2xl font-bold text-teal-800">בקשות מהרופא ללא תור — מרפאת קשב וריכוז</h1>
    <p className="text-sm text-slate-600">בקשות שהורים שלחו מעמוד קביעת התורים של מרפאת הקשב. כל בקשה נשמרת ביומן מרפאת הקשב ביום הפעילות הקרוב, כאירוע לכל היום שאינו חוסם שעות. בקשה אינה תור. מוצגות בקשות מ־14 הימים האחרונים ועד שלושה שבועות קדימה.</p>
    {failed && <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-4">לא ניתן לטעון את הבקשות מיומן גוגל. נסו לרענן.</p>}
    <aside id="doctor-requests" className="space-y-3 rounded-xl border bg-teal-50 p-4"><h2 className="font-bold">בקשות פתוחות ({upcoming.length})</h2>{!failed && !upcoming.length && <p className="text-sm text-slate-600">אין בקשות פתוחות.</p>}{upcoming.map(card)}</aside>
    {past.length > 0 && <details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer font-bold">בקשות קודמות ({past.length})</summary><div className="mt-3 space-y-3">{past.map(card)}</div></details>}
  </section>;
}
