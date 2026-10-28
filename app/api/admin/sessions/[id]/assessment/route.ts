import { NextRequest, NextResponse } from 'next/server';
import { canEditReports, getCurrentStaff } from '@/lib/admin/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { normalizeAssessment, symptomEvidence } from '@/lib/adhd/dsm5';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Latest complete questionnaire of a type → item responses (used to pre-fill criterion A). */
async function latestResponses(sessionId: string, type: 'vanderbilt_parent' | 'vanderbilt_teacher') {
  const { data } = await getSupabaseAdmin().from('questionnaires').select('responses').eq('session_id', sessionId).eq('type', type).eq('is_complete', true)
    .order('submitted_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
  return (data?.responses ?? null) as Record<string, number> | null;
}

/** GET – clinician assessment + questionnaire evidence per DSM-5 symptom. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getCurrentStaff(); if (!staff) return reply({ error: 'forbidden' }, 403);
  const { id } = await params; if (!UUID.test(id)) return reply({ error: 'invalid_id' }, 400);
  const db = getSupabaseAdmin();
  const [{ data: row }, parent, teacher, { data: session }] = await Promise.all([
    db.from('adhd_clinical_assessments').select('data, updated_at, updated_by').eq('session_id', id).maybeSingle(),
    latestResponses(id, 'vanderbilt_parent'), latestResponses(id, 'vanderbilt_teacher'),
    db.from('intake_sessions').select('patients(birth_date)').eq('id', id).maybeSingle(),
  ]);
  const rawPatient: unknown = session?.patients ?? null;
  const patient = (Array.isArray(rawPatient) ? rawPatient[0] : rawPatient) as { birth_date: string | null } | null;
  return reply({ assessment: normalizeAssessment(row?.data), updatedAt: row?.updated_at ?? null, evidence: symptomEvidence({ parent, teacher }), hasParent: !!parent, hasTeacher: !!teacher, birthDate: patient?.birth_date ?? null, canEdit: canEditReports(staff) });
}

/** PUT – save the whole assessment (upsert, one row per session). Admin / diagnostician only, same-origin. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getCurrentStaff(); if (!staff) return reply({ error: 'forbidden' }, 403);
  if (!canEditReports(staff)) return reply({ error: 'forbidden' }, 403);
  if (req.headers.get('origin') !== req.nextUrl.origin) return reply({ error: 'forbidden' }, 403);
  const { id } = await params; if (!UUID.test(id)) return reply({ error: 'invalid_id' }, 400);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return reply({ error: 'invalid_body' }, 400);
  const db = getSupabaseAdmin();
  const { data: session } = await db.from('intake_sessions').select('id').eq('id', id).maybeSingle();
  if (!session) return reply({ error: 'not_found' }, 404);
  const data = { ...normalizeAssessment((body as { assessment?: unknown }).assessment), updatedAt: new Date().toISOString() };
  const { error } = await db.from('adhd_clinical_assessments').upsert({ session_id: id, data, updated_by: staff.id, updated_at: data.updatedAt }, { onConflict: 'session_id' });
  if (error) return reply({ error: 'save_failed' }, 500);
  await db.from('audit_log').insert({ actor_id: staff.id, actor_type: 'user', action: 'clinical_assessment_saved', entity_type: 'intake_session', entity_id: id, metadata: { conclusion: data.conclusion || null, symptoms_marked: Object.keys(data.symptoms).length } }).then(() => null, () => null);
  return reply({ ok: true, updatedAt: data.updatedAt });
}
