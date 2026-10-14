import Link from 'next/link';
import {loadCalendarAgenda} from '@/lib/calendar-agenda';
import CalendarSyncButton from './CalendarSyncButton';
export default async function CalendarOverview({limit=12}:{limit?:number}){
 const data=await loadCalendarAgenda().catch(()=>null);
 const labels:Record<string,string>={synced:'נרשם ביומן',pending:'ממתין לסנכרון / אישור',syncing:'בתהליך סנכרון',none:'טרם סונכרן',failed:'הסנכרון נכשל',conflict:'התנגשות — נדרשת בדיקה',cancelling:'ביטול בתהליך',not_configured:'היומן אינו מוגדר'};
 const health=data?.health;const stale=!health?.last_run||Date.now()-Date.parse(health.last_run)>26*60*60000;
 return <section className="space-y-4 rounded-2xl border bg-white p-5" aria-label="תורים ומצב סנכרון">
  <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-lg font-bold text-teal-900">כל התורים · מצב סנכרון</h2><p className="text-sm text-slate-500">מרפאת ילדים, קשב, MOXO וטיפולים — מתוך רשומות המערכת, ללא כפילות של אותו אירוע.</p></div><CalendarSyncButton/></div>
  {!data?<p role="alert">לא ניתן לטעון את היומן המאוחד. אין להסיק שאין תורים.</p>:<>
   <p className="text-sm">{data.rows.length} רשומות עתידיות{data.truncated?' לפחות':''} · {data.rows.filter(r=>r.state!=='synced').length} רשומות שממתינות לאישור או לסנכרון</p>
   <p className="text-xs text-slate-500">בדיקת רקע יומית מול גוגל: {health?.last_run?new Date(health.last_run).toLocaleString('he-IL',{timeZone:'Asia/Jerusalem'}):'טרם בוצעה'}. המצב בטבלה הוא מצב השמירה האחרון.</p>
   {(stale||health?.details?.mismatches||health?.details?.failed||health?.details?.error||health?.details?.truncated)?<p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{stale?'נדרשת בדיקת סנכרון עדכנית. ':''}{health?.details?.mismatches?`${health.details.mismatches} פערים בין הרשומות לאירועי גוגל. `:''}{health?.details?.failed?'יש פעולות סנכרון שלא הושלמו. ':''}{health?.details?.error||health?.details?.truncated?'הבדיקה לא הושלמה לכל הרשומות. ':''}אפשר להפעיל בדיקה בכפתור הסנכרון. שינוי ישיר בגוגל דורש אימות לפני עדכון המערכת.</p>:null}
   <div className="overflow-x-auto"><table className="w-full text-right text-sm"><thead><tr className="border-b"><th className="p-2">מועד</th><th className="p-2">מטופל / תור</th><th className="p-2">שירות</th><th className="p-2">מצב</th><th className="p-2">פרטים</th></tr></thead><tbody>{data.rows.slice(0,limit).map(r=><tr key={r.key} className="border-b"><td className="whitespace-nowrap p-2">{new Date(r.start).toLocaleString('he-IL',{timeZone:'Asia/Jerusalem',dateStyle:'short',timeStyle:'short'})}</td><td className="p-2">{r.name}</td><td className="p-2">{r.service}</td><td className={`p-2 ${r.state==='synced'?'text-teal-700':'text-amber-800'}`}>{labels[r.state]??r.state}</td><td className="p-2"><Link className="text-teal-700 underline" href={r.href}>פתיחה</Link></td></tr>)}</tbody></table>{!data.rows.length&&<p className="py-4 text-sm">אין תורים עתידיים ברשומות שנבדקו.</p>}</div>
   {data.rows.length>limit&&<Link href="/admin/appointments" className="text-sm text-teal-700 underline">לכל התורים</Link>}
  </>}
 </section>;
}
