import { redirect } from 'next/navigation';
import { getCurrentStaff } from '@/lib/admin/auth';
import { localParts } from '@/lib/booking/schedule';
import ClinicHoursEditor from '@/components/admin/ClinicHoursEditor';

export const dynamic = 'force-dynamic';
// Published weekly hours (Israel local minutes), mirrored from lib/booking/schedule.ts for display.
const DEFAULTS = {
  pediatrics: { 1: [600, 930], 2: [960, 1200], 3: [600, 810], 4: [1020, 1200], 5: [570, 750], 6: [570, 750] },
  adhd: { 3: [960, 1200] },
} as Record<'pediatrics' | 'adhd', Record<number, [number, number]>>;

export default async function Page() {
  if (!await getCurrentStaff()) redirect('/admin/login');
  return <div className="space-y-5">
    <h1 className="text-3xl font-bold text-teal-800">סגירת יומן ושינוי שעות ליום בודד</h1>
    <p className="text-slate-700">כאן סוגרים את המרפאה ליום מסוים או קובעים שעות שונות ליום אחד. השינוי קובע אילו תורים חדשים יוצעו באתר, אצל נור בטלפון ובפאנל. תורים שכבר נקבעו נשארים ביומן; ביטול תור נעשה מהתיק או מיומן המרפאה.</p>
    <ClinicHoursEditor defaults={DEFAULTS} today={localParts(new Date()).date} />
  </div>;
}
