import { notFound } from 'next/navigation';
import QuestionnaireForm from '@/components/forms/QuestionnaireForm';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { token: string };
}

export default async function ParentQuestionnairePage({ params }: PageProps) {
  const { token } = params;

  // Demo mode
  if (token === 'demo') {
    return (
      <QuestionnaireForm
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
    .select('id, status, parent_token_expires_at, patients(first_name, last_name)')
    .eq('parent_token', token)
    .maybeSingle();

  if (!session) notFound();
  if (new Date(session.parent_token_expires_at) < new Date()) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16">
        <div className="card text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-3">הקישור פג</h1>
          <p className="text-slate-700">צרו קשר עם המכון לקבלת קישור חדש.</p>
        </div>
      </div>
    );
  }

  // Load any existing responses (resume)
  const { data: existing } = await supabase
    .from('questionnaires')
    .select('responses, free_text')
    .eq('session_id', session.id)
    .eq('type', 'vanderbilt_parent')
    .maybeSingle();

  const patient = (session as any).patients;
  const childName = `${patient?.first_name ?? ''} ${patient?.last_name ?? ''}`.trim();

  return (
    <QuestionnaireForm
      token={token}
      childName={childName || 'ילדכם'}
      initialResponses={(existing?.responses as any) ?? {}}
    />
  );
}
