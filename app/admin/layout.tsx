import localFont from 'next/font/local';
import { getCurrentStaff } from '@/lib/admin/auth';
import LogoutButton from '@/components/admin/LogoutButton';
import AdminNavigation from '@/components/admin/AdminNavigation';
import AdminTopbar from '@/components/admin/AdminTopbar';
import './admin-shell.css';
export const dynamic = 'force-dynamic';
const assistant = localFont({ src: './Assistant-Variable.woff2', weight: '200 800', display: 'swap', fallback: ['Heebo', 'Arial', 'sans-serif'] });
// Applies the saved motion preference before first paint, so a reduced-motion choice never flashes an animation.
const motionScript = `try{if(localStorage.getItem('mk-motion')==='reduced')document.currentScript.parentElement.dataset.motion='reduced'}catch(e){}`;
export default async function AdminLayout({children}:{children:React.ReactNode}){
 const staff=await getCurrentStaff();
 if(!staff)return <>{children}</>;
 const initials=staff.full_name.trim().split(/\s+/).slice(0,2).map((part:string)=>part[0]).join('');
 return <div className={`mk-admin ${assistant.className}`} dir="rtl" suppressHydrationWarning>
  <script dangerouslySetInnerHTML={{__html:motionScript}}/>
  <a href="#staff-main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:right-2 focus:z-50 focus:rounded focus:bg-white focus:p-3 focus:text-teal-900">דילוג לתוכן הראשי</a>
  <div className="mk-app">
   <AdminNavigation footer={<div className="mk-profile"><span className="mk-avatar" aria-hidden="true">{initials}</span><span className="mk-profile-text"><strong>{staff.full_name}</strong><small>{roleLabel(staff.role)}</small></span><LogoutButton/></div>}/>
   <div className="mk-workspace">
    <AdminTopbar end={<span className="mk-topbar-logout"><LogoutButton/></span>}/>
    <main id="staff-main" tabIndex={-1} className="mk-main outline-none">{children}</main>
   </div>
  </div>
 </div>;
}
function roleLabel(role:string){return {admin:'מנהל/ת',diagnostician:'מאבחן/ת',assistant:'צוות עזר'}[role]??role;}
