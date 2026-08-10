import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';

const intakeSchema = z.object({
  child_first_name: z.string().min(1).max(80),
  child_last_name: z.string().min(1).max(80),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: z.enum(['male', 'female', 'other']).optional(),
  grade: z.string().optional(),
  school: z.string().optional(),
  teacher_name: z.string().optional(),
  teacher_phone: z.string().optional(),
  parent_name: z.string().min(1),
  parent_phone: z.string().min(7),
  parent_email: z.string().email().optional(),
  relation: z.enum(['mother', 'father', 'guardian', 'other']).default('mother'),
  channel: z.enum(['whatsapp', 'telegram', 'instagram', 'manual']).default('whatsapp'),
  consent: z.literal(true, { errorMap: () => ({ message: 'נדרשת הסכמה' }) }),
});

/**
 * POST /api/intake – create a new intake session
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = intakeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const d = parsed.data;

  const { data, error } = await supabase.rpc('create_intake_session', {
    p_first_name: d.child_first_name,
    p_last_name: d.child_last_name,
    p_birth_date: d.birth_date,
    p_parent_name: d.parent_name,
    p_parent_phone: d.parent_phone,
    p_channel: d.channel,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Get the parent_token back
  const { data: session } = await supabase
    .from('intake_sessions')
    .select('id, parent_token')
    .eq('id', data)
    .single();

  // Update patient with extra info
  if (session) {
    await supabase
      .from('patients')
      .update({
        gender: d.gender,
        grade: d.grade,
        school: d.school,
        teacher_name: d.teacher_name,
        teacher_phone: d.teacher_phone,
      })
      .eq('id', (await supabase.from('intake_sessions').select('patient_id').eq('id', data).single()).data?.patient_id);
  }

  return NextResponse.json({
    session_id: session?.id,
    parent_token: session?.parent_token,
    parent_url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/questionnaire/parent/${session?.parent_token}`,
  });
}
