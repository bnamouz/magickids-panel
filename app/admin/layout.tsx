import Link from 'next/link';
import { getCurrentStaff } from '@/lib/admin/auth';
import { LayoutDashboard, Users, Calendar, LogOut } from 'lucide-react';
import LogoutButton from '@/components/admin/LogoutButton';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await getCurrentStaff();

  // /admin/login has its own layout — skip chrome there.
  // We can't easily detect route here, so wrap conditionally in each page.
  // If no staff, show login-only content (children will be the login page).
  if (!staff) return <>{children}</>;

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/admin/dashboard" className="flex items-center gap-2">
            <div className="w-9 h-9 bg-[#01696f] rounded-lg flex items-center justify-center text-white font-bold">
              יק
            </div>
            <div>
              <div className="font-bold text-[#01696f]">ילדי הקסם</div>
              <div className="text-xs text-slate-500 -mt-1">פאנל צוות</div>
            </div>
          </Link>

          <div className="flex items-center gap-4">
            <div className="text-sm text-slate-700 hidden sm:block">
              <div className="font-semibold">{staff.full_name}</div>
              <div className="text-xs text-slate-500">{roleLabel(staff.role)}</div>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Main layout: sidebar + content */}
      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-6">
        <aside className="w-56 flex-shrink-0 hidden md:block">
          <nav className="space-y-1">
            <NavLink href="/admin/dashboard" icon={<LayoutDashboard size={18} />}>
              דשבורד
            </NavLink>
            <NavLink href="/admin/sessions" icon={<Users size={18} />}>
              תיקים פעילים
            </NavLink>
            <NavLink href="/admin/appointments" icon={<Calendar size={18} />}>
              יומן פגישות
            </NavLink>
          </nav>
        </aside>

        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-700 hover:bg-teal-50 hover:text-[#01696f] transition"
    >
      {icon}
      <span className="font-medium">{children}</span>
    </Link>
  );
}

function roleLabel(role: string): string {
  return { admin: 'מנהל/ת', diagnostician: 'מאבחן/ת', assistant: 'צוות עזר' }[role] ?? role;
}
