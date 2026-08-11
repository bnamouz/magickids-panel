import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';

function generateToken(): string {
  return randomBytes(24).toString('hex');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validate required fields
    const {
      first_name,
      last_name,
      birth_date,
      gender,
      grade,
      school,
      teacher_name,
      teacher_phone,
      parent_full_name,
      parent_relation,
      parent_phone,
      parent_email,
      parent_channel,
      consent_given,
      reason_for_referral,
    } = body;

    if (!first_name || !last_name || !birth_date) {
      return NextResponse.json(
        { ok: false, error: 'שם ילד ותאריך לידה נדרשים' },
        { status: 400 },
      );
    }

    if (!parent_full_name || !parent_phone) {
      return NextResponse.json(
        { ok: false, error: 'שם והורה טלפון נדרשים' },
        { status: 400 },
      );
    }

    if (!consent_given) {
      return NextResponse.json(
        { ok: false, error: 'נדרשת הסכמה לתקנון' },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    // 1. Create patient
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .insert({
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        birth_date,
        gender: gender || null,
        grade: grade || null,
        school: school || null,
        teacher_name: teacher_name || null,
        teacher_phone: teacher_phone || null,
      })
      .select('id')
      .single();

    if (patientError) {
      console.error('[create-session] patient error:', patientError);
      return NextResponse.json(
        { ok: false, error: `שגיאה ביצירת רישום ילד: ${patientError.message}` },
        { status: 500 },
      );
    }

    // 2. Create parent
    const { data: parent, error: parentError } = await supabase
      .from('parents')
      .insert({
        patient_id: patient.id,
        full_name: parent_full_name.trim(),
        relation: parent_relation || 'mother',
        phone: parent_phone.trim(),
        email: parent_email?.trim() || null,
        preferred_channel: parent_channel || 'whatsapp',
        is_primary_contact: true,
        consent_given: true,
        consent_at: new Date().toISOString(),
        consent_version: '1.0',
      })
      .select('id')
      .single();

    if (parentError) {
      console.error('[create-session] parent error:', parentError);
      // rollback patient
      await supabase.from('patients').delete().eq('id', patient.id);
      return NextResponse.json(
        { ok: false, error: `שגיאה ביצירת רישום הורה: ${parentError.message}` },
        { status: 500 },
      );
    }

    // 3. Create intake_session
    const parentToken = generateToken();
    const parentExpiry = new Date();
    parentExpiry.setDate(parentExpiry.getDate() + 30);

    const { data: session, error: sessionError } = await supabase
      .from('intake_sessions')
      .insert({
        patient_id: patient.id,
        primary_parent_id: parent.id,
        status: 'created',
        parent_token: parentToken,
        parent_token_expires_at: parentExpiry.toISOString(),
        channel: parent_channel || 'whatsapp',
        reason_for_referral: reason_for_referral || null,
      })
      .select('id, parent_token')
      .single();

    if (sessionError) {
      console.error('[create-session] session error:', sessionError);
      // rollback
      await supabase.from('parents').delete().eq('id', parent.id);
      await supabase.from('patients').delete().eq('id', patient.id);
      return NextResponse.json(
        { ok: false, error: `שגיאה ביצירת תיק: ${sessionError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      session_id: session.id,
      parent_token: session.parent_token,
      parent_url: `/questionnaire/parent/${session.parent_token}`,
    });
  } catch (err: any) {
    console.error('[create-session] exception:', err);
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}
