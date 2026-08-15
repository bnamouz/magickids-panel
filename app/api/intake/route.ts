import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const intakeSchema = z.object({
  child_first_name: z.string().min(1).max(80),
  child_last_name: z.string().min(1).max(80),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: z.enum(['male', 'female', 'other']).optional(),
  grade: z.string().optional(),
  school: z.string().optional(),
  parent_name: z.string().min(1),
  parent_phone: z.string().min(7),
  parent_email: z.string().email().optional().or(z.literal('')),
  relation: z.enum(['mother', 'father', 'guardian', 'other']).default('mother'),
  reason_for_referral: z.string().optional(),
  medical_notes: z.string().optional(),
  medications: z.string().optional(),
  consent: z.literal(true, { errorMap: () => ({ message: 'נדרשת הסכמה' }) }),
});

/**
 * POST /api/intake – create a new intake session
 * Public endpoint used by /register form.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = intakeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const d = parsed.data;

    // Business-rule age check (6–80) before hitting DB
    const birth = new Date(d.birth_date);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    if (age < 6 || age > 80) {
      return NextResponse.json(
        { error: 'גיל המטופל/ת חייב להיות בין 6 ל-80 שנה. בדוק את תאריך הלידה.' },
        { status: 400 }
      );
    }

    // Create session via RPC
    const { data: sessionId, error: rpcError } = await supabase.rpc('create_intake_session', {
      p_first_name: d.child_first_name,
      p_last_name: d.child_last_name,
      p_birth_date: d.birth_date,
      p_parent_name: d.parent_name,
      p_parent_phone: d.parent_phone,
      p_channel: 'manual', // self-registered via public form
    });

    if (rpcError) {
      // Translate common DB errors to Hebrew
      let msg = rpcError.message;
      if (msg.includes('age_in_range')) {
        msg = 'גיל המטופל/ת חייב להיות בין 6 ל-80 שנה.';
      } else if (msg.includes('birth_date_reasonable')) {
        msg = 'תאריך הלידה לא תקין.';
      } else if (msg.includes('phone') || msg.includes('valid_phone')) {
        msg = 'מספר הטלפון לא תקין.';
      } else if (msg.includes('duplicate') || msg.includes('unique')) {
        msg = 'ניראה שכבר קיים רישום עם אותם פרטים. צור/י קשר למכון לעדכון.';
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Fetch created session
    const { data: session, error: sessErr } = await supabase
      .from('intake_sessions')
      .select('id, patient_id, primary_parent_id, parent_token')
      .eq('id', sessionId)
      .single();

    if (sessErr || !session) {
      return NextResponse.json({ error: 'לא ניתן למצוא את התיק שנוצר' }, { status: 500 });
    }

    // Merge medical notes + medications into patient
    const combinedMedicalNotes = [
      d.medical_notes?.trim(),
      d.medications?.trim() ? `טיפול תרופתי: ${d.medications.trim()}` : null,
    ]
      .filter(Boolean)
      .join('\n\n') || null;

    // Update patient with all demographic + medical info
    await supabase
      .from('patients')
      .update({
        gender: d.gender || null,
        grade: d.grade || null,
        school: d.school || null,
        medical_notes: combinedMedicalNotes,
      })
      .eq('id', session.patient_id);

    // Update session with referral reason
    if (d.reason_for_referral) {
      await supabase
        .from('intake_sessions')
        .update({ reason_for_referral: d.reason_for_referral })
        .eq('id', session.id);
    }

    // Update parent with relation, email, consent
    if (session.primary_parent_id) {
      const consent_ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
      await supabase
        .from('parents')
        .update({
          relation: d.relation,
          email: d.parent_email || null,
          consent_given: true,
          consent_at: new Date().toISOString(),
          consent_version: '1.0',
          consent_ip,
        })
        .eq('id', session.primary_parent_id);
    }

    // Compute public URL to parent questionnaire
    const origin = req.headers.get('origin') || `https://${req.headers.get('host')}`;
    const parent_url = `${origin}/questionnaire/parent/${session.parent_token}`;

    // Log a staff notification (visible in dashboard)
    try {
      await supabase.from('notifications').insert({
        session_id: session.id,
        recipient_type: 'staff',
        channel: 'email',
        template: 'new_registration',
        scheduled_for: new Date().toISOString(),
        status: 'queued',
        payload: {
          title: 'רישום חדש מהורה',
          child_name: `${d.child_first_name} ${d.child_last_name}`,
          parent_name: d.parent_name,
          parent_phone: d.parent_phone,
          parent_email: d.parent_email || null,
          reason: d.reason_for_referral || null,
          session_url: `${origin}/admin/sessions/${session.id}`,
        },
      });
    } catch (e) {
      // non-fatal
    }

    return NextResponse.json({
      ok: true,
      session_id: session.id,
      parent_token: session.parent_token,
      parent_url,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
