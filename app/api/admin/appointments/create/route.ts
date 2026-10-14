import { isAssessmentSlot, isFollowupSlot } from '@/lib/booking/schedule';
import { getCurrentStaff } from '@/lib/admin/auth';
import { firstRelated, intakeProgress } from '@/lib/intake/progress';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getCalendarId } from '@/lib/google-calendar';
import {syncAppointment} from '@/lib/calendar-consistency';
import {randomUUID} from 'node:crypto';
import {confirmationSchema,sendAppointmentConfirmation} from '@/lib/appointments/confirmation';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DURATION_BY_TYPE: Record<string, number> = {
  assessment: 60,
  // Follow-ups are quarter-hour slots so up to four can share one Wednesday hour.
  followup: 15,
  moxo: 30,
};

export async function POST(req: NextRequest) {
  try {
    if (!await getCurrentStaff()) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'forbidden'},{status:403});
    const body = await req.json();
    const notice = body.confirmation == null ? null : confirmationSchema.safeParse(body.confirmation);
    if (notice && !notice.success) return NextResponse.json({error:'יש לאמת פרטי נמען והסכמה לשליחת אישור'}, {status:400});
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

    if (!Number.isFinite(Date.parse(scheduled_at)) || Date.parse(scheduled_at) <= Date.now()) return NextResponse.json({ error: 'יש לבחור מועד עתידי תקין' }, { status: 400 });
    const duration = duration_minutes || DURATION_BY_TYPE[appointment_type] || 60;
    if (!Number.isInteger(duration) || duration < 15 || duration > 180) return NextResponse.json({ error: 'משך פגישה לא תקין' }, { status: 400 });
    if (appointment_type === 'assessment' && (duration !== 60 || !isAssessmentSlot(scheduled_at))) return NextResponse.json({ error: 'אבחון מתקיים ביום רביעי בלבד בשעות 16:00, 17:00, 18:00 או 19:00, למשך שעה.' }, { status: 400 });
    if (appointment_type === 'followup' && (duration !== 15 || !isFollowupSlot(scheduled_at))) return NextResponse.json({ error: 'מעקב מתקיים ביום רביעי בין 16:00–20:00, ברבעי שעה (00/15/30/45), למשך רבע שעה.' }, { status: 400 });
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

    if (appointment_type === 'assessment') {
      const [forms, appointments] = await Promise.all([
        supabase.from('questionnaires').select('type,is_complete,submitted_at,responses').eq('session_id', session_id),
        supabase.from('appointments').select('id,status,appointment_type,scheduled_at').eq('session_id', session_id),
      ]);
      if (forms.error || appointments.error) return NextResponse.json({ error: 'לא ניתן לאמת כרגע את מצב הקליטה' }, { status: 503 });
      const progress = intakeProgress(forms.data ?? [], appointments.data ?? [], session.status);
      if (!progress.bothComplete) return NextResponse.json({ error: 'יש להשלים ולשלוח את שאלוני ההורים והמורה לפני זימון לאבחון' }, { status: 409 });
      if (progress.hasAppointment) return NextResponse.json({ error: 'כבר נקבעה פגישה לתיק הזה. יש לעדכן את הפגישה הקיימת.' }, { status: 409 });
    }
    const patient = firstRelated<any>(session.patients);
    const parent = firstRelated<any>(session.parents);
    const childName = `${patient?.first_name ?? ''} ${patient?.last_name ?? ''}`.trim() || 'ילד';

    // Reserve in PostgreSQL before any external write. All booking tables share the guard.
    if(skip_calendar)return NextResponse.json({error:'יש לסנכרן כל פגישה ליומן'}, {status:400});
    const appointmentId=randomUUID();
    const calendarId=getCalendarId();
    // Insert appointment row
    const { data: appt, error: aErr } = await supabase
      .from('appointments')
      .insert({
        id: appointmentId,
        session_id,
        patient_id: session.patient_id,
        appointment_type,
        scheduled_at,
        duration_minutes: duration,
        status: 'scheduled',
        gcal_event_id: 'appt'+appointmentId.replaceAll('-',''),
        gcal_calendar_id: calendarId,
        location: location || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (aErr) {
      return NextResponse.json(
        { error: `שגיאה בשמירת הפגישה: ${aErr.message}` },
        { status: aErr.code==='23P01'?409:500 }
      );
    }

    const calendarStatus=await syncAppointment(appointmentId);
    // Update session status to 'booked' if it was in an earlier state
    if (['profile_ready', 'created', 'parent_form_done', 'teacher_form_done'].includes(session.status as string)) {
      await supabase
        .from('intake_sessions')
        .update({ status: 'booked' })
        .eq('id', session_id);
    }

    const confirmation = notice?.success
      ? await sendAppointmentConfirmation(appointmentId, notice.data)
      : null;
    return NextResponse.json({
      ok: true,
      appointment: appt,
      calendar_sync: calendarStatus,
      confirmation,
      warning: calendarStatus==='synced'?null:'تم حفظ الموعد / הפגישה נשמרה אך סנכרון היומן טרם אושר. יש לבדוק את מצב הסנכרון בדאשבורד.',
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
