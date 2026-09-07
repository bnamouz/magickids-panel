import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';
import { intakeProgress } from '@/lib/intake/progress';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'מצב תהליך הקליטה | ילדי הקסם', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
export default async function IntakeStatusPage({ params }: { params: { token: string } }) {
  if (!z.string().uuid().safeParse(params.token).success) notFound();
  const db = getSupabaseAdmin();
  const { data: session, error } = await db.from('intake_sessions').select('id,status,parent_token_expires_at').eq('parent_token', params.token).maybeSingle();
  if (error) return <Notice text="לא ניתן לטעון כרגע את מצב התהליך. נסו שוב בהמשך."/>;
  if (!session) notFound();
  if (session.parent_token_expires_at && (!Number.isFinite(Date.parse(session.parent_token_expires_at)) || Date.parse(session.parent_token_expires_at) <= Date.now())) return <Notice text="הקישור פג תוקף. צרו קשר עם המכון לקבלת קישור חדש."/>;
  const [forms, appointments] = await Promise.all([
    db.from('questionnaires').select('type,is_complete,submitted_at,responses').eq('session_id',session.id),
    db.from('appointments').select('id,status,scheduled_at,appointment_type').eq('session_id',session.id),
  ]);
  if (forms.error || appointments.error) return <Notice text="לא ניתן לטעון כרגע את מצב התהליך. נסו שוב בהמשך."/>;
  const progress = intakeProgress(forms.data ?? [],appointments.data ?? [],session.status);
  const message = progress.stage === 'closed' ? 'התהליך בתיק הזה הסתיים. לשאלות נוספות ניתן לפנות למכון.' : progress.hasAppointment ? 'הפגישה כבר מופיעה במערכת המרפאה. לפרטי התיאום ניתן לפנות לצוות.' : progress.bothComplete ? 'שני השאלונים התקבלו. התיק מופיע לצוות המכון כמוכן לזימון לפגישה. הצוות יכול כעת לתאם אתכם מועד.' : !progress.parentComplete ? 'יש להשלים תחילה את שאלון ההורים.' : 'שאלון ההורים התקבל. כעת יש להעביר למורה את הקישור האישי ולהמתין לשליחת שאלון המורה.';
  return <main className="max-w-2xl mx-auto px-4 py-12" dir="rtl"><div className="card"><p className="text-sm font-semibold text-[#01696f]">מכון ילדי הקסם · מרפאת הקשב</p><h1 className="text-2xl font-bold text-slate-800 mt-3 mb-6">מצב תהליך הקליטה</h1><ul className="space-y-3 mb-6"><li className="rounded-lg bg-slate-50 p-4">שאלון הורים: <strong>{progress.parentComplete ? '✓ התקבל' : 'ממתין להשלמה'}</strong></li><li className="rounded-lg bg-slate-50 p-4">שאלון מורה: <strong>{progress.teacherComplete ? '✓ התקבל' : 'ממתין להשלמה'}</strong></li></ul><p className="rounded-lg bg-teal-50 p-4 text-[#01696f]">{message}</p><div className="flex flex-wrap gap-3 mt-6">{!progress.parentComplete && progress.stage !== 'closed' && <Link className="btn-primary" href={'/questionnaire/parent/'+params.token}>המשך שאלון ההורים</Link>}{progress.parentComplete && !progress.teacherComplete && progress.stage !== 'closed' && <Link className="btn-primary" href={'/share-teacher/'+params.token}>קישור לשאלון המורה</Link>}<a className="btn-ghost" href={'/onboarding/status/'+params.token}>רענון המצב</a></div><p className="text-sm text-slate-500 mt-6">שמרו את הקישור האישי כדי לחזור למעקב. תשובות המורה מוצגות לצוות המכון בלבד.</p><a className="inline-block text-[#01696f] underline mt-4" href="tel:+972544020043">לפנייה למכון: <b dir="ltr">054-402-0043</b></a></div></main>;
}
function Notice({ text }: { text: string }) { return <main className="max-w-2xl mx-auto px-4 py-12" dir="rtl"><div className="card"><h1 className="text-xl font-bold mb-3">מצב תהליך הקליטה</h1><p>{text}</p><a href="tel:+972544020043" className="btn-primary inline-block mt-4">צרו קשר עם המכון</a></div></main>; }
