import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase';
import { intakeProgress, ADULT_QUESTIONNAIRE } from '@/lib/intake/progress';
import { sessionTrack } from '@/lib/intake/adult';
import { intakeLinkTokenSchema } from '@/lib/intake/tokens';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'מצב תהליך הקליטה | ילדי הקסם', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
export default async function IntakeStatusPage({ params }: { params: { token: string } }) {
  if (!intakeLinkTokenSchema.safeParse(params.token).success) notFound();
  const db = getSupabaseAdmin();
  const { data: session, error } = await db.from('intake_sessions').select('id,status,parent_token_expires_at').eq('parent_token', params.token).maybeSingle();
  if (error) return <Notice text="לא ניתן לטעון כרגע את מצב התהליך. נסו שוב בהמשך."/>;
  if (!session) notFound();
  if (session.parent_token_expires_at && (!Number.isFinite(Date.parse(session.parent_token_expires_at)) || Date.parse(session.parent_token_expires_at) <= Date.now())) return <Notice text="הקישור פג תוקף. צרו קשר עם המכון לקבלת קישור חדש."/>;
  const [forms, appointments] = await Promise.all([
    db.from('questionnaires').select('type,is_complete,submitted_at,responses,intro_data').eq('session_id',session.id),
    db.from('appointments').select('id,status,scheduled_at,appointment_type').eq('session_id',session.id),
  ]);
  if (forms.error || appointments.error) return <Notice text="לא ניתן לטעון כרגע את מצב התהליך. נסו שוב בהמשך."/>;
  const track = await sessionTrack(db, session.id);
  const progress = intakeProgress(forms.data ?? [],appointments.data ?? [],session.status,track);
  if (progress.adult) return <AdultStatus token={params.token} progress={progress} language={((forms.data ?? []).find(form => form.type === ADULT_QUESTIONNAIRE)?.intro_data as any)?.language} />;
  const message = progress.stage === 'closed' ? 'התהליך בתיק הזה הסתיים. לשאלות נוספות ניתן לפנות למכון.' : progress.hasAppointment ? 'הפגישה כבר מופיעה במערכת המרפאה. לפרטי התיאום ניתן לפנות לצוות.' : progress.bothComplete ? 'שני השאלונים התקבלו. התיק מופיע לצוות המכון כמוכן לזימון לפגישה. הצוות יכול כעת לתאם אתכם מועד.' : !progress.parentComplete ? 'יש להשלים תחילה את שאלון ההורים.' : 'שאלון ההורים התקבל. כעת יש להעביר למורה את הקישור האישי ולהמתין לשליחת שאלון המורה.';
  return <main className="max-w-2xl mx-auto px-4 py-12" dir="rtl"><div className="card"><p className="text-sm font-semibold text-[#01696f]">מכון ילדי הקסם · מרפאת הקשב</p><h1 className="text-2xl font-bold text-slate-800 mt-3 mb-6">מצב תהליך הקליטה</h1><ul className="space-y-3 mb-6"><li className="rounded-lg bg-slate-50 p-4">שאלון הורים: <strong>{progress.parentComplete ? '✓ התקבל' : 'ממתין להשלמה'}</strong></li><li className="rounded-lg bg-slate-50 p-4">שאלון מורה: <strong>{progress.teacherComplete ? '✓ התקבל' : 'ממתין להשלמה'}</strong></li></ul><p className="rounded-lg bg-teal-50 p-4 text-[#01696f]">{message}</p><div className="flex flex-wrap gap-3 mt-6">{!progress.parentComplete && progress.stage !== 'closed' && <Link className="btn-primary" href={'/questionnaire/parent/'+params.token}>המשך שאלון ההורים</Link>}{progress.parentComplete && !progress.teacherComplete && progress.stage !== 'closed' && <Link className="btn-primary" href={'/share-teacher/'+params.token}>קישור לשאלון המורה</Link>}<a className="btn-ghost" href={'/onboarding/status/'+params.token}>רענון המצב</a></div><p className="text-sm text-slate-500 mt-6">שמרו את הקישור האישי כדי לחזור למעקב. תשובות המורה מוצגות לצוות המכון בלבד.</p><a className="inline-block text-[#01696f] underline mt-4" href="tel:+972544020043">לפנייה למכון: <b dir="ltr">054-402-0043</b></a></div></main>;
}
function Notice({ text }: { text: string }) { return <main className="max-w-2xl mx-auto px-4 py-12" dir="rtl"><div className="card"><h1 className="text-xl font-bold mb-3">מצב תהליך הקליטה</h1><p>{text}</p><a href="tel:+972544020043" className="btn-primary inline-block mt-4">צרו קשר עם המכון</a></div></main>; }

/** Adult track: one self-report, then the team schedules the assessment. Shown in the language the form was filled in. */
const adultCopy = {
  he: { clinic: 'מכון ילדי הקסם · מרפאת הקשב · מבוגרים', title: 'מצב התיק', form: 'שאלון הערכה עצמית', done: 'התקבל', waiting: 'ממתין להשלמה',
    closed: 'התהליך בתיק הזה הסתיים. לשאלות נוספות ניתן לפנות למכון.', booked: 'הפגישה כבר מופיעה במערכת המרפאה. לפרטי התיאום ניתן לפנות לצוות.',
    ready: 'השאלון התקבל. התיק מופיע לצוות המכון כמוכן לזימון, וניצור איתך קשר לתיאום פגישת האבחון.', todo: 'יש להשלים את שאלון ההערכה העצמית. התשובות שכבר מילאת שמורות.',
    go: 'המשך השאלון', refresh: 'רענון המצב', keep: 'שמרו את הקישור האישי כדי לחזור למעקב. תוצאות השאלון נמסרות לרופא בלבד; האבחנה נקבעת רק בפגישה.', contact: 'לפנייה למכון' },
  ar: { clinic: 'معهد أطفال السحر · عيادة الانتباه · بالغون', title: 'حالة الملف', form: 'استبيان التقييم الذاتي', done: 'تم الاستلام', waiting: 'بانتظار الإكمال',
    closed: 'انتهى المسار في هذا الملف. لأي استفسار يمكن التواصل مع المعهد.', booked: 'الموعد مسجّل في نظام العيادة. لتفاصيل التنسيق يمكن التواصل مع الطاقم.',
    ready: 'تم استلام الاستبيان. يظهر الملف لطاقم المعهد كجاهز لتنسيق الموعد، وسنتواصل معك لتنسيق موعد التقييم.', todo: 'يجب إكمال استبيان التقييم الذاتي. الإجابات التي عبأتها محفوظة.',
    go: 'متابعة الاستبيان', refresh: 'تحديث الحالة', keep: 'احتفظ بالرابط الشخصي للعودة إلى المتابعة. نتائج الاستبيان تُسلَّم للطبيب فقط؛ يُحدَّد التشخيص في اللقاء فقط.', contact: 'للتواصل مع المعهد' },
  en: { clinic: 'Magic Kids Institute · ADHD clinic · Adults', title: 'File status', form: 'Self-report questionnaire', done: 'Received', waiting: 'Waiting to be completed',
    closed: 'The process in this file has ended. Contact the institute with any questions.', booked: 'Your appointment is already in the clinic system. Contact the team for details.',
    ready: 'Your questionnaire was received. The file shows to our team as ready to schedule, and we will contact you to arrange the assessment appointment.', todo: 'Please complete the self-report questionnaire. The answers you already gave are saved.',
    go: 'Continue the questionnaire', refresh: 'Refresh status', keep: 'Keep your personal link to return here. The questionnaire results go to the physician only; a diagnosis is made only at the appointment.', contact: 'Contact the institute' },
} as const;
function AdultStatus({ token, progress, language }: { token: string; progress: ReturnType<typeof intakeProgress>; language?: string }) {
  const lang = language === 'ar' || language === 'en' ? language : 'he', t = adultCopy[lang];
  const message = progress.stage === 'closed' ? t.closed : progress.hasAppointment ? t.booked : progress.bothComplete ? t.ready : t.todo;
  return <main className="max-w-2xl mx-auto px-4 py-12" dir={lang === 'en' ? 'ltr' : 'rtl'} lang={lang}><div className="card">
    <p className="text-sm font-semibold text-[#01696f]">{t.clinic}</p>
    <h1 className="text-2xl font-bold text-slate-800 mt-3 mb-6">{t.title}</h1>
    <ul className="space-y-3 mb-6"><li className="rounded-lg bg-slate-50 p-4">{t.form}: <strong>{progress.parentComplete ? t.done : t.waiting}</strong></li></ul>
    <p className="rounded-lg bg-teal-50 p-4 text-[#01696f]">{message}</p>
    <div className="flex flex-wrap gap-3 mt-6">
      {!progress.parentComplete && progress.stage !== 'closed' && <Link className="btn-primary" href={`/questionnaire/adult/${token}?lang=${lang}`}>{t.go}</Link>}
      <a className="btn-ghost" href={'/onboarding/status/' + token}>{t.refresh}</a>
    </div>
    <p className="text-sm text-slate-500 mt-6">{t.keep}</p>
    <a className="inline-block text-[#01696f] underline mt-4" href="https://wa.me/972544020043">{t.contact}: <b dir="ltr">054-402-0043</b></a>
  </div></main>;
}
