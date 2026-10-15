import { redirect } from 'next/navigation';
import { getCurrentStaff } from '@/lib/admin/auth';
import OwnerMailTest from '@/components/admin/OwnerMailTest';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'בדיקת מייל המכון | Magic Kids', robots: { index: false, follow: false } };

export default async function Page() {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/admin/login?redirect=/admin/mail-test');
  if (staff.role !== 'admin') return <p dir="rtl">בדיקת המייל זמינה למנהל המכון בלבד.</p>;
  return <OwnerMailTest />;
}
