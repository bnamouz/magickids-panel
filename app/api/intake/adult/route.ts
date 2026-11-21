import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';
import { isValidIsraeliId, normalizeIsraeliId } from '@/lib/israeli-id';
import { asciiDigits } from '@/lib/phone-digits';
import { ADULT_MAX_AGE, ADULT_MIN_AGE, ageOn } from '@/lib/intake/adult';
import { ADULT_EXISTING_MESSAGES, findExistingFile, usableParentToken, type ExistingFile } from '@/lib/intake/existing-file';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
const schema = z.object({
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  national_id: z.string().transform(normalizeIsraeliId).refine(isValidIsraeliId),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: z.enum(['male', 'female', 'other']).optional(),
  phone: z.preprocess(asciiDigits, z.string().min(7).max(25)),
  email: z.string().email().max(254).optional().or(z.literal('')),
  consent: z.literal(true),
});

/**
 * POST /api/intake/adult – an adult opens a file for their own ADHD assessment, or continues the one they have.
 * Public endpoint used by /adults. The person assessed is also the contact person on the file.
 */
export async function POST(req: NextRequest) {
  let parsed;
  try { parsed = schema.safeParse(await req.json()); } catch { return reply({ error: 'invalid_body', code: 'invalid_body' }, 400); }
  if (!parsed.success) {
    const fields = Object.keys(parsed.error.flatten().fieldErrors);
    return reply({ error: fields.includes('national_id') ? 'מספר תעודת הזהות אינו תקין (9 ספרות כולל ספרת ביקורת).' : 'הפרטים שהוזנו אינם תקינים.', code: fields.includes('national_id') ? 'invalid_id' : 'invalid_body', fields }, 400);
  }
  const d = parsed.data, age = ageOn(d.birth_date);
  if (!(age >= ADULT_MIN_AGE)) return reply({ error: 'מסלול זה מיועד לגיל 18 ומעלה. לאבחון ילדים ונוער יש לפתוח תיק במסלול הילדים.', code: 'under_age' }, 400);
  if (age > ADULT_MAX_AGE) return reply({ error: 'יש לוודא שתאריך הלידה נכון.', code: 'invalid_birth_date' }, 400);

  try {
    const db = getSupabaseAdmin();
    const origin = req.headers.get('origin') || `https://${req.headers.get('host')}`;
    const fullName = `${d.first_name} ${d.last_name}`;

    // Unlike the child form, a failed lookup stops here: the lookup also proves the track column is readable.
    let existing: ExistingFile | null;
    try {
      existing = await findExistingFile(db, { nationalId: d.national_id, birthDate: d.birth_date, firstName: d.first_name, parentPhone: d.phone, track: 'adult' });
    } catch (e) {
      console.error('[adult-intake] existing-file lookup failed', e);
      return reply({ error: 'לא ניתן לפתוח כרגע את התיק. נסו שוב בעוד מספר דקות או פנו למכון.', code: 'unavailable' }, 503);
    }
    if (existing) {
      const token = existing.phoneMatch && !existing.ended ? await usableParentToken(db, existing) : null;
      const outcome = token ? 'continued' : !existing.phoneMatch ? (existing.birthMatch ? 'existing_file' : 'details_mismatch') : existing.ended ? 'existing_file_ended' : 'link_unavailable';
      await db.from('audit_log').insert({
        actor_type: 'parent', action: 'intake_repeat_attempt', entity_type: 'intake_session', entity_id: existing.sessionId,
        metadata: { outcome, track: 'adult', matched_by: existing.via, name: fullName, phone: d.phone },
      }).then(() => null, () => null);
      if (token) return reply({ ok: true, existing: true, token, url: `${origin}/questionnaire/adult/${token}` });
      const code = outcome as keyof typeof ADULT_EXISTING_MESSAGES;
      return reply({ error: ADULT_EXISTING_MESSAGES[code], code }, code === 'link_unavailable' ? 503 : 409);
    }

    const { data: sessionId, error: rpcError } = await db.rpc('create_intake_session', {
      p_first_name: d.first_name, p_last_name: d.last_name, p_birth_date: d.birth_date,
      p_parent_name: fullName, p_parent_phone: d.phone, p_channel: 'manual',
    });
    if (rpcError || !sessionId) {
      const msg = rpcError?.message ?? '';
      const code = msg.includes('age_in_range') || msg.includes('birth_date_reasonable') ? 'invalid_birth_date' : msg.includes('phone') ? 'invalid_phone' : 'unavailable';
      return reply({ error: code === 'invalid_phone' ? 'מספר הטלפון לא תקין.' : code === 'invalid_birth_date' ? 'תאריך הלידה לא תקין.' : 'לא ניתן לפתוח כרגע את התיק.', code }, code === 'unavailable' ? 503 : 400);
    }

    // The file is an adult file from its first moment; if that cannot be recorded it is withdrawn, never left as a child file.
    const marked = await db.from('intake_sessions').update({ track: 'adult' }).eq('id', sessionId).select('id,patient_id,primary_parent_id,parent_token').maybeSingle();
    if (marked.error || !marked.data?.parent_token) {
      console.error('[adult-intake] could not mark the adult track', marked.error);
      await db.from('intake_sessions').update({ status: 'cancelled', notes: 'פתיחת תיק מבוגרים נכשלה (סימון המסלול). התיק בוטל אוטומטית.' }).eq('id', sessionId).then(() => null, () => null);
      return reply({ error: 'לא ניתן לפתוח כרגע את התיק. נסו שוב בעוד מספר דקות או פנו למכון.', code: 'unavailable' }, 503);
    }
    const session = marked.data;

    await db.from('patients').update({ national_id: d.national_id, gender: d.gender || null }).eq('id', session.patient_id);
    if (session.primary_parent_id) {
      await db.from('parents').update({
        relation: 'other', email: d.email || null, consent_given: true, consent_at: new Date().toISOString(), consent_version: '1.0',
        consent_ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      }).eq('id', session.primary_parent_id);
    }

    // A person assessed here as a child keeps that file; staff are told the two belong to the same person.
    const prior = await db.from('patients').select('id').eq('national_id', d.national_id).neq('id', session.patient_id).is('archived_at', null);
    await db.from('audit_log').insert({
      actor_type: 'parent', action: 'adult_intake_opened', entity_type: 'intake_session', entity_id: session.id,
      metadata: { track: 'adult', earlier_patient_ids: (prior.data ?? []).map((row: any) => row.id) },
    }).then(() => null, () => null);

    await db.from('notifications').insert({
      session_id: session.id, recipient_type: 'staff', channel: 'email', template: 'new_registration',
      scheduled_for: new Date().toISOString(), status: 'queued',
      payload: {
        title: 'רישום חדש: אבחון מבוגרים', track: 'adult', child_name: fullName, parent_name: fullName,
        parent_phone: d.phone, parent_email: d.email || null, session_url: `${origin}/admin/sessions/${session.id}`,
      },
    }).then(() => null, () => null);

    return reply({ ok: true, session_id: session.id, token: session.parent_token, url: `${origin}/questionnaire/adult/${session.parent_token}` });
  } catch (e) {
    console.error('[adult-intake] failed', e);
    return reply({ error: 'לא ניתן לפתוח כרגע את התיק. נסו שוב בעוד מספר דקות או פנו למכון.', code: 'unavailable' }, 503);
  }
}
