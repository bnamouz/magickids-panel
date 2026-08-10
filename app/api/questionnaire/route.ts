import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';
import { scoreParent, scoreTeacher, combineProfile } from '@/lib/scoring';

const upsertSchema = z.object({
  token: z.string().min(1),
  type: z.enum(['vanderbilt_parent', 'vanderbilt_teacher']),
  responses: z.record(z.string(), z.number().int().min(0).max(5)),
  free_text: z.string().optional(),
  complete: z.boolean().optional(),
});

/**
 * PATCH /api/questionnaire – save progress (auto-save)
 */
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }

  const { token, type, responses, free_text } = parsed.data;
  if (token === 'demo') {
    return NextResponse.json({ ok: true, demo: true });
  }

  const supabase = getSupabaseAdmin();
  const tokenColumn = type === 'vanderbilt_parent' ? 'parent_token' : 'teacher_token';
  const { data: session } = await supabase
    .from('intake_sessions')
    .select('id, status')
    .eq(tokenColumn, token)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: 'invalid token' }, { status: 404 });

  // Upsert
  const respondent = type === 'vanderbilt_parent' ? 'parent' : 'teacher';
  const numericResponses: Record<number, number> = {};
  Object.entries(responses).forEach(([k, v]) => {
    numericResponses[Number(k)] = v as number;
  });

  await supabase.from('questionnaires').upsert(
    {
      session_id: session.id,
      type,
      respondent,
      responses: numericResponses,
      free_text: free_text ?? null,
      started_at: new Date().toISOString(),
    },
    { onConflict: 'session_id,type,respondent' },
  );

  // Update status
  const newStatus =
    type === 'vanderbilt_parent' && session.status === 'created'
      ? 'parent_form_started'
      : type === 'vanderbilt_teacher' && !session.status.includes('teacher')
      ? 'teacher_form_started'
      : session.status;

  if (newStatus !== session.status) {
    await supabase.from('intake_sessions').update({ status: newStatus }).eq('id', session.id);
  }

  return NextResponse.json({ ok: true });
}

/**
 * POST /api/questionnaire – final submission (mark complete + score)
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }

  const { token, type, responses, free_text } = parsed.data;

  // Demo mode – return scoring locally
  if (token === 'demo') {
    const numericResponses: Record<number, number> = {};
    Object.entries(responses).forEach(([k, v]) => (numericResponses[Number(k)] = v as number));
    const score = type === 'vanderbilt_parent' ? scoreParent(numericResponses) : scoreTeacher(numericResponses);
    return NextResponse.json({ ok: true, demo: true, score });
  }

  const supabase = getSupabaseAdmin();
  const tokenColumn = type === 'vanderbilt_parent' ? 'parent_token' : 'teacher_token';
  const { data: session } = await supabase
    .from('intake_sessions')
    .select('id, status')
    .eq(tokenColumn, token)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: 'invalid token' }, { status: 404 });

  const respondent = type === 'vanderbilt_parent' ? 'parent' : 'teacher';
  const numericResponses: Record<number, number> = {};
  Object.entries(responses).forEach(([k, v]) => (numericResponses[Number(k)] = v as number));

  const { data: quest } = await supabase
    .from('questionnaires')
    .upsert(
      {
        session_id: session.id,
        type,
        respondent,
        responses: numericResponses,
        free_text: free_text ?? null,
        is_complete: true,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: 'session_id,type,respondent' },
    )
    .select('id')
    .single();

  // Score
  const score = type === 'vanderbilt_parent' ? scoreParent(numericResponses) : scoreTeacher(numericResponses);
  await supabase.from('scores').insert({
    session_id: session.id,
    questionnaire_id: quest!.id,
    scope: respondent,
    raw_scores: score.raw,
    flags: score.byCategory,
    engine_version: 'vanderbilt-dsm5-v1',
  });

  // Update session status
  const newStatus = type === 'vanderbilt_parent' ? 'parent_form_done' : 'teacher_form_done';
  await supabase.from('intake_sessions').update({ status: newStatus }).eq('id', session.id);

  // If both done → compute combined profile
  if (type === 'vanderbilt_teacher') {
    const { data: parentQ } = await supabase
      .from('questionnaires')
      .select('responses')
      .eq('session_id', session.id)
      .eq('type', 'vanderbilt_parent')
      .maybeSingle();

    if (parentQ?.responses) {
      const profile = combineProfile(parentQ.responses as any, numericResponses);
      await supabase.from('scores').insert({
        session_id: session.id,
        scope: 'combined',
        presentation: profile.presentation,
        confidence: profile.confidence,
        flags: profile.flags,
        raw_scores: { parent: profile.parentScore.raw, teacher: profile.teacherScore.raw },
        alerts: profile.alerts,
      });
      await supabase.from('intake_sessions').update({ status: 'profile_ready' }).eq('id', session.id);
    }
  }

  return NextResponse.json({ ok: true, score });
}
