import { redirect } from 'next/navigation';
import { getCurrentStaff } from '@/lib/admin/auth';
import OwnerWhatsAppTest from '@/components/admin/OwnerWhatsAppTest';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'בדיקת וואטסאפ המכון | Magic Kids', robots: { index: false, follow: false } };

export default async function Page() {
  const staff = await getCurrentStaff();
  if (!staff) redirect('/admin/login?redirect=/admin/whatsapp-test');
  if (staff.role !== 'admin') return <p dir="rtl">בדיקת הוואטסאפ זמינה למנהל המכון בלבד.</p>;
  return <OwnerWhatsAppTest />;
}
