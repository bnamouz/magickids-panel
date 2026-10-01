import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { FOLLOWUP_QUARTERS, isFollowupSlot, localToUTC } from '@/lib/booking/schedule';

export const dynamic = 'force-dynamic';

// Returns which of the four quarter-hour slots (00/15/30/45) inside a given
// Wednesday ADHD hour are already taken by a follow-up appointment, so staff
// can pick a free quarter instead of guessing and hitting a 409 on create.
export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date'); // YYYY-MM-DD, must be a Wednesday
    const hour = Number(req.nextUrl.searchParams.get('hour')); // 16|17|18|19
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(hour) || hour < 16 || hour > 19) {
      return NextResponse.json({ error: 'date (YYYY-MM-DD) ו-hour (16-19) חובה' }, { status: 400 });
    }
    const hourStartMinutes = hour * 60;
    const hourStart = localToUTC(date, hourStartMinutes);
    const hourEnd = localToUTC(date, hourStartMinutes + 60);
    if (!isFollowupSlot(hourStart.toISOString(), new Date(0))) {
      // isFollowupSlot already enforces Wednesday + 16:00-20:00 window; reuse
      // it here (with an epoch "now") purely for the day/hour-shape check.
      return NextResponse.json({ error: 'יש לבחור יום רביעי בין 16:00 ל-20:00' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('appointments')
      .select('scheduled_at,status,patients(first_name,last_name)')
      .eq('appointment_type', 'followup')
      .neq('status', 'cancelled')
      .gte('scheduled_at', hourStart.toISOString())
      .lt('scheduled_at', hourEnd.toISOString());

    if (error) return NextResponse.json({ error: 'לא ניתן לבדוק כרגע זמינות' }, { status: 503 });

    const takenByMinute = new Map<number, string>();
    for (const row of data ?? []) {
      const minute = Math.round((Date.parse(row.scheduled_at) - hourStart.getTime()) / 60000);
      const patient = Array.isArray(row.patients) ? row.patients[0] : row.patients;
      takenByMinute.set(minute, `${patient?.first_name ?? ''} ${patient?.last_name ?? ''}`.trim() || 'מטופל/ת');
    }

    const quarters = FOLLOWUP_QUARTERS.map((minute) => ({
      minute,
      time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      available: !takenByMinute.has(minute),
      takenBy: takenByMinute.get(minute) ?? null,
    }));

    return NextResponse.json({ quarters });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
