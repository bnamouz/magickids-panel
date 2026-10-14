import {requireStaff} from '@/lib/admin/auth';
import CalendarOverview from '@/components/admin/CalendarOverview';
export const dynamic='force-dynamic';
export default async function AppointmentsPage(){await requireStaff();return <div className="space-y-4"><h1 className="text-2xl font-bold">יומן המערכת — כל השירותים</h1><CalendarOverview limit={200}/></div>;}
