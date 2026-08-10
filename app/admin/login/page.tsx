import { redirect } from 'next/navigation';
import { getCurrentStaff } from '@/lib/admin/auth';
import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { redirect?: string; error?: string };
}) {
  const staff = await getCurrentStaff();
  if (staff) redirect(searchParams.redirect ?? '/admin/dashboard');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-orange-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#01696f]">מכון ילדי הקסם</h1>
          <p className="text-slate-600 mt-2">כניסת צוות קליני</p>
        </div>
        <div className="card">
          <LoginForm
            redirectTo={searchParams.redirect ?? '/admin/dashboard'}
            initialError={searchParams.error}
          />
        </div>
      </div>
    </div>
  );
}
