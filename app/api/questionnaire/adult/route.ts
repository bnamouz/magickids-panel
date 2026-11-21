import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';
import { ADULT_ENGINE_VERSION, adultResponsesComplete, scoreAdult } from '@/lib/adult-scoring';
import { ASRS_ADULT_INTRO_FIELDS, ASRS_ADULT_QUESTIONS } from '@/questions/asrs_adult';
import { intakeLinkTokenSchema } from '@/lib/intake/tokens';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
const TYPE = 'asrs_adult', RESPONDENT = 'self';
const schema = z.object({
  token: z.string().min(1),
  responses: z.record(z.string().regex(/^\d{1,2}$/), z.number().int().min(0).max(4)),
  free_text: z.string().max(4000).optional(),
  intro_data: z.record(z.string().max(40), z.string().max(2000)).optional(),
  language: z.enum(['he', 'ar', 'en']).optional(),
});
const maxById = new Map(ASRS_ADULT_QUESTIONS.map(q => [String(q.id), q.max]));

/**
 * Adult self-report. PATCH saves a draft, POST submits and scores.
 * The link is the personal link of an adult-track file; a child file's link is refused.
 */
async function save(req: NextRequest, final: boolean) {
  let input;
  try { input = schema.safeParse(await req.json()); } catch { return reply({ error: 'invalid_body' }, 400); }
  if (!input.success) return reply({ error: 'invalid_body' }, 400);
  const { token, free_text, language } = input.data;
  // Only known items, each within its own scale.
  const responses = Object.fromEntries(Object.entries(input.data.responses).filter(([id, value]) => maxById.has(id) && value <= maxById.get(id)!));
  const known = new Set(ASRS_ADULT_INTRO_FIELDS.map(field => field.id));
  const intro = Object.fromEntries(Object.entries(input.data.intro_data ?? {}).filter(([id]) => known.has(id)).map(([id, value]) => [id, value.trim()]));
  if (final) {
    if (!adultResponsesComplete(responses)) return reply({ error: 'incomplete', code: 'incomplete' }, 400);
    if (ASRS_ADULT_INTRO_FIELDS.some(field => field.required && !intro[field.id])) return reply({ error: 'incomplete', code: 'incomplete_background' }, 400);
  }
  if (token === 'demo') return reply({ ok: true, demo: true });
  if (!intakeLinkTokenSchema.safeParse(token).success) return reply({ error: 'invalid_token' }, 403);
  try {
    const db = getSupabaseAdmin();
    const { data: session, error: sessionError } = await db.from('intake_sessions').select('id,status,track,parent_token_expires_at').eq('parent_token', token).maybeSingle();
    if (sessionError) return reply({ error: 'save_failed' }, 503);
    if (!session || session.track !== 'adult') return reply({ error: 'invalid_token' }, 403);
    const expires = session.parent_token_expires_at;
    if (expires && (!Number.isFinite(Date.parse(expires)) || Date.parse(expires) <= Date.now())) return reply({ error: 'expired_token' }, 403);
    if (['cancelled', 'closed'].includes(session.status)) return reply({ error: 'closed' }, 409);

    const fields = { responses, free_text: free_text?.trim() || null, intro_data: { ...intro, ...(language ? { language } : {}) } };
    const created = await db.from('questionnaires').upsert({ session_id: session.id, type: TYPE, respondent: RESPONDENT, ...fields, is_complete: false, started_at: new Date().toISOString() }, { onConflict: 'session_id,type,respondent', ignoreDuplicates: true });
    if (created.error) return reply({ error: 'save_failed' }, 503);
    const saved = await db.from('questionnaires').update(final ? { ...fields, is_complete: true, submitted_at: new Date().toISOString() } : fields)
      .eq('session_id', session.id).eq('type', TYPE).eq('respondent', RESPONDENT).or('is_complete.is.null,is_complete.eq.false').select('id');
    if (saved.error) return reply({ error: 'save_failed' }, 503);
    if (!saved.data?.length) return reply({ ok: true, already_submitted: true });
    if (!final) {
      await db.from('intake_sessions').update({ status: 'parent_form_started' }).eq('id', session.id).eq('status', 'created');
      return reply({ ok: true });
    }
    // The score is for staff only; the person assessed is never shown a result.
    const score = scoreAdult(responses);
    const scored = await db.from('scores').insert({
      session_id: session.id, questionnaire_id: saved.data[0].id, scope: 'self', presentation: score.presentation,
      raw_scores: score.raw, flags: score.flags, engine_version: ADULT_ENGINE_VERSION,
    });
    if (scored.error) console.error('[adult-questionnaire] score not saved', scored.error.message);
    // Readiness is read from the submitted questionnaire; the status is kept in step for lists that filter on it.
    const moved = await db.from('intake_sessions').update({ status: 'profile_ready' }).eq('id', session.id).in('status', ['created', 'parent_form_started', 'parent_form_done', 'stuck']);
    if (moved.error) console.error('[adult-questionnaire] status not updated', moved.error.message);
    return reply({ ok: true, scoring_saved: !scored.error });
  } catch { return reply({ error: 'save_failed' }, 503); }
}
export const PATCH = (req: NextRequest) => save(req, false);
export const POST = (req: NextRequest) => save(req, true);
