import {loadDashboardArchive} from '@/lib/intake/dashboard-archive';
import CalendarOverview from '@/components/admin/CalendarOverview';
import { loadIntakeQueue } from '@/lib/intake/queue';
import { caseDirectory } from '@/lib/intake/directory';
import CaseDirectory from '@/components/admin/CaseDirectory';
import WorkQueue, { type WorkItem } from '@/components/admin/dashboard/WorkQueue';
import ReplayIntro from '@/components/admin/dashboard/ReplayIntro';
import Link from 'next/link';
import { loadCallFollowUps } from '@/lib/voice/follow-up';
import { loadCalendarAgenda } from '@/lib/calendar-agenda';
import { requireStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { Users, CheckCircle2, ArrowLeft, CalendarDays, FilePlus2, Search, RefreshCw, MessageSquare } from 'lucide-react';
export const dynamic = 'force-dynamic';
const TZ='Asia/Jerusalem';
const dayKey=(value:string|number|Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:TZ}).format(new Date(value));
const clock=(value:string)=>new Date(value).toLocaleTimeString('he-IL',{timeZone:TZ,hour:'2-digit',minute:'2-digit'});
const CALL_LIMIT=8,READY_LIMIT=8;
export default async function DashboardPage({searchParams={}}:{searchParams?:{q?:string;page?:string;archive?:string;deleted?:string}}){
 const staff=await requireStaff();
 const supabase=getSupabaseAdmin();
 const [allCases,stuck,todayAppointments,treatmentRequests,hidden,callFollowUps,agenda]=await Promise.all([
  loadIntakeQueue({includeArchived:true}).catch(()=>null),
  supabase.from('v_stuck_sessions').select('*').limit(5),
  supabase.from('v_today_appointments').select('*').order('scheduled_at',{ascending:true}).limit(10),
  supabase.from('treatment_requests').select('id,patient_name,contact_name,status,created_at',{count:'exact'}).in('status',['pending','contacted']).order('created_at',{ascending:false}).limit(5),
  loadDashboardArchive().catch(()=>null),
  loadCallFollowUps(supabase).catch(()=>null),
  loadCalendarAgenda().catch(()=>null),
 ]);
 const today=dayKey(Date.now()),tomorrow=dayKey(Date.now()+86400000),yesterday=dayKey(Date.now()-86400000);
 const when=(value:string)=>{const key=dayKey(value);return `${key===today?'היום':key===yesterday?'אתמול':new Date(value).toLocaleDateString('he-IL',{timeZone:TZ,day:'numeric',month:'numeric'})} ב־${clock(value)}`;};
 const archived=searchParams.archive==='1';
 const canDelete=staff.role==='admin';
 const visibleCases=allCases&&hidden?allCases.filter(row=>!hidden.has(row.id)):null;
 const queue=visibleCases?.filter(row=>!['closed','cancelled','reported'].includes(row.status))??null;
 const directory=allCases&&hidden?caseDirectory(archived?allCases.filter(row=>hidden.has(row.id)):visibleCases!,searchParams.q,searchParams.page):null;
 const ready=queue?.filter(row=>row.readyToSchedule)??[];
 const stuckFailed=!!stuck.error||!hidden;
 const stuckRows:any[]=stuckFailed?[]:(stuck.data??[]).filter((row:any)=>!hidden!.has(row.id));
 const requestRows=treatmentRequests.error?[]:treatmentRequests.data??[];
 const requestCount=treatmentRequests.error?0:treatmentRequests.count??requestRows.length;

 // One list, most urgent first: calls that need a person, new treatment requests, cases ready to book, cases without progress.
 const items:WorkItem[]=[
  ...(callFollowUps??[]).slice(0,CALL_LIMIT).map((c):WorkItem=>({key:'call-'+c.id,kind:'call',kindLabel:'שיחה',title:c.child_name||c.caller_name||'מתקשר לא מזוהה',badge:c.reason,tone:'warn',meta:[when(c.call_started_at||c.created_at),c.next_action||c.purpose].filter(Boolean).join(' · '),href:`/admin/calls/${c.id}`,action:'פתיחת השיחה',callId:c.id,linkedCaseId:c.linked_case_id})),
  ...requestRows.map((row):WorkItem=>({key:'request-'+row.id,kind:'request',kindLabel:'פנייה לטיפול',title:row.patient_name,badge:row.status==='pending'?'פנייה חדשה':'נוצר קשר',tone:row.status==='pending'?'warn':'info',meta:[`איש קשר: ${row.contact_name}`,row.created_at?`התקבלה ${when(row.created_at)}`:''].filter(Boolean).join(' · '),href:'/admin/treatments',action:'לתיאום'})),
  ...ready.slice(0,READY_LIMIT).map((row):WorkItem=>({key:'ready-'+row.id,kind:'case',kindLabel:'תיק קשב',title:row.childName,titleHref:'/admin/sessions/'+row.id,badge:'מוכן לזימון',tone:'ok',meta:'שאלון הורים ומורה הושלמו',href:'/admin/sessions/'+row.id+'#appointments',action:'תיק וזימון',caseId:row.id})),
  ...stuckRows.map((row):WorkItem=>({key:'stuck-'+row.id,kind:'case',kindLabel:'תיק קשב',title:row.child_name,badge:`ללא התקדמות ${row.days_stuck} ימים`,tone:'warn',meta:statusLabel(row.status),href:`/admin/sessions/${row.id}`,action:'פתיחת התיק',caseId:row.id})),
 ];
 const errors=[
  callFollowUps===null&&'לא ניתן לטעון את השיחות. אין בכך אישור שאין שיחות לטיפול.',
  treatmentRequests.error&&'לא ניתן לטעון את הפניות לטיפול. נסו לרענן.',
  queue===null&&'לא ניתן לטעון את רשימת הממתינים לזימון.',
  stuckFailed&&'לא ניתן לטעון את התיקים שדורשים טיפול. נסו לרענן.',
 ].filter(Boolean) as string[];
 const notes=[
  callFollowUps&&callFollowUps.length>CALL_LIMIT&&`מוצגות ${CALL_LIMIT} שיחות; עוד ${callFollowUps.length-CALL_LIMIT} ביומן השיחות.`,
  requestCount>requestRows.length&&`מוצגות ${requestRows.length} הפניות האחרונות מתוך ${requestCount}.`,
  ready.length>READY_LIMIT&&`מוצגים ${READY_LIMIT} תיקים מוכנים לזימון מתוך ${ready.length}.`,
  'שיחות: של שרה מ־14 הימים האחרונים — הסלמות, שגיאות, פעולות שנכשלו ובקשות להמשך.',
 ].filter(Boolean) as string[];

 const todayRows=agenda?.rows.filter(row=>dayKey(row.start)===today)??[];
 const upcoming=agenda?.rows.slice(0,6)??[];
 const dayLabel=(value:string)=>{const key=dayKey(value);return key===today?'היום':key===tomorrow?'מחר':new Date(value).toLocaleDateString('he-IL',{timeZone:TZ,day:'numeric',month:'numeric'});};
 const kpis=[
  {label:'תורים שנותרו היום',value:agenda?`${todayRows.length}${agenda.truncated?'+':''}`:undefined,href:'/admin/appointments',note:!agenda?'היומן המאוחד לא נטען':todayRows.length?`הקרוב ב־${clock(todayRows[0].start)} · ${todayRows[0].service}`:'אין תורים נוספים היום',warn:!agenda},
  {label:'פניות לטיפול ממתינות',value:treatmentRequests.error?undefined:requestCount,href:'/admin/treatments',note:treatmentRequests.error?'הפניות לא נטענו':'ממתינות לתיאום מול ההורים',warn:!!treatmentRequests.error},
  {label:'שיחות לטיפול',value:callFollowUps?.length,href:'/admin/calls',note:callFollowUps?'מ־14 הימים האחרונים':'השיחות לא נטענו',warn:!callFollowUps},
  {label:'מוכנים לזימון',value:queue?ready.length:undefined,href:'/admin/intake?stage=ready',note:queue?'שני השאלונים הושלמו':'נתוני הקליטה לא נטענו',warn:!queue},
 ];
 const intake=[
  {label:'תיקי קשב פעילים',value:queue?.length,href:'/admin/intake?stage=all'},
  {label:'ממתינים לשאלון הורה',value:queue?.filter(row=>row.stage==='parent').length,href:'/admin/intake?stage=parent'},
  {label:'ממתינים לשאלון מורה',value:queue?.filter(row=>row.stage==='teacher').length,href:'/admin/intake?stage=teacher'},
 ];
 return <div className="mk-dash">
  {searchParams.deleted==='1'&&<p role="status" className="mk-flash">התיק הוסר לצמיתות מהרשימה.</p>}
  <header className="mk-heading">
   <div className="mk-heading-copy">
    <p className="mk-date">{new Date().toLocaleDateString('he-IL',{timeZone:TZ,weekday:'long',day:'numeric',month:'long',year:'numeric'})} · שלום {staff.full_name.split(' ')[0]}</p>
    <h1>סקירה יומית</h1>
    <p className="mk-subtitle">מקום לצמוח. מרחב להתקדם.</p>
    <div className="mk-heading-links"><a href="/admin/dashboard" className="mk-text-link"><RefreshCw size={14} aria-hidden="true"/>רענון נתונים</a><ReplayIntro/></div>
   </div>
   {/* eslint-disable-next-line @next/next/no-img-element */}
   <div className="mk-scene" aria-hidden="true"><img src="/dashboard/growth-3d.webp" alt="" width={959} height={540} decoding="async"/></div>
  </header>
  <form action="/admin/dashboard#case-directory" method="get" role="search" aria-label="חיפוש תיק" className="mk-search">
   <label htmlFor="dashboard-search"><span className="sr-only">איזה תיק מחפשים?</span><Search size={18} aria-hidden="true"/><input id="dashboard-search" name="q" defaultValue={searchParams.q??''} maxLength={120} placeholder="חיפוש תיק: שם הילד/ה או שם ההורה" className="mk-search-input"/></label>
   <button className="mk-button mk-button-primary">חיפוש תיק</button>
   <p className="mk-search-hint">החיפוש כולל גם תיקים שהסתיימו ותיקים שכבר הופק בהם דוח.</p>
  </form>
  <section aria-label="מדדי היום" className="mk-kpis">{kpis.map(({label,value,href,note,warn})=><Link key={label} href={href} className="mk-kpi"><span className="mk-kpi-label">{label}</span><b className="mk-kpi-value">{value??'—'}</b><span className="mk-kpi-note" data-tone={warn?'warn':undefined}>{note}</span></Link>)}</section>
  <section aria-labelledby="intake-overview" className="mk-intake"><h2 id="intake-overview">קליטת קשב</h2>{queue===null&&<span role="alert" className="mk-badge" data-tone="warn">לא ניתן לטעון את נתוני הקליטה. המספרים אינם זמינים כרגע.</span>}{intake.map(({label,value,href})=><Link key={label} href={href} className="mk-intake-link"><b>{value??'—'}</b>{label}</Link>)}<Link href="/admin/intake" className="mk-intake-link mk-intake-all">לכל תהליכי הקליטה</Link></section>
  <div className="mk-grid">
   <WorkQueue items={items} counts={{call:callFollowUps?.length??0,request:requestCount,case:ready.length+stuckRows.length}} failed={{call:callFollowUps===null,request:!!treatmentRequests.error,case:queue===null||stuckFailed}} errors={errors} notes={notes} canDelete={canDelete}/>
   <div className="mk-side">
    <section className="mk-panel mk-quiet" aria-labelledby="agenda-title">
     <div className="mk-panel-head"><h2 id="agenda-title">התורים הקרובים</h2><Link href="/admin/appointments" className="mk-panel-link" aria-label="לכל התורים ביומן">לכל התורים</Link></div>
     {!agenda?<p role="alert" className="mk-alert">לא ניתן לטעון את היומן המאוחד. אין להסיק שאין תורים.</p>:!upcoming.length?<p className="mk-empty">אין תורים עתידיים ברשומות שנבדקו.</p>:<ul className="mk-agenda">{upcoming.map((row,index)=><li key={row.key} data-next={index===0?'true':undefined}>{index===0&&<span className="mk-next-label">התור הבא</span>}<Link href={row.href} className="mk-appt"><time dateTime={row.start}><bdi>{clock(row.start)}</bdi><small>{dayLabel(row.start)}</small></time><span className="mk-appt-body"><b>{row.name}</b><small>{row.service}</small>{row.state!=='synced'&&<small data-tone="warn">ממתין לאישור או לסנכרון</small>}</span></Link></li>)}</ul>}
    </section>
    <section className="mk-panel mk-quiet" aria-labelledby="quick-actions">
     <div className="mk-panel-head"><h2 id="quick-actions">פעולות נפוצות</h2></div>
     <ul className="mk-shortcuts">
      <QuickLink href="/admin/pediatrics-calendar" title="יומן מרפאת הילדים" detail="צפייה בתורים וקביעת תור חדש" icon={<CalendarDays size={18}/>}/>
      <QuickLink href="/admin/clinic-hours" title="סגירת יומן ושינוי שעות" detail="סגירה או שעות אחרות ליום בודד" icon={<CalendarDays size={18}/>}/>
      <QuickLink href="/admin/pediatrics-calendar#doctor-requests" title="בקשות לרופא ללא תור" detail="בקשות היום ביומן המרפאה" icon={<MessageSquare size={18}/>}/>
      <QuickLink href="/admin/adhd-requests" title="בקשות לרופא — קשב" detail="בקשות ללא תור במרפאת הקשב" icon={<MessageSquare size={18}/>}/>
      <QuickLink href="/admin/leads" title="לידים ושימוש באתר" detail="כל הפונים מכל הערוצים ומדידת ביקורים" icon={<Users size={18}/>}/>
      <QuickLink href="/admin/intake" title="קליטה וזימון לקשב" detail="השלמת שאלונים ותיאום פגישה" icon={<CheckCircle2 size={18}/>}/>
      <QuickLink href="/onboarding/public" title="פתיחת תיק חדש" detail="מעבר לטופס ההרשמה להורים" icon={<FilePlus2 size={18}/>}/>
     </ul>
    </section>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <figure className="mk-aspiration"><img src="/dashboard/aspiration-3d.webp" alt="" width={959} height={540} loading="lazy" decoding="async"/><figcaption>כל צעד קטן פותח אפשרות גדולה.</figcaption></figure>
   </div>
  </div>
  <section aria-labelledby="today-work">
   <h2 id="today-work" className="mk-section-title">יומן ותורים</h2>
   <div className="mk-grid">
    <CalendarOverview data={agenda}/>
    <section className="mk-panel" aria-labelledby="today-institute">
     <div className="mk-panel-head"><h2 id="today-institute">פגישות המכון היום</h2><Link href="/admin/appointments" className="mk-panel-link" aria-label="הצגת הכול: פגישות המכון היום">הצגת הכול</Link><p>עד 10 פגישות, לפי שעה. תורי הילדים ובקשות לרופא מוצגים ביומן המרפאה.</p></div>
     {todayAppointments.error?<p role="alert" className="mk-alert">לא ניתן לטעון את פגישות היום. נסו לרענן.</p>:!todayAppointments.data?.length?<p className="mk-empty">אין פגישות מכון מתוזמנות היום</p>:<ul className="mk-today">{todayAppointments.data.map((row:any)=><li key={row.id}><time dateTime={row.scheduled_at} dir="ltr">{clock(row.scheduled_at)}</time><div><b>{row.child_name}</b><p>{appointmentLabel(row.appointment_type)}{row.duration_min?` · ${row.duration_min} דקות`:''}</p></div><Link href="/admin/appointments" aria-label={`פרטי הפגישה של ${row.child_name}`} className="mk-today-link"><ArrowLeft size={18} aria-hidden="true"/></Link></li>)}</ul>}
    </section>
   </div>
  </section>
  <details open={!!searchParams.q||!!searchParams.page||archived} className="mk-directory" data-region="case-directory"><summary className="mk-directory-summary">כל התיקים ותשובות השאלונים <span>· פתיחת המאגר והחיפוש המלא</span></summary><div className="px-3 pb-1"><CaseDirectory result={directory} archived={archived} canDelete={canDelete}/></div></details>
  <p className="mk-footnote">הנתונים נטענים בפתיחת הדף. לעדכון לאחר פעולה אפשר ללחוץ על ״רענון נתונים״.</p>
 </div>;
}
function QuickLink({href,title,detail,icon}:{href:string;title:string;detail:string;icon:React.ReactNode}){return <li><Link href={href} className="mk-shortcut"><span aria-hidden="true">{icon}</span><span><b>{title}</b><span>{detail}</span></span></Link></li>;}
function appointmentLabel(value:string){return {assessment:'אבחון קשב',followup:'מעקב',treatment:'טיפול',moxo:'מבדק MOXO'}[value]??value;}
function statusLabel(value:string){return {created:'תיק חדש',parent_form_started:'שאלון הורה בתהליך',parent_form_done:'שאלון הורה הושלם',teacher_link_sent:'קישור למורה נוצר',teacher_form_started:'שאלון מורה בתהליך',teacher_form_done:'שאלון מורה הושלם',profile_ready:'מוכן לזימון',scheduled:'תור נקבע',completed:'הושלם',cancelled:'בוטל'}[value]??value;}
