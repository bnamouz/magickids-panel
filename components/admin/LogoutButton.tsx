'use client';

import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

export default function LogoutButton() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  async function logout() {
    await supabase.auth.signOut();
    router.push('/admin/login');
    router.refresh();
  }

  return (
    <button
      onClick={logout}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-600 hover:bg-red-50 hover:text-red-600 transition text-sm"
      title="יציאה"
    >
      <LogOut size={16} />
      <span className="hidden sm:inline">יציאה</span>
    </button>
  );
}
