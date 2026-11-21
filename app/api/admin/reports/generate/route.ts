import { sessionTrack } from '@/lib/intake/adult';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { scoreVanderbilt } from '@/lib/vanderbilt-scoring';
import { generateReportContent, REPORT_MODEL, REPORT_PROMPT_VERSION } from '@/lib/report-generator';
import { generatePdfReport, type PdfInput, type PdfSymptomRow } from '@/lib/pdf-report';
import { getCurrentStaff } from '@/lib/admin/auth';
import { DSM5_HYPERACTIVITY, DSM5_INATTENTION, effectivePresence, normalizeAssessment, symptomEvidence } from '@/lib/adhd/dsm5';
import { ADULT_REPORT_PROMPT_VERSION, adultPdfData, adultSymptomRows, generateAdultReportContent } from '@/lib/adult-report';
import { ADULT_ENGINE_VERSION, adultResponsesComplete } from '@/lib/adult-scoring';
import { ADULT_QUESTIONNAIRE } from '@/lib/intake/progress';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const CLINICIAN_NAME = 'ד"ר בסים נמוז';
const CLINICIAN_TITLE = 'מומחה ברפואת ילדים, הפרעות קשב וריכוז';

type Db = ReturnType<typeof getSupabaseAdmin>;
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Stores the PDF, records the report as a draft and marks the file as reported. Shared by both tracks. */
async function saveReport(supabase: Db, session_id: string, pdfBuffer: Buffer, row: { draft_content: Record<string, unknown>; ai_prompt_version: string; ai_tokens_in: number | null; ai_tokens_out: number | null }) {
  // Storage keys must be ASCII-safe (Hebrew/RTL characters are rejected as 'Invalid key').
  // We keep session_id as the folder for organization and use ASCII-only filenames.
  const filePath = `${session_id}/${Date.now()}_report.pdf`;
  const { error: uploadErr } = await supabase.storage.from('reports').upload(filePath, pdfBuffer, { contentType: 'application/pdf', upsert: false });
  if (uploadErr) return fail(`שגיאה בהעלאת ה-PDF: ${uploadErr.message}`, 500);

  // Signed URL (1 hour)
  const { data: signedData } = await supabase.storage.from('reports').createSignedUrl(filePath, 3600);
  const { data: reportRow, error: rErr } = await supabase
    .from('reports')
    .insert({
      session_id, ...row,
      ai_model: REPORT_MODEL,
      status: 'draft',
      pdf_storage_path: filePath,
      download_url: signedData?.signedUrl || null,
      download_expires_at: signedData?.signedUrl ? new Date(Date.now() + 3600 * 1000).toISOString() : null,
      generated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (rErr) {
    await supabase.storage.from('reports').remove([filePath]);
    return fail(`שגיאה בשמירת הדוח: ${rErr.message}`, 500);
  }
  await supabase.from('intake_sessions').update({ status: 'reported' }).eq('id', session_id);
  return NextResponse.json({ ok: true, report: reportRow, download_url: signedData?.signedUrl || null, file_size: pdfBuffer.length });
}

/** Clinical notes of the file, oldest first; `null` when they could not be read (no report is produced without them). */
async function loadNotes(supabase: Db, session_id: string) {
  const { data, error: clinicalNotesError } = await supabase.from('clinical_notes').select('category, content, created_at').is('voided_at', null).eq('session_id', session_id).order('created_at', { ascending: true });
  if (clinicalNotesError) return null;
  return (data || []).map((n: any) => ({ category: n.category as string, content: n.content as string }));
}

/**
 * Adult track: the report is built from the person's own self-report and the physician's DSM-5 assessment.
 * Without a physician's conclusion it is a preliminary summary, exactly as in the child track.
 */
async function generateAdult(supabase: Db, session: any, patient: any, contact: any) {
  const session_id: string = session.id;
  const { data: selfQ } = await supabase
    .from('questionnaires')
    .select('id, responses, submitted_at, is_complete, free_text, intro_data')
    .eq('session_id', session_id)
    .eq('type', ADULT_QUESTIONNAIRE)
    .eq('is_complete', true)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const responses = (selfQ?.responses ?? null) as Record<string, number> | null;
  if (!selfQ || !responses || !adultResponsesComplete(responses)) return fail('לא נמצא שאלון הערכה עצמית מלא לתיק זה', 400);

  const clinicalNotes = await loadNotes(supabase, session_id);
  if (!clinicalNotes) return fail('לא ניתן לטעון ממצאים קליניים. לא הופק דוח ללא הממצאים.', 503);
  const { data: assessmentRow } = await supabase.from('adhd_clinical_assessments').select('data').eq('session_id', session_id).maybeSingle();
  const assessment = assessmentRow ? normalizeAssessment(assessmentRow.data) : null;

  const person = { firstName: patient.first_name || '', lastName: patient.last_name || '', birthDate: patient.birth_date || null, gender: patient.gender || null };
  const intro = (selfQ.intro_data as Record<string, unknown> | null) ?? null, phone: string | null = contact?.phone || null;
  const { report, evaluation, score, tokensIn, tokensOut } = await generateAdultReportContent({
    patient: person, phone, reasonForReferral: session.reason_for_referral || null, responses, intro,
    freeText: selfQ.free_text ?? null, submittedAt: selfQ.submitted_at ?? null, clinicalNotes, assessment,
  });

  const pdfBuffer = await generatePdfReport({
    patient: { ...person, grade: null, school: null, teacherName: null },
    parent: null,
    reasonForReferral: session.reason_for_referral || null,
    parentScore: null,
    teacherScore: null,
    clinicalNotes,
    adult: adultPdfData({ responses, intro, submittedAt: selfQ.submitted_at ?? null, phone }),
    report,
    dsm5Items: { ...adultSymptomRows(responses, assessment), threshold: evaluation.threshold, inattentionCount: evaluation.inattention, hyperactivityCount: evaluation.hyperactivity },
    clinicianName: CLINICIAN_NAME,
    clinicianTitle: CLINICIAN_TITLE,
    reportDate: formatHebrewDate(new Date().toISOString()),
  });

  const adultScore = { raw: score.raw, flags: score.flags, presentation: score.presentation, screener_band: score.screenerBand, childhood_onset: score.childhoodOnset, impaired_domains: score.impairedDomains };
  return saveReport(supabase, session_id, pdfBuffer, {
    draft_content: { track: 'adult', adult_score: adultScore, adult_engine_version: ADULT_ENGINE_VERSION, ai_report: report, dsm5_evaluation: evaluation, clinical_assessment: assessment },
    ai_prompt_version: ADULT_REPORT_PROMPT_VERSION, ai_tokens_in: tokensIn, ai_tokens_out: tokensOut,
  });
}

function formatHebrewDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

export async function POST(req: NextRequest) {
  try {
    const staff = await getCurrentStaff();
    if (!staff) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 });
    if (req.headers.get('origin') !== req.nextUrl.origin) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 });
    const body = await req.json();
    const { session_id } = body;

    if (!session_id) {
      return NextResponse.json({ error: 'session_id חובה' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY לא מוגדר בשרת' },
        { status: 500 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Load session with related data
    const { data: session, error: sErr } = await supabase
      .from('intake_sessions')
      .select(
        `id, patient_id, reason_for_referral, notes, created_at,
         patients(first_name, last_name, birth_date, gender, grade, school, teacher_name),
         parents(full_name, relation, phone, email, is_primary_contact)`
      )
      .eq('id', session_id)
      .maybeSingle();

    if (sErr || !session) {
      return NextResponse.json({ error: 'תיק לא נמצא' }, { status: 404 });
    }

    const patientRaw = (session as any).patients;
    const patient = Array.isArray(patientRaw) ? patientRaw[0] : patientRaw;
    const parentsRaw = (session as any).parents;
    const parents: any[] = Array.isArray(parentsRaw)
      ? parentsRaw
      : parentsRaw
      ? [parentsRaw]
      : [];
    if (!patient) {
      return NextResponse.json({ error: 'ילד לא נמצא בתיק' }, { status: 404 });
    }

    // Adult file: one self-report instead of the parent and teacher questionnaires.
    if (await sessionTrack(supabase, session_id) === 'adult') {
      return await generateAdult(supabase, session, patient, parents.find((p: any) => p.is_primary_contact) || parents[0] || null);
    }

    // Load parent Vanderbilt questionnaire
    const { data: parentQ } = await supabase
      .from('questionnaires')
      .select('id, responses, submitted_at, is_complete, respondent_name, free_text, intro_data')
      .eq('session_id', session_id)
      .eq('type', 'vanderbilt_parent')
      .eq('is_complete', true)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!parentQ) {
      return NextResponse.json(
        { error: 'לא נמצא שאלון הורה מלא לתיק זה' },
        { status: 400 }
      );
    }

    // Load teacher Vanderbilt if exists
    const { data: teacherQ } = await supabase
      .from('questionnaires')
      .select('id, responses, submitted_at, is_complete, respondent_name, respondent_role, free_text')
      .eq('session_id', session_id)
      .eq('type', 'vanderbilt_teacher')
      .eq('is_complete', true)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const notesArray = await loadNotes(supabase, session_id);
    if (!notesArray) return fail('לא ניתן לטעון ממצאים קליניים. לא הופק דוח ללא הממצאים.', 503);

    // Compute scores
    const parentResponses = parentQ.responses as Record<string, number>;
    const parentScore = scoreVanderbilt(parentResponses, 'parent');

    let teacherScore = null;
    if (teacherQ) {
      const teacherResponses = teacherQ.responses as Record<string, number>;
      teacherScore = scoreVanderbilt(teacherResponses, 'teacher');
    }

    // Clinician's DSM-5 assessment (filled during the evaluation) – optional; without it the report is preliminary.
    const { data: assessmentRow } = await supabase
      .from('adhd_clinical_assessments')
      .select('data')
      .eq('session_id', session_id)
      .maybeSingle();
    const assessment = assessmentRow ? normalizeAssessment(assessmentRow.data) : null;
    const teacherResponses = teacherQ ? (teacherQ.responses as Record<string, number>) : null;

    const childName = `${patient.first_name || ''} ${patient.last_name || ''}`.trim();

    // Pick primary parent
    const primaryParent =
      parents.find((p: any) => p.is_primary_contact) || parents[0] || null;

    const { report: aiReport, evaluation, tokensIn, tokensOut } = await generateReportContent({
      patient: {
        firstName: patient.first_name || '',
        lastName: patient.last_name || '',
        birthDate: patient.birth_date || null,
        gender: patient.gender || null,
        grade: patient.grade || null,
        school: patient.school || null,
        teacherName: patient.teacher_name || null,
      },
      parent: primaryParent
        ? {
            fullName: primaryParent.full_name || '',
            relation: primaryParent.relation || null,
            phone: primaryParent.phone || '',
          }
        : null,
      reasonForReferral: session.reason_for_referral || null,
      parentScore,
      teacherScore,
      parentResponses,
      teacherResponses,
      parentIntro: (parentQ.intro_data as Record<string, unknown> | null) ?? null,
      parentFreeText: parentQ.free_text ?? null,
      teacherFreeText: teacherQ?.free_text ?? null,
      teacherRespondent: teacherQ ? { name: teacherQ.respondent_name ?? null, role: teacherQ.respondent_role ?? null } : null,
      clinicalNotes: notesArray,
      assessment,
    });

    // Item-level DSM-5 table for the PDF (same logic the generator used).
    const evidence = symptomEvidence({ parent: parentResponses, teacher: teacherResponses });
    const emptyAssessment = normalizeAssessment(null);
    const toRows = (list: readonly { code: string; he: string }[]): PdfSymptomRow[] => list.map((s) => ({
      code: s.code, text: s.he, parent: evidence[s.code]?.parent ?? null, teacher: evidence[s.code]?.teacher ?? null,
      present: effectivePresence(s.code, assessment ?? emptyAssessment, evidence),
    }));

    const pdfInput: PdfInput = {
      patient: {
        firstName: patient.first_name || '',
        lastName: patient.last_name || '',
        birthDate: patient.birth_date || null,
        gender: patient.gender || null,
        grade: patient.grade || null,
        school: patient.school || null,
        teacherName: patient.teacher_name || null,
      },
      parent: primaryParent
        ? {
            fullName: primaryParent.full_name || '',
            relation: primaryParent.relation || null,
            phone: primaryParent.phone || '',
          }
        : null,
      reasonForReferral: session.reason_for_referral || null,
      parentScore,
      teacherScore,
      clinicalNotes: notesArray,
      report: aiReport,
      dsm5Items: { inattention: toRows(DSM5_INATTENTION), hyperactivity: toRows(DSM5_HYPERACTIVITY), threshold: evaluation.threshold, inattentionCount: evaluation.inattention, hyperactivityCount: evaluation.hyperactivity },
      clinicianName: CLINICIAN_NAME,
      clinicianTitle: CLINICIAN_TITLE,
      reportDate: formatHebrewDate(new Date().toISOString()),
    };

    // Render PDF
    const pdfBuffer = await generatePdfReport(pdfInput);

    return await saveReport(supabase, session_id, pdfBuffer, {
      draft_content: { parent_score: parentScore, teacher_score: teacherScore, ai_report: aiReport, dsm5_evaluation: evaluation, clinical_assessment: assessment },
      ai_prompt_version: REPORT_PROMPT_VERSION, ai_tokens_in: tokensIn, ai_tokens_out: tokensOut,
    });
  } catch (e: any) {
    console.error('Report generation error:', e);
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
