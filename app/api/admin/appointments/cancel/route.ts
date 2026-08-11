import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { cancelCalendarEvent } from '@/lib/google-calendar';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { appointment_id, reason } = body;

    if (!appointment_id) {
      return NextResponse.json({ error: 'appointment_id חובה' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: appt, error: fErr } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', appointment_id)
      .maybeSingle();

    if (fErr || !appt) {
      return NextResponse.json({ error: 'פגישה לא נמצאה' }, { status: 404 });
    }

    // Try to cancel in Google Calendar
    if (appt.gcal_event_id) {
      try {
        await cancelCalendarEvent(appt.gcal_event_id);
      } catch (e) {
        // Not fatal - continue with DB cancel
      }
    }

    const { error: uErr } = await supabase
      .from('appointments')
      .update({
        status: 'cancelled',
        cancelled_reason: reason || null,
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', appointment_id);

    if (uErr) {
      return NextResponse.json({ error: uErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
