'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { CalendarDays, ClipboardList, HeartPulse, LayoutDashboard, Menu, MessageSquare, Users, X } from 'lucide-react';
const groups = [
 {title:'מרפאת הילדים',icon:HeartPulse,items:[['/admin/pediatrics-calendar','יומן ילדים ובקשות לרופא'],['/admin/clinic-patients','מטופלי המרפאה']]},
 {title:'קשב ואבחונים',icon:ClipboardList,items:[['/admin/intake','קליטה וזימון לקשב'],['/admin/sessions','תיקי מטופלים'],['/admin/appointments','יומן פגישות המכון'],['/admin/moxo','בקשות MOXO'],['/admin/adhd-payments','אימות תשלומים לקשב'],['/admin/adhd-requests','בקשות לרופא — קשב']]},
 {title:'טיפולים וצוות',icon:Users,items:[['/admin/treatments','פניות וטיפולים'],['/admin/therapists','מטפלים ושעות עבודה'],['/admin/rana','בקשות תור לרנא'],['/admin/recruitment','גיוס מטפלים']]},
 {title:'שירותי המכון',icon:CalendarDays,items:[['/admin/development','התפתחות הילד'],['/admin/classes','חוגים ומתעניינים'],['/admin/abroad','ליווי ילדים בחו״ל'],['/admin/reviews','חוות דעת ותמונות'],['/admin/leads','לידים ושימוש באתר']]},
 {title:'שיחות',icon:MessageSquare,items:[['/admin/calls','שיחות שרה'],['/admin/personal/calls','שיחות נור'],['/admin/google-calendars','יומני גוגל — שיתוף'],['/admin/system-health','בריאות המערכת']]},
];
export default function AdminNavigation(){
 const pathname=usePathname();
 const [open,setOpen]=useState(false);
 const active=(href:string)=>pathname===href||pathname.startsWith(href+'/');
 const link=(href:string,label:string)=><Link key={href} href={href} aria-current={active(href)?'page':undefined} onClick={()=>setOpen(false)} className={`flex min-h-11 items-center rounded-lg px-3 py-2 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${active(href)?'bg-teal-700 text-white font-bold shadow-sm':'text-slate-600 hover:bg-teal-50 hover:text-teal-900'}`}>{label}</Link>;
 return <aside className="w-full lg:w-60 lg:shrink-0">
  <button type="button" aria-expanded={open} aria-controls="staff-navigation" onClick={()=>setOpen(v=>!v)} className="flex w-full items-center justify-between rounded-xl border bg-white p-3 font-bold text-teal-900 lg:hidden">תפריט הצוות{open?<X size={20}/>:<Menu size={20}/>}</button>
  <nav id="staff-navigation" aria-label="ניווט צוות לפי תחום" className={`${open?'block':'hidden'} mt-3 rounded-2xl border border-slate-200 bg-white p-3 lg:sticky lg:top-24 lg:mt-0 lg:block lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto`}>
   <div className="mb-3 border-b pb-3"><Link href="/admin/dashboard" aria-current={pathname==='/admin/dashboard'?'page':undefined} onClick={()=>setOpen(false)} className={`flex min-h-11 items-center gap-2 rounded-lg px-3 font-bold ${pathname==='/admin/dashboard'?'bg-teal-700 text-white':'text-teal-900 hover:bg-teal-50'}`}><LayoutDashboard size={18}/>סביבת העבודה שלי</Link></div>
   {groups.map(({title,icon:Icon,items})=><section key={title} className="mb-4 last:mb-0"><h2 className="mb-1 flex items-center gap-2 px-3 text-xs font-bold text-slate-500"><Icon size={15} aria-hidden="true"/>{title}</h2><div className="space-y-0.5">{items.map(([href,label])=>link(href,label))}</div></section>)}
  </nav>
 </aside>;
}
