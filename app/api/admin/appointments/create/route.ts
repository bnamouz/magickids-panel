import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { createCalendarEvent, checkAvailability } from '@/lib/google-calendar';

export const dynamic = 'force-dynamic';

const DURATION_BY_TYPE: Record<string, number> = {
  assessment: 60,
  followup: 30,
  moxo: 30,
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      session_id,
      appointment_type,
      scheduled_at,
      duration_minutes,
      location,
      notes,
      skip_calendar,
    } = body;

    if (!session_id || !appointment_type || !scheduled_at) {
      return NextResponse.json(
        { error: 'session_id, appointment_type, scheduled_at חובה' },
        { status: 400 }
      );
    }

    if (!['assessment', 'followup', 'moxo'].includes(appointment_type)) {
      return NextResponse.json({ error: 'סוג פגישה לא חוקי' }, { status: 400 });
    }

    const duration = duration_minutes || DURATION_BY_TYPE[appointment_type] || 60;
    const supabase = getSupabaseAdmin();

    // Load session with patient & parent
    const { data: session, error: sErr } = await supabase
      .from('intake_sessions')
      .select(
        `id, patient_id, status,
         patients(first_name, last_name),
         parents(full_name, phone, email)`
      )
      .eq('id', session_id)
      .maybeSingle();

    if (sErr || !session) {
      return NextResponse.json({ error: 'תיק לא נמצא' }, { status: 404 });
    }

    const patient = (session as any).patients;
    const parent = (session as any).parents?.[0];
    const childName = `${patient?.first_name ?? ''} ${patient?.last_name ?? ''}`.trim() || 'ילד';

    // Optional: check availability in Google Calendar
    let calendarInfo: { eventId?: string; htmlLink?: string; calendarId?: string } = {};
    let calendarWarning: string | null = null;

    if (!skip_calendar && process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_CALENDAR_ID) {
      try {
        const avail = await checkAvailability(scheduled_at, duration);
        if (!avail.available) {
          return NextResponse.json(
            {
              error: 'השעה תפוסה ביומן',
              conflicts: avail.conflicts.map((c) => ({
                summary: c.summary,
                start: c.start?.dateTime,
              })),
            },
            { status: 409 }
          );
        }

        const created = await createCalendarEvent({
          appointmentType: appointment_type,
          childName,
          parentName: parent?.full_name || 'הורה',
          parentPhone: parent?.phone || '',
          parentEmail: parent?.email || undefined,
          scheduledAt: scheduled_at,
          durationMinutes: duration,
          location: location || undefined,
          notes: notes || undefined,
        });
        calendarInfo = {
          eventId: created.eventId,
          htmlLink: created.htmlLink,
          calendarId: created.calendarId,
        };
      } catch (e: any) {
        calendarWarning = `לא הצלחתי ליצור אירוע ב-Google Calendar: ${e.message}. הפגישה נשמרה במערכת אבל לא ביומן.`;
      }
    } else if (!skip_calendar) {
      calendarWarning = 'Google Calendar לא מוגדר. הפגישה נשמרה במערכת בלבד.';
    }

    // Insert appointment row
    const { data: appt, error: aErr } = await supabase
      .from('appointments')
      .insert({
        session_id,
        patient_id: session.patient_id,
        appointment_type,
        scheduled_at,
        duration_minutes: duration,
        status: 'scheduled',
        gcal_event_id: calendarInfo.eventId || null,
        gcal_calendar_id: calendarInfo.calendarId || null,
        location: location || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (aErr) {
      // Try to rollback Google event
      if (calendarInfo.eventId) {
        try {
          const { cancelCalendarEvent } = await import('@/lib/google-calendar');
          await cancelCalendarEvent(calendarInfo.eventId);
        } catch {}
      }
      return NextResponse.json(
        { error: `שגיאה בשמירת הפגישה: ${aErr.message}` },
        { status: 500 }
      );
    }

    // Update session status to 'booked' if it was in an earlier state
    if (['profile_ready', 'created', 'parent_form_done', 'teacher_form_done'].includes(session.status as string)) {
      await supabase
        .from('intake_sessions')
        .update({ status: 'booked' })
        .eq('id', session_id);
    }

    return NextResponse.json({
      ok: true,
      appointment: appt,
      calendar_link: calendarInfo.htmlLink,
      warning: calendarWarning,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
