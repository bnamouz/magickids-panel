import {loadDashboardArchive} from '@/lib/intake/dashboard-archive';
import CaseActions from '@/components/admin/CaseActions';
import CalendarOverview from '@/components/admin/CalendarOverview';
import { loadIntakeQueue } from '@/lib/intake/queue';
import { caseDirectory } from '@/lib/intake/directory';
import CaseDirectory from '@/components/admin/CaseDirectory';
import Link from 'next/link';
import { loadCallFollowUps } from '@/lib/voice/follow-up';
import FollowUpButton from '@/components/admin/FollowUpButton';
import { requireStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { Users, Clock, AlertTriangle, CheckCircle2, ArrowLeft, CalendarDays, FilePlus2, Search, RefreshCw, MessageSquare, PhoneCall } from 'lucide-react';
export const dynamic = 'force-dynamic';
export default async function DashboardPage({searchParams={}}:{searchParams?:{q?:string;page?:string;archive?:string;deleted?:string}}){
 const staff=await requireStaff();
 const supabase=getSupabaseAdmin();
 const [allCases,stuck,todayAppointments,treatmentRequests,hidden,callFollowUps]=await Promise.all([
  loadIntakeQueue({includeArchived:true}).catch(()=>null),
  supabase.from('v_stuck_sessions').select('*').limit(5),
  supabase.from('v_today_appointments').select('*').order('scheduled_at',{ascending:true}).limit(10),
  supabase.from('treatment_requests').select('id,patient_name,contact_name,status,created_at',{count:'exact'}).in('status',['pending','contacted']).order('created_at',{ascending:false}).limit(5),
  loadDashboardArchive().catch(()=>null),
  loadCallFollowUps(supabase).catch(()=>null),
 ]);
 const archived=searchParams.archive==='1';
 const visibleCases=allCases&&hidden?allCases.filter(row=>!hidden.has(row.id)):null;
 const queue=visibleCases?.filter(row=>!['closed','cancelled','reported'].includes(row.status))??null;
 const directory=allCases&&hidden?caseDirectory(archived?allCases.filter(row=>hidden.has(row.id)):visibleCases!,searchParams.q,searchParams.page):null;
 const ready=queue?.filter(row=>row.readyToSchedule)??[];
 const stats=[
  {label:'תיקי קשב פעילים',value:queue?.length,icon:Users,href:'/admin/intake?stage=all',color:'text-teal-700 bg-teal-50'},
  {label:'ממתינים לשאלון הורה',value:queue?.filter(row=>row.stage==='parent').length,icon:Clock,href:'/admin/intake?stage=parent',color:'text-amber-700 bg-amber-50'},
  {label:'ממתינים לשאלון מורה',value:queue?.filter(row=>row.stage==='teacher').length,icon:Clock,href:'/admin/intake?stage=teacher',color:'text-blue-700 bg-blue-50'},
  {label:'מוכנים לזימון',value:queue?ready.length:undefined,icon:CheckCircle2,href:'/admin/intake?stage=ready',color:'text-emerald-700 bg-emerald-50'},
 ];
 return <div className="space-y-6">
  {searchParams.deleted==='1'&&<p role="status" className="rounded-xl bg-teal-50 p-4 text-teal-800">התיק הוסר לצמיתות מהרשימה.</p>}
  <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="mb-1 text-sm text-slate-500">{new Date().toLocaleDateString('he-IL',{timeZone:'Asia/Jerusalem',weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p><h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">שלום {staff.full_name.split(' ')[0]}</h1><p className="mt-2 text-sm text-slate-600">התורים, הפניות והתיקים — מה צריך לקדם היום?</p></div><a href="/admin/dashboard" className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100"><RefreshCw size={16}/>רענון נתונים</a></header>
  <section aria-label="חיפוש תיק" className="rounded-2xl bg-teal-800 p-5 text-white sm:p-6"><form action="/admin/dashboard#case-directory" method="get" className="flex flex-wrap items-end gap-3"><label htmlFor="dashboard-search" className="min-w-0 flex-1 basis-64"><span className="mb-2 block font-bold">איזה תיק מחפשים?</span><input id="dashboard-search" name="q" defaultValue={searchParams.q??''} maxLength={120} placeholder="שם הילד/ה או שם ההורה" className="min-h-12 w-full rounded-xl border border-transparent bg-white px-4 text-slate-900 placeholder:text-slate-500 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-white"/></label><button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 font-bold text-teal-900 hover:bg-teal-50"><Search size={18}/>חיפוש תיק</button></form><p className="mt-2 text-xs text-teal-100">החיפוש כולל גם תיקים שהסתיימו ותיקים שכבר הופק בהם דוח.</p></section>
  <section aria-labelledby="quick-actions"><h2 id="quick-actions" className="mb-3 text-sm font-bold text-slate-600">פעולות נפוצות</h2><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
   <QuickLink href="/admin/pediatrics-calendar" title="יומן מרפאת הילדים" detail="צפייה בתורים וקביעת תור חדש" icon={<CalendarDays size={22}/>}/>
   <QuickLink href="/admin/pediatrics-calendar#doctor-requests" title="בקשות לרופא ללא תור" detail="בקשות היום ביומן המרפאה" icon={<MessageSquare size={22}/>}/>
   <QuickLink href="/admin/intake" title="קליטה וזימון לקשב" detail="השלמת שאלונים ותיאום פגישה" icon={<CheckCircle2 size={22}/>}/>
   <QuickLink href="/onboarding/public" title="פתיחת תיק חדש" detail="מעבר לטופס ההרשמה להורים" icon={<FilePlus2 size={22}/>}/>
  </div></section>
  <section aria-labelledby="intake-overview"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 id="intake-overview" className="font-bold text-slate-800">תמונת מצב · קליטת קשב</h2><Link href="/admin/intake" className="text-sm font-semibold text-teal-700 underline">לכל תהליכי הקליטה</Link></div>{queue===null&&<ErrorRow text="לא ניתן לטעון את נתוני הקליטה. המספרים אינם זמינים כרגע."/>}<div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{stats.map(({label,value,icon:Icon,href,color})=><Link key={label} href={href} className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-teal-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700"><div className="mb-3 flex items-center justify-between gap-2"><span className={`rounded-lg p-2 ${color}`}><Icon size={18}/></span><ArrowLeft size={15} className="text-slate-400"/></div><b className="block text-3xl text-slate-900">{value??'—'}</b><span className="mt-1 block text-sm text-slate-600">{label}</span></Link>)}</div></section>
  <CalendarOverview/>
  <section aria-labelledby="today-work"><h2 id="today-work" className="mb-3 text-lg font-bold text-slate-900">לעבודה היום</h2><div className="grid gap-4 xl:grid-cols-2">
   <Panel title="פגישות המכון היום" icon={<CalendarDays size={20}/>} href="/admin/appointments">
    <p className="mb-2 text-xs text-slate-500">עד 10 פגישות, לפי שעה. תורי הילדים ובקשות לרופא מוצגים ביומן המרפאה.</p>
    {todayAppointments.error?<ErrorRow text="לא ניתן לטעון את פגישות היום. נסו לרענן."/>:!todayAppointments.data?.length?<EmptyRow text="אין פגישות מכון מתוזמנות היום"/>:<ul className="divide-y divide-slate-100">{todayAppointments.data.map((row:any)=><li key={row.id} className="flex items-center gap-3 py-3"><time dateTime={row.scheduled_at} className="rounded-lg bg-teal-50 px-3 py-2 font-mono font-bold text-teal-800" dir="ltr">{new Date(row.scheduled_at).toLocaleTimeString('he-IL',{timeZone:'Asia/Jerusalem',hour:'2-digit',minute:'2-digit'})}</time><div className="min-w-0 flex-1"><b className="break-words text-sm text-slate-800">{row.child_name}</b><p className="text-xs text-slate-500">{appointmentLabel(row.appointment_type)}{row.duration_min?` · ${row.duration_min} דקות`:''}</p></div><Link href="/admin/appointments" aria-label={`פרטי הפגישה של ${row.child_name}`} className="p-2 text-teal-700"><ArrowLeft size={18}/></Link></li>)}</ul>}
   </Panel>
   <Panel title="שיחות שדורשות טיפול" icon={<PhoneCall size={20}/>} href="/admin/calls">
    <p className="mb-2 text-xs text-slate-500">שיחות של שרה מ־14 הימים האחרונים: הסלמות, שגיאות, פעולות שנכשלו ובקשות להמשך.</p>
    {callFollowUps===null?<ErrorRow text="לא ניתן לטעון את השיחות. אין בכך אישור שאין שיחות לטיפול."/>:!callFollowUps.length?<EmptyRow text="אין שיחות שממתינות לטיפול"/>:<ul className="divide-y divide-slate-100">{callFollowUps.slice(0,8).map(c=><li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div className="min-w-0 flex-1"><b className="text-sm text-slate-800">{c.child_name||c.caller_name||'מתקשר לא מזוהה'}</b> <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">{c.reason}</span><p className="mt-1 text-xs text-slate-500">{new Date(c.call_started_at||c.created_at).toLocaleString('he-IL',{timeZone:'Asia/Jerusalem',dateStyle:'short',timeStyle:'short'})}{c.next_action?` · ${c.next_action}`:c.purpose?` · ${c.purpose}`:''}</p></div><div className="flex items-center gap-2">{c.linked_case_id&&<Link href={`/admin/sessions/${c.linked_case_id}#calls`} className="text-xs font-semibold text-teal-800 underline">תיק</Link>}<Link href={`/admin/calls/${c.id}`} className="text-xs font-semibold text-teal-800 underline">שיחה</Link><FollowUpButton callId={c.id}/></div></li>)}</ul>}
    {callFollowUps&&callFollowUps.length>8&&<p className="mt-2 text-xs text-slate-500">ועוד {callFollowUps.length-8} שיחות ביומן השיחות.</p>}
   </Panel>
   <Panel title="פניות לטיפול — ממתינות לתיאום" icon={<Users size={20}/>} href="/admin/treatments">
    {treatmentRequests.error?<ErrorRow text="לא ניתן לטעון את הפניות לטיפול. נסו לרענן."/>:<><p className="mb-2 text-sm text-slate-500"><b className="text-lg text-slate-900">{treatmentRequests.count??0}</b> פניות ממתינות · מוצגות עד 5 פניות אחרונות</p>{!treatmentRequests.data?.length?<EmptyRow text="אין פניות שממתינות לתיאום"/>:<ul className="divide-y divide-slate-100">{treatmentRequests.data.map(row=><li key={row.id}><Link href="/admin/treatments" className="flex flex-wrap items-center justify-between gap-2 rounded py-3 hover:bg-slate-50"><div><b className="text-sm text-slate-800">{row.patient_name}</b><p className="text-xs text-slate-500">איש קשר: {row.contact_name}</p></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.status==='pending'?'bg-amber-50 text-amber-800':'bg-blue-50 text-blue-800'}`}>{row.status==='pending'?'פנייה חדשה':'נוצר קשר'}</span></Link></li>)}</ul>}</>}
    <Link href="/admin/treatments?status=closed" className="mt-3 inline-block text-xs text-teal-700 underline">פניות שנסגרו</Link>
   </Panel>
  </div></section>
  <details open={!!searchParams.q||!!searchParams.page||archived} className="rounded-2xl border border-slate-200 bg-white"><summary className="cursor-pointer rounded-2xl p-5 font-bold text-teal-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700">כל התיקים ותשובות השאלונים <span className="font-normal text-sm text-slate-500">· פתיחת המאגר והחיפוש המלא</span></summary><div className="px-3 pb-1"><CaseDirectory result={directory} archived={archived} canDelete={staff.role==='admin'}/></div></details>
  <div className="grid gap-4 xl:grid-cols-2">
   <Panel title="מוכנים לזימון לפגישה" icon={<CheckCircle2 size={20} className="text-emerald-600"/>} href="/admin/intake?stage=ready">
    {queue===null?<ErrorRow text="לא ניתן לטעון את רשימת הממתינים לזימון."/>:ready.length===0?<EmptyRow text="אין תיקים שממתינים לזימון לאחר השלמת שני השאלונים"/>:<><p className="text-xs text-slate-500">מוצגים עד 8 תיקים שהשלימו את שני השאלונים.</p><ul className="divide-y divide-slate-100">{ready.slice(0,8).map(row=><li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div><Link href={'/admin/sessions/'+row.id} className="text-sm font-bold text-teal-800 hover:underline">{row.childName}</Link><p className="mt-1 text-xs text-slate-500">שאלון הורים ומורה הושלמו</p></div><Link href={'/admin/sessions/'+row.id+'#appointments'} className="rounded-lg border border-teal-200 px-3 py-2 text-sm font-bold text-teal-800 hover:bg-teal-50">תיק וזימון ←</Link><CaseActions id={row.id} name={row.childName} canDelete={staff.role==='admin'}/></li>)}</ul></>}
   </Panel>
   <Panel title="תיקים שדורשים המשך טיפול" icon={<AlertTriangle size={20} className="text-amber-600"/>} href="/admin/sessions?filter=stuck">
    {stuck.error||!hidden?<ErrorRow text="לא ניתן לטעון את התיקים שדורשים טיפול. נסו לרענן."/>:!stuck.data?.length?<EmptyRow text="אין תיקים מסומנים להמשך טיפול"/>:<ul className="divide-y divide-slate-100">{stuck.data.filter((row:any)=>!hidden?.has(row.id)).map((row:any)=><li key={row.id}><Link href={`/admin/sessions/${row.id}`} className="flex items-center justify-between gap-3 rounded py-3 hover:bg-slate-50"><div><b className="text-sm text-slate-800">{row.child_name}</b><p className="mt-1 text-xs text-slate-500">{statusLabel(row.status)} · ללא התקדמות {row.days_stuck} ימים</p></div><ArrowLeft size={18} className="shrink-0 text-slate-400"/></Link><CaseActions id={row.id} name={row.child_name} canDelete={staff.role==='admin'}/></li>)}</ul>}
   </Panel>
  </div>
  <p className="text-xs text-slate-500">הנתונים נטענים בפתיחת הדף. לעדכון לאחר פעולה אפשר ללחוץ על ״רענון נתונים״.</p>
 </div>;
}
function QuickLink({href,title,detail,icon}:{href:string;title:string;detail:string;icon:React.ReactNode}){return <Link href={href} className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-teal-500 hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700"><span className="rounded-lg bg-teal-50 p-2 text-teal-700" aria-hidden="true">{icon}</span><span><b className="block text-sm text-slate-800">{title}</b><span className="mt-1 block text-xs leading-5 text-slate-500">{detail}</span></span></Link>;}
function Panel({title,icon,href,children}:{title:string;icon:React.ReactNode;href:string;children:React.ReactNode}){return <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 text-teal-700">{icon}<h2 className="font-bold text-slate-800">{title}</h2></div><Link href={href} aria-label={`הצגת הכול: ${title}`} className="text-xs font-semibold text-teal-700 underline">הצגת הכול</Link></div>{children}</section>;}
function EmptyRow({text}:{text:string}){return <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">{text}</p>;}
function ErrorRow({text}:{text:string}){return <p role="alert" className="my-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{text}</p>;}
function appointmentLabel(value:string){return {assessment:'אבחון קשב',followup:'מעקב',treatment:'טיפול',moxo:'מבדק MOXO'}[value]??value;}
function statusLabel(value:string){return {created:'תיק חדש',parent_form_started:'שאלון הורה בתהליך',parent_form_done:'שאלון הורה הושלם',teacher_link_sent:'קישור למורה נוצר',teacher_form_started:'שאלון מורה בתהליך',teacher_form_done:'שאלון מורה הושלם',profile_ready:'מוכן לזימון',scheduled:'תור נקבע',completed:'הושלם',cancelled:'בוטל'}[value]??value;}
