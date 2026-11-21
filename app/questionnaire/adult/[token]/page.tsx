import { notFound, redirect } from 'next/navigation';
import AdultQuestionnaireForm from '@/components/forms/AdultQuestionnaireForm';
import { getSupabaseAdmin } from '@/lib/supabase';
import { firstRelated, questionnaireSubmitted, ADULT_QUESTIONNAIRE } from '@/lib/intake/progress';
import { intakeLinkTokenSchema } from '@/lib/intake/tokens';
import type { AdultLang } from '@/questions/asrs_adult';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'שאלון הערכה עצמית למבוגרים | ילדי הקסם', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
const lang = (value: unknown): AdultLang | null => value === 'he' || value === 'ar' || value === 'en' ? value : null;

/** The adult's personal link: resumes the saved draft, or shows the status page once the form was submitted. */
export default async function AdultQuestionnairePage({ params, searchParams }: { params: { token: string }; searchParams: { lang?: string } }) {
  const { token } = params;
  if (token === 'demo') return <AdultQuestionnaireForm token="demo" name="" initialLanguage={lang(searchParams.lang) ?? 'he'} />;
  if (!intakeLinkTokenSchema.safeParse(token).success) notFound();

  const db = getSupabaseAdmin();
  const { data: session } = await db.from('intake_sessions').select('id,status,track,parent_token_expires_at,patients(first_name,last_name)').eq('parent_token', token).maybeSingle();
  if (!session || session.track !== 'adult') notFound();
  const expires = session.parent_token_expires_at;
  if (expires && (!Number.isFinite(Date.parse(expires)) || Date.parse(expires) <= Date.now())) return <Notice title="הקישור פג תוקף" text="צרו קשר עם המכון לקבלת קישור חדש." />;
  if (['cancelled', 'closed'].includes(session.status)) return <Notice title="התיק סגור" text="התהליך בתיק הזה הסתיים. לשאלות ניתן לפנות למכון." />;

  const { data: saved } = await db.from('questionnaires').select('type,responses,free_text,intro_data,is_complete,submitted_at').eq('session_id', session.id).eq('type', ADULT_QUESTIONNAIRE).maybeSingle();
  if (questionnaireSubmitted(saved ?? undefined)) redirect('/onboarding/status/' + encodeURIComponent(token));
  const patient = firstRelated<any>(session.patients);
  const { language, ...intro } = ((saved?.intro_data as Record<string, string> | null) ?? {});
  return <AdultQuestionnaireForm token={token} name={`${patient?.first_name ?? ''} ${patient?.last_name ?? ''}`.trim()}
    initialLanguage={lang(searchParams.lang) ?? lang(language) ?? 'he'} initialResponses={(saved?.responses as Record<string, number> | null) ?? {}}
    initialIntroData={intro} initialFreeText={saved?.free_text ?? ''} />;
}
function Notice({ title, text }: { title: string; text: string }) {
  return <main className="max-w-xl mx-auto px-4 py-16" dir="rtl"><div className="card text-center">
    <h1 className="text-2xl font-bold text-[#01696f] mb-3">{title}</h1><p className="text-slate-700">{text}</p>
    <a href="https://wa.me/972544020043" className="btn-primary inline-block mt-5">לפנייה למכון: <bdi dir="ltr">054-402-0043</bdi></a>
  </div></main>;
}
