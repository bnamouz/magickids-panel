import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { scoreVanderbilt } from '@/lib/vanderbilt-scoring';
import { generateReportContent } from '@/lib/report-generator';
import { generatePdfReport, type PdfInput } from '@/lib/pdf-report';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const CLINICIAN_NAME = 'ד"ר בסים נמוז';
const CLINICIAN_TITLE = 'מומחה ברפואת ילדים, הפרעות קשב וריכוז';

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

    // Load parent Vanderbilt questionnaire
    const { data: parentQ } = await supabase
      .from('questionnaires')
      .select('id, responses, submitted_at, is_complete, respondent_name')
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
      .select('id, responses, submitted_at, is_complete, respondent_name, respondent_role')
      .eq('session_id', session_id)
      .eq('type', 'vanderbilt_teacher')
      .eq('is_complete', true)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Load clinical notes
    const { data: clinicalNotes } = await supabase
      .from('clinical_notes')
      .select('category, content, created_at')
      .eq('session_id', session_id)
      .order('created_at', { ascending: true });

    // Compute scores
    const parentResponses = parentQ.responses as Record<string, number>;
    const parentScore = scoreVanderbilt(parentResponses, 'parent');

    let teacherScore = null;
    if (teacherQ) {
      const teacherResponses = teacherQ.responses as Record<string, number>;
      teacherScore = scoreVanderbilt(teacherResponses, 'teacher');
    }

    // Try to identify authenticated staff for audit
    const authHeader = req.headers.get('authorization');
    let generatedByUserId: string | null = null;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        const { data: staff } = await supabase
          .from('users')
          .select('id')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        generatedByUserId = staff?.id || null;
      }
    }

    const childName = `${patient.first_name || ''} ${patient.last_name || ''}`.trim();

    // Pick primary parent
    const primaryParent =
      parents.find((p: any) => p.is_primary_contact) || parents[0] || null;

    const notesArray = (clinicalNotes || []).map((n: any) => ({
      category: n.category,
      content: n.content,
    }));

    const aiReport = await generateReportContent({
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
    });

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
      clinicianName: CLINICIAN_NAME,
      clinicianTitle: CLINICIAN_TITLE,
      reportDate: formatHebrewDate(new Date().toISOString()),
    };

    // Render PDF
    const pdfBuffer = await generatePdfReport(pdfInput);

    // Upload to Supabase Storage.
    // Storage keys must be ASCII-safe (Hebrew/RTL characters are rejected as 'Invalid key').
    // We keep session_id as the folder for organization and use ASCII-only filenames.
    const timestamp = Date.now();
    const filePath = `${session_id}/${timestamp}_report.pdf`;

    const { error: uploadErr } = await supabase.storage
      .from('reports')
      .upload(filePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadErr) {
      return NextResponse.json(
        { error: `שגיאה בהעלאת ה-PDF: ${uploadErr.message}` },
        { status: 500 }
      );
    }

    // Create signed URL (1 hour)
    const { data: signedData } = await supabase.storage
      .from('reports')
      .createSignedUrl(filePath, 3600);

    // Insert report row
    const { data: reportRow, error: rErr } = await supabase
      .from('reports')
      .insert({
        session_id,
        draft_content: {
          parent_score: parentScore,
          teacher_score: teacherScore,
          ai_report: aiReport,
        },
        ai_model: 'gpt-4o',
        ai_prompt_version: 'v1',
        status: 'draft',
        pdf_storage_path: filePath,
        download_url: signedData?.signedUrl || null,
        download_expires_at: signedData?.signedUrl
          ? new Date(Date.now() + 3600 * 1000).toISOString()
          : null,
        generated_at: new Date().toISOString(),
        reviewed_by: generatedByUserId,
      })
      .select()
      .single();

    if (rErr) {
      await supabase.storage.from('reports').remove([filePath]);
      return NextResponse.json(
        { error: `שגיאה בשמירת הדוח: ${rErr.message}` },
        { status: 500 }
      );
    }

    // Update session status to 'reported'
    await supabase
      .from('intake_sessions')
      .update({ status: 'reported' })
      .eq('id', session_id);

    return NextResponse.json({
      ok: true,
      report: reportRow,
      download_url: signedData?.signedUrl || null,
      file_size: pdfBuffer.length,
    });
  } catch (e: any) {
    console.error('Report generation error:', e);
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
