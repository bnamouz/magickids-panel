import Link from 'next/link';
import { getCurrentStaff } from '@/lib/admin/auth';
import LogoutButton from '@/components/admin/LogoutButton';
import AdminNavigation from '@/components/admin/AdminNavigation';
export const dynamic = 'force-dynamic';
export default async function AdminLayout({children}:{children:React.ReactNode}){
 const staff=await getCurrentStaff();
 if(!staff)return <>{children}</>;
 return <div className="min-h-screen bg-slate-50" dir="rtl">
  <a href="#staff-main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:right-2 focus:z-50 focus:rounded focus:bg-white focus:p-3 focus:text-teal-900">דילוג לתוכן הראשי</a>
  <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
   <div className="mx-auto flex min-h-16 max-w-[1440px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
    <Link href="/admin/dashboard" className="flex shrink-0 items-center gap-2"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700 font-bold text-white" aria-hidden="true">יק</span><span><b className="block text-teal-900">ילדי הקסם</b><span className="block text-xs text-slate-500">סביבת העבודה לצוות</span></span></Link>
    <div className="flex items-center gap-3 sm:gap-5"><Link href="/admin/pediatrics-calendar" className="hidden rounded-lg border border-teal-200 px-3 py-2 text-sm font-bold text-teal-800 hover:bg-teal-50 sm:block">יומן מרפאת הילדים</Link><span className="hidden text-sm text-slate-700 md:block"><b className="block">{staff.full_name}</b><span className="text-xs text-slate-500">{roleLabel(staff.role)}</span></span><LogoutButton/></div>
   </div>
  </header>
  <div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-4 py-5 sm:px-6 lg:flex-row lg:gap-7 lg:py-7">
   <AdminNavigation/>
   <main id="staff-main" tabIndex={-1} className="min-w-0 flex-1 outline-none">{children}</main>
  </div>
 </div>;
}
function roleLabel(role:string){return {admin:'מנהל/ת',diagnostician:'מאבחן/ת',assistant:'צוות עזר'}[role]??role;}
