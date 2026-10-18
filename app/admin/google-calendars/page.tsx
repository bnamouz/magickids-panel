import { redirect } from 'next/navigation';
import { getCurrentStaff, isAdmin } from '@/lib/admin/auth';
import { calendarInfo, ROLE_HE, type CalendarKey } from '@/lib/admin/calendar-sharing';
import CalendarShareForm from '@/components/admin/CalendarShareForm';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/admin/login');
  if (!isAdmin(staff)) return <section className="card"><h1 className="text-2xl font-bold text-teal-800">יומני גוגל של Magic Kids</h1><p className="mt-2">הדף זמין למנהל המערכת בלבד.</p></section>;
  const keys: CalendarKey[] = ['adhd', 'pediatrics'];
  const cals = await Promise.all(keys.map(k => calendarInfo(k).catch(() => null)));
  return <div className="space-y-5">
    <h1 className="text-3xl font-bold text-teal-800">יומני גוגל של Magic Kids</h1>
    <p className="text-slate-700">כאן רואים לאילו חשבונות גוגל יש גישה ליומני המערכת, ומשתפים יומן עם החשבון שלכם. אחרי השיתוף היומן יופיע ביומן גוגל, במחשב ובאפליקציה בטלפון, תחת "יומנים אחרים". כל תור שנקבע באתר, על ידי שרה או נור, או בפאנל, יופיע שם.</p>
    {cals.map((c, i) => <section key={keys[i]} className="card space-y-3">
      {!c ? <p className="text-red-700">לא ניתן לטעון את {keys[i] === 'adhd' ? 'יומן המכון' : 'יומן מרפאת הילדים'} כרגע.</p> : <>
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold">{c.label}</h2><a className="btn-ghost" href={c.openUrl} target="_blank" rel="noopener noreferrer">פתיחה ביומן גוגל</a></div>
        {c.name && <p className="text-sm text-slate-600">שם היומן בגוגל: <b>{c.name}</b></p>}
        <div><h3 className="text-sm font-bold text-slate-600">חשבונות עם גישה</h3>
          {c.acl === null ? <p className="text-sm text-amber-800">לחשבון המערכת אין הרשאה לראות את רשימת השיתוף של היומן הזה.</p>
            : <ul className="mt-1 space-y-1 text-sm">{c.acl.map(a => <li key={a.email} className="flex flex-wrap gap-2"><span dir="ltr" className="font-mono">{a.email}</span><span className="text-slate-500">· {ROLE_HE[a.role] ?? a.role}</span></li>)}</ul>}
        </div>
        <CalendarShareForm calendar={c.key} defaultEmail={staff.email} />
        <p className="text-xs text-slate-500">"פתיחה ביומן גוגל" עובד רק אחרי שהיומן שותף עם החשבון שמחובר כרגע לגוגל בדפדפן.</p>
      </>}
    </section>)}
  </div>;
}
