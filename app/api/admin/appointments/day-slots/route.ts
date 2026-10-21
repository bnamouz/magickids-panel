import { NextRequest, NextResponse } from 'next/server';
import { getCurrentStaff } from '@/lib/admin/auth';
import { dayBusy, hourAvailability } from '@/lib/appointments/day-availability';
import { localToUTC, TIME_ZONE, clinicHours } from '@/lib/booking/schedule';
import { loadOverrides } from '@/lib/booking/overrides';

export const dynamic = 'force-dynamic';

/** Hour and quarter-hour availability of the doctor for one ADHD clinic day, from the database guard view and both Google calendars. */
export async function GET(req: NextRequest) {
  if (!await getCurrentStaff()) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const date = req.nextUrl.searchParams.get('date') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'date (YYYY-MM-DD) חובה' }, { status: 400 });
  try {
    const { busy, calendarFailed } = await dayBusy(date);
    const overrides = await loadOverrides('adhd', date, 1).catch(() => ({}));
    const window = clinicHours('adhd', date, overrides);
    const hours = hourAvailability(date, busy, window);
    const fmt = new Intl.DateTimeFormat('he-IL', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const windowStart = localToUTC(date, 16 * 60).getTime(), windowEnd = localToUTC(date, 20 * 60).getTime();
    const existing = busy.filter(b => b.start < windowEnd && b.end > windowStart).sort((a, b) => a.start - b.start)
      .map(b => ({ time: `${fmt.format(new Date(b.start))}–${fmt.format(new Date(b.end))}`, label: b.label }));
    return NextResponse.json({ hours, existing, calendarFailed });
  } catch {
    return NextResponse.json({ error: 'לא ניתן לבדוק כרגע זמינות' }, { status: 503 });
  }
}
