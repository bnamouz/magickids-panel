import { notFound } from 'next/navigation';
import TeacherQuestionnaireForm from '@/components/forms/TeacherQuestionnaireForm';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { token: string };
}

export default async function TeacherQuestionnairePage({ params }: PageProps) {
  const { token } = params;

  // Demo mode
  if (token === 'demo') {
    return (
      <TeacherQuestionnaireForm
        token="demo"
        childName="ילד לדוגמא"
        initialResponses={{}}
      />
    );
  }

  // Real mode: load session
  const supabase = getSupabaseAdmin();
  const { data: session } = await supabase
    .from('intake_sessions')
    .select('id, status, teacher_token_expires_at, teacher_name, patients(first_name, last_name)')
    .eq('teacher_token', token)
    .maybeSingle();

  if (!session) notFound();

  if (session.teacher_token_expires_at && new Date(session.teacher_token_expires_at) < new Date()) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16" dir="rtl">
        <div className="card text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-3">הקישור פג תוקף</h1>
          <p className="text-slate-700">אנא בקש מההורה לשלוח קישור חדש לאחר יצירת קשר עם המכון.</p>
        </div>
      </div>
    );
  }

  // Block teacher access if status indicates teacher already submitted
  if (session.status === 'teacher_form_done' || session.status === 'profile_ready') {
    return (
      <div className="max-w-xl mx-auto px-4 py-16" dir="rtl">
        <div className="card text-center">
          <h1 className="text-2xl font-bold text-[#01696f] mb-3">השאלון כבר נשלח</h1>
          <p className="text-slate-700">תודה. אם זוהי טעות, אנא צרו קשר עם המכון.</p>
        </div>
      </div>
    );
  }

  // Load any existing responses for resume
  const { data: existing } = await supabase
    .from('questionnaires')
    .select('responses, free_text')
    .eq('session_id', session.id)
    .eq('type', 'vanderbilt_teacher')
    .maybeSingle();

  const patient = (session as any).patients;
  const childName = `${patient?.first_name ?? ''} ${patient?.last_name ?? ''}`.trim() || 'התלמיד/ה';

  return (
    <TeacherQuestionnaireForm
      token={token}
      childName={childName}
      teacherName={(session as any).teacher_name ?? ''}
      initialResponses={(existing?.responses as any) ?? {}}
    />
  );
}
