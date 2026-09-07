import { questionnaireSubmitted, firstRelated } from '@/lib/intake/progress';
export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { getSupabaseAdmin } from '@/lib/supabase';
import ShareTeacherClient from './ShareTeacherClient';

function getAppUrl(): string {
  const envUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim();
  if (envUrl && envUrl.startsWith('http')) return envUrl.replace(/\/$/, '');
  const h = headers();
  const proto = (h.get('x-forwarded-proto') ?? 'https').trim();
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? '').trim();
  if (host) return `${proto}://${host}`;
  return 'https://magickids-panel.vercel.app';
}

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { token: string };
}

export default async function ShareTeacherPage({ params }: PageProps) {
  const { token } = params;

  if (token === 'demo') {
    return (
      <ShareTeacherClient
        parentToken="demo"
        childName="ילד לדוגמא"
        existingTeacherUrl={null}
        existingTeacherInfo={null}
      />
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: session } = await supabase
    .from('intake_sessions')
    .select(
      'id, status, parent_token_expires_at, teacher_token, teacher_name, teacher_phone, teacher_email, patients(first_name, last_name)',
    )
    .eq('parent_token', token)
    .maybeSingle();

  if (!session) notFound();

  if (session.parent_token_expires_at && (!Number.isFinite(Date.parse(session.parent_token_expires_at)) || Date.parse(session.parent_token_expires_at) <= Date.now())) return <div className="card max-w-xl mx-auto my-12" dir="rtl">הקישור פג תוקף. צרו קשר עם המכון לקבלת קישור חדש.</div>;
  const { data: parentForm, error: formError } = await supabase.from('questionnaires').select('type,is_complete,submitted_at,responses').eq('session_id', session.id).eq('type', 'vanderbilt_parent').maybeSingle();
  if (formError) return <div className="card max-w-xl mx-auto my-12" dir="rtl">לא ניתן לאמת כרגע את מצב השאלון. נסו שוב בהמשך.</div>;
  if (!questionnaireSubmitted(parentForm ?? undefined)) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16" dir="rtl">
        <div className="card text-center">
          <h1 className="text-2xl font-bold text-orange-600 mb-3">יש למלא קודם את שאלון ההורה</h1>
          <p className="text-slate-700 mb-4">
            לאחר מילוי השאלון תוכלו לקבל קישור עבור המורה.
          </p>
          <a href={`/questionnaire/parent/${token}`} className="btn-primary inline-block">
            מילוי שאלון ההורה
          </a>
        </div>
      </div>
    );
  }

  const patient = firstRelated<any>(session.patients);
  const childName = `${patient?.first_name ?? ''} ${patient?.last_name ?? ''}`.trim() || 'הילד';

  const appUrl = getAppUrl();
  const existingUrl = session.teacher_token ? `${appUrl}/teacher/${session.teacher_token}` : null;

  return (
    <ShareTeacherClient
      parentToken={token}
      childName={childName}
      existingTeacherUrl={existingUrl}
      existingTeacherInfo={{
        name: session.teacher_name ?? '',
        phone: session.teacher_phone ?? '',
        email: session.teacher_email ?? '',
        status: session.status,
      }}
    />
  );
}
