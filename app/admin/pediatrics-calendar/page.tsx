import Link from 'next/link';
import BookSlot from './BookSlot';
import { redirect } from 'next/navigation';
import { calendar_v3 } from 'googleapis';
import { getCurrentStaff } from '@/lib/admin/auth';
import { getCalendarClient } from '@/lib/google-calendar';
import { getPediatricsCalendarId } from '@/lib/pediatrics-calendar';
import { localParts, localToUTC, TIME_ZONE, clinicHours } from '@/lib/booking/schedule';

export const dynamic = 'force-dynamic';
const clock = (n:number) => `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const shift = (day:string,n:number) => new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const time = (iso:string) => new Date(iso).toLocaleTimeString('he-IL',{timeZone:TIME_ZONE,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});

export default async function PediatricsCalendar({searchParams}:{searchParams:{date?:string}}) {
  if (!await getCurrentStaff()) redirect('/admin/login');
  const today=localParts(new Date()).date;
  const input=searchParams.date;
  const day=typeof input==='string' && /^\d{4}-\d{2}-\d{2}$/.test(input) && Number.isFinite(Date.parse(input)) && new Date(input).toISOString().slice(0,10)===input ? input : today;
  const hours=clinicHours('pediatrics',day);
  let events:calendar_v3.Schema$Event[]=[];
  let failed=false;
  try {
    const client=getCalendarClient();
    let pageToken:string|undefined;
    do {
      const result=await client.events.list({calendarId:getPediatricsCalendarId(),timeMin:localToUTC(day,0).toISOString(),timeMax:localToUTC(shift(day,1),0).toISOString(),timeZone:TIME_ZONE,singleEvents:true,showDeleted:false,orderBy:'startTime',maxResults:2500,pageToken,fields:'nextPageToken,items(id,summary,start,end,status,transparency)'},{timeout:15000});
      events.push(...(result.data.items??[]));
      pageToken=result.data.nextPageToken??undefined;
    } while(pageToken);
    events=events.filter(e=>e.status!=='cancelled');
  } catch {failed=true;events=[];}
  const allDay=events.filter(e=>e.start?.date);
  const timed=events.filter(e=>e.start?.dateTime&&e.end?.dateTime);
  const outside=timed.filter(e=>!hours || Date.parse(e.start!.dateTime!)<localToUTC(day,hours[0]).getTime() || Date.parse(e.end!.dateTime!)>localToUTC(day,hours[1]).getTime());
  return <section dir="rtl" className="space-y-4">
    <h1 className="text-2xl font-bold text-teal-800">יומן מרפאת הילדים — כל 10 דקות</h1>
    <p className="text-sm text-slate-600">מוצגות רק שעות הפעילות של מרפאת הילדים, בחלוקה של 10 דקות גם ללא תורים. השעות לפי שעון ישראל. התורים נקראים מיומן גוגל בעת פתיחת הדף או רענון. שורה ריקה אינה אישור שהמרפאה פתוחה להזמנות.</p>
    <nav className="flex flex-wrap gap-3 items-center" aria-label="בחירת יום">
      <Link className="underline" href={`?date=${shift(day,-1)}`}>יום קודם</Link>
      <Link className="underline" href={`?date=${today}`}>היום</Link>
      <Link className="underline" href={`?date=${shift(day,1)}`}>יום הבא</Link>
      <form className="flex flex-wrap gap-2"><label>תאריך <input className="border rounded p-2" type="date" name="date" defaultValue={day} key={day} required/></label><button className="rounded bg-teal-700 text-white px-4">הצגה / רענון</button></form>
      <Link href="/admin/appointments" className="underline">פגישות המכון</Link>
    </nav>
    <h2 className="font-bold">{new Date(day+'T12:00:00Z').toLocaleDateString('he-IL',{timeZone:TIME_ZONE,dateStyle:'full'})}</h2>
    {hours?<p>שעות הפעילות היום: <b dir="ltr">{clock(hours[0])}–{clock(hours[1])}</b></p>:<p className="bg-slate-100 p-4 rounded">המרפאה סגורה ביום זה לפי שעות הפעילות המוגדרות.</p>}
    {failed&&<p role="alert" className="bg-amber-50 border border-amber-300 p-4 rounded">לא ניתן לטעון את התורים מיומן גוגל. חלוקת השעות מוצגת, אך מצב התפוסה אינו ידוע. נסו לרענן.</p>}
    {allDay.length>0&&<aside className="bg-amber-50 p-3 rounded"><h3 className="font-bold">אירועים לכל היום</h3>{allDay.map((e,i)=><p key={e.id??i}>{e.summary||'אירוע ללא כותרת'} {e.transparency==='transparent'?'(אינו חוסם זמן)':'(חוסם את היום)'}</p>)}</aside>}
    {outside.length>0&&<aside className="bg-amber-50 p-3 rounded"><h3 className="font-bold">אירועים החורגים משעות הפעילות</h3>{outside.map((e,i)=><p key={e.id??i}>{e.summary||'תור ללא כותרת'} · <span dir="ltr">{time(e.start!.dateTime!)}–{time(e.end!.dateTime!)}</span></p>)}</aside>}
    {hours&&<div className="rounded-xl border overflow-hidden bg-white"><table className="w-full text-sm"><caption className="sr-only">יומן מרפאת הילדים ליום {day} בחלוקה של עשר דקות</caption><thead className="bg-slate-100"><tr><th className="p-3 text-right">שעה</th><th className="p-3 text-right">תורים מיומן גוגל</th></tr></thead><tbody>
      {Array.from({length:Math.floor((hours[1]-hours[0])/10)},(_,i)=>{
        const minute=hours[0]+i*10,start=localToUTC(day,minute).getTime(),end=localToUTC(day,minute+10).getTime();
        const matches=timed.filter(e=>Date.parse(e.start!.dateTime!)<end&&Date.parse(e.end!.dateTime!)>start);
        return <tr key={minute} id={minute%60===0?`hour-${minute/60}`:undefined} className={`${minute%60===0?'border-t-2 border-slate-300':'border-t border-slate-100'} ${matches.length?'bg-teal-50':''} scroll-mt-20`}>
          <th scope="row" className="p-3 w-36 font-mono align-top whitespace-nowrap" dir="ltr">{clock(minute)}–{clock(minute+10)}</th>
          <td className="p-3">{failed?<span className="text-slate-500">לא ידוע</span>:matches.length?matches.map((e,j)=><div key={e.id??j} className="border-r-4 border-teal-600 pr-3 mb-2"><b>{e.summary||'תור ללא כותרת'}</b><span className="block text-xs" dir="ltr">{time(e.start!.dateTime!)}–{time(e.end!.dateTime!)}</span>{e.transparency==='transparent'&&<small>אינו חוסם זמן</small>}</div>):allDay.some(e=>e.transparency!=='transparent')?<span>חסום באירוע לכל היום</span>:<span className="text-slate-400">אין תור ביומן</span>}{!failed&&start>Date.now()&&!matches.some(e=>e.transparency!=='transparent')&&!allDay.some(e=>e.transparency!=='transparent')&&<BookSlot start={new Date(start).toISOString()} label={clock(minute)}/>}</td>
        </tr>;
      })}
    </tbody></table></div>}
  </section>;
}
