import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';
import { scoreParent, scoreTeacher, combineProfile } from '@/lib/scoring';
import { completeResponses, intakeProgress } from '@/lib/intake/progress';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
const schema = z.object({
  token: z.string().min(1), type: z.enum(['vanderbilt_parent', 'vanderbilt_teacher']),
  responses: z.record(z.string(), z.number().int().min(0).max(5)),
  free_text: z.string().optional(), intro_data: z.record(z.string(), z.any()).optional(), complete: z.boolean().optional(),
});
const openStates = ['created', 'parent_form_started', 'parent_form_done', 'teacher_link_sent', 'teacher_form_started', 'teacher_form_done'];
async function save(req: NextRequest, final: boolean) {
  let input;
  try { input = schema.safeParse(await req.json()); } catch { return reply({ error: 'invalid_body' }, 400); }
  if (!input.success) return reply({ error: 'invalid_body' }, 400);
  const { token, type, responses, free_text, intro_data } = input.data;
  if (final && !completeResponses(type, responses)) return reply({ error: 'יש להשלים את כל השאלות לפני שליחה.' }, 400);
  const score = final ? (type === 'vanderbilt_parent' ? scoreParent(responses) : scoreTeacher(responses)) : null;
  if (token === 'demo') return reply({ ok: true, demo: true, ...(score ? { score } : {}) });
  if (!z.string().uuid().safeParse(token).success) return reply({ error: 'invalid_token' }, 403);
  try {
    const db = getSupabaseAdmin(), respondent = type === 'vanderbilt_parent' ? 'parent' : 'teacher';
    const { data: session, error: sessionError } = await db.from('intake_sessions')
      .select('id,status,parent_token_expires_at,teacher_token_expires_at').eq(respondent === 'parent' ? 'parent_token' : 'teacher_token', token).maybeSingle();
    if (sessionError) return reply({ error: 'save_failed' }, 503);
    if (!session) return reply({ error: 'invalid_token' }, 403);
    const expires = session[respondent === 'parent' ? 'parent_token_expires_at' : 'teacher_token_expires_at'];
    if (expires && (!Number.isFinite(Date.parse(expires)) || Date.parse(expires) <= Date.now())) return reply({ error: 'expired_token' }, 403);
    const fields = { responses, free_text: free_text ?? null, intro_data: intro_data ?? null };
    const created = await db.from('questionnaires').upsert({ session_id: session.id, type, respondent, ...fields, is_complete: false, started_at: new Date().toISOString() }, { onConflict: 'session_id,type,respondent', ignoreDuplicates: true });
    if (created.error) return reply({ error: 'save_failed' }, 503);
    const saved = await db.from('questionnaires').update(final ? { ...fields, is_complete: true, submitted_at: new Date().toISOString() } : fields)
      .eq('session_id', session.id).eq('type', type).eq('respondent', respondent).or('is_complete.is.null,is_complete.eq.false').select('id');
    if (saved.error) return reply({ error: 'save_failed' }, 503);
    if (!saved.data?.length) return reply({ ok: true, already_submitted: true });
    if (!final) {
      await db.from('intake_sessions').update({ status: respondent + '_form_started' }).eq('id', session.id).in('status', respondent === 'parent' ? ['created'] : ['teacher_link_sent']);
      return reply({ ok: true });
    }
    const scoreResult = await db.from('scores').insert({ session_id: session.id, questionnaire_id: saved.data[0].id, scope: respondent, raw_scores: score!.raw, flags: score!.byCategory, engine_version: 'vanderbilt-dsm5-v1' });
    const { data: questionnaires, error: readError } = await db.from('questionnaires').select('type,is_complete,submitted_at,responses').eq('session_id', session.id);
    if (readError || !questionnaires) return reply({ error: 'save_failed' }, 503);
    const progress = intakeProgress(questionnaires);
    let combinedSaved = true;
    if (progress.bothComplete) {
      const parent = questionnaires.find(q => q.type === 'vanderbilt_parent')!, teacher = questionnaires.find(q => q.type === 'vanderbilt_teacher')!;
      const profile = combineProfile(parent.responses, teacher.responses);
      const result = await db.from('scores').insert({ session_id: session.id, scope: 'combined', presentation: profile.presentation, confidence: profile.confidence, flags: profile.flags, raw_scores: { parent: profile.parentScore.raw, teacher: profile.teacherScore.raw }, alerts: profile.alerts });
      combinedSaved = !result.error;
      await db.from('intake_sessions').update({ status: 'profile_ready' }).eq('id', session.id).in('status', openStates);
    } else {
      await db.from('intake_sessions').update({ status: respondent + '_form_done' }).eq('id', session.id).in('status', openStates);
    }
    return reply({ ok: true, score, both_complete: progress.bothComplete, scoring_saved: !scoreResult.error && combinedSaved });
  } catch { return reply({ error: 'save_failed' }, 503); }
}
export const PATCH = (req: NextRequest) => save(req, false);
export const POST = (req: NextRequest) => save(req, true);
