import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { assertVoiceAuth, normalisePhone } from '@/lib/voice-auth';

/**
 * GET /api/voice/intake-status?phone=+972544020043
 *
 * Called by the ElevenLabs agent (tool: check_intake_status) before offering
 * a Maccabi appointment. Returns whether the parent + teacher questionnaires
 * have been completed for this family, so the agent can enforce the gate:
 *   - intake_completed=true  -> offer a Wednesday 16-20 slot
 *   - intake_completed=false -> send the intake link instead
 */
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const unauth = assertVoiceAuth(req);
  if (unauth) return unauth;

  const url = new URL(req.url);
  const rawPhone = url.searchParams.get('phone');
  const caseId = url.searchParams.get('case_id');

  const phone = normalisePhone(rawPhone);
  if (!phone && !caseId) {
    return NextResponse.json(
      { found: false, error: 'phone or case_id required' },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();

  // Locate the most recent intake session for this caller.
  // Strategy: match on parent phone (patients.parent_phone) or case_id directly.
  let query = supabase
    .from('intake_sessions')
    .select(
      'id, patient_id, status, parent_completed_at, teacher_completed_at, ' +
        'patients(full_name, birth_date, parent_full_name, parent_phone)',
    )
    .order('created_at', { ascending: false })
    .limit(1);

  if (caseId) {
    query = query.eq('id', caseId);
  } else if (phone) {
    // The phone lives in patients.parent_phone; use a filter via the FK join.
    // Supabase JS supports .eq on nested columns via dot notation on the base
    // table only, so we do a two-step lookup: patients first, then session.
    const { data: patient } = await supabase
      .from('patients')
      .select('id')
      .eq('parent_phone', phone)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!patient) {
      return NextResponse.json({
        found: false,
        intake_completed: false,
        parent_questionnaire_status: 'not_started',
        teacher_questionnaire_status: 'not_started',
      });
    }
    query = query.eq('patient_id', patient.id);
  }

  const { data: sessionRaw, error } = await query.maybeSingle();
  if (error) {
    return NextResponse.json(
      { found: false, error: error.message },
      { status: 500 },
    );
  }
  const session = sessionRaw as any;
  if (!session) {
    return NextResponse.json({
      found: false,
      intake_completed: false,
      parent_questionnaire_status: 'not_started',
      teacher_questionnaire_status: 'not_started',
    });
  }

  const parentDone = !!session.parent_completed_at;
  const teacherDone = !!session.teacher_completed_at;
  const parentStatus = parentDone ? 'completed' : 'not_started';
  const teacherStatus = teacherDone ? 'completed' : 'not_started';

  const patient: any = Array.isArray(session.patients)
    ? session.patients[0]
    : session.patients;

  return NextResponse.json({
    found: true,
    case_id: session.id,
    child_name: patient?.full_name || null,
    parent_name: patient?.parent_full_name || null,
    parent_questionnaire_status: parentStatus,
    teacher_questionnaire_status: teacherStatus,
    intake_completed: parentDone && teacherDone,
    session_status: session.status,
  });
}
