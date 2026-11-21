'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import styles from '@/components/booking/booking.module.css';
import { isValidIsraeliId, normalizeIsraeliId } from '@/lib/israeli-id';
import { ADULT_MAX_AGE, ADULT_MIN_AGE, ageOn } from '@/lib/intake/adult';

type Language = 'he' | 'ar' | 'en';
/** [he, ar, en] */
const copy = {
  brand: ['מכון ילדי הקסם', 'معهد أطفال السحر', 'Magic Kids Institute'],
  clinic: ['מרפאת קשב וריכוז · מבוגרים', 'عيادة الانتباه والتركيز · بالغون', 'ADHD clinic · Adults'],
  title: ['אבחון קשב וריכוז למבוגרים', 'تقييم اضطراب الانتباه والتركيز للبالغين', 'ADHD assessment for adults'],
  intro: [
    'פותחים תיק וממלאים שאלון הערכה עצמית, כעשר דקות. לאחר שליחת השאלון צוות המכון יתאם איתך פגישת אבחון עם הרופא.',
    'تفتح ملفاً وتعبّئ استبيان تقييم ذاتي، نحو عشر دقائق. بعد إرسال الاستبيان يتواصل طاقم المعهد معك لتنسيق موعد التقييم مع الطبيب.',
    'Open a file and complete a self-report questionnaire, about ten minutes. Once it is submitted, our team will contact you to arrange the assessment appointment with the physician.',
  ],
  steps: ['פתיחת תיק|שאלון הערכה עצמית|תיאום פגישת אבחון', 'فتح ملف|استبيان التقييم الذاتي|تنسيق موعد التقييم', 'Open a file|Self-report questionnaire|Arrange the assessment'],
  note: [
    'השאלון הוא כלי עזר לרופא ואינו אבחנה. האבחנה נקבעת רק בפגישה עם הרופא.',
    'الاستبيان أداة مساعدة للطبيب وليس تشخيصاً. يُحدَّد التشخيص فقط في اللقاء مع الطبيب.',
    'The questionnaire assists the physician and is not a diagnosis. A diagnosis is made only at the appointment with the physician.',
  ],
  doctor: ['ד״ר בסים נמוז', 'الدكتور بسيم نموز', 'Dr. Basim Namouz'],
  role: ['אבחון הפרעות קשב וריכוז', 'تقييم اضطراب الانتباه والتركيز', 'ADHD assessments'],
  form: ['פתיחת תיק אבחון', 'فتح ملف تقييم', 'Open an assessment file'],
  existing: [
    'כבר פתחת תיק? אפשר לחזור לקישור האישי לשאלון, או למלא שוב את הפרטים כאן ונחזיר אותך לאותו תיק.',
    'فتحت ملفاً من قبل؟ يمكنك العودة إلى رابط الاستبيان الشخصي، أو تعبئة التفاصيل هنا مجدداً وسنعيدك إلى الملف نفسه.',
    'Already opened a file? Return to your personal questionnaire link, or enter your details again here and we will take you back to the same file.',
  ],
  headings: ['פרטים אישיים|פרטי קשר והסכמה', 'تفاصيل شخصية|تفاصيل الاتصال والموافقة', 'Personal details|Contact details and consent'],
  first: ['שם פרטי', 'الاسم الأول', 'First name'], last: ['שם משפחה', 'اسم العائلة', 'Last name'],
  id: ['תעודת זהות (9 ספרות)', 'رقم الهوية (9 أرقام)', 'ID number (9 digits)'],
  idInvalid: ['מספר תעודת הזהות אינו תקין. יש להקליד 9 ספרות, כולל ספרת הביקורת.', 'رقم الهوية غير صحيح. يرجى إدخال 9 أرقام، بما فيها رقم التدقيق.', 'The ID number is not valid. Enter all 9 digits, including the check digit.'],
  birth: ['תאריך לידה', 'تاريخ الميلاد', 'Date of birth'], gender: ['מין', 'الجنس', 'Sex'],
  genders: ['זכר|נקבה|אחר', 'ذكر|أنثى|آخر', 'Male|Female|Other'],
  phone: ['טלפון נייד', 'الهاتف المحمول', 'Mobile phone'], email: ['אימייל (אופציונלי)', 'البريد الإلكتروني (اختياري)', 'Email (optional)'],
  consent: [
    'אני מסכים/ה למסירת הפרטים ולעיבודם על ידי המכון לצורך תהליך האבחון ותיאום הפגישה.',
    'أوافق على تقديم المعلومات ومعالجتها من قبل المعهد لغرض التقييم وتنسيق الموعد.',
    'I consent to the institute processing the information I provide for the assessment process and appointment coordination.',
  ],
  next: ['המשך', 'متابعة', 'Continue'], back: ['חזרה', 'رجوع', 'Back'],
  submit: ['פתיחת תיק והמשך לשאלון', 'فتح الملف والانتقال إلى الاستبيان', 'Open file and continue to the questionnaire'],
  saving: ['פותחים את התיק…', 'جارٍ فتح الملف…', 'Opening your file…'],
  error: ['לא ניתן לפתוח כרגע את התיק. בדקו את הפרטים ונסו שוב, או צרו קשר עם המכון.', 'تعذّر فتح الملف حالياً. تحقق من التفاصيل وحاول مرة أخرى أو تواصل مع المعهد.', 'Unable to open the file. Check the details and try again, or contact the institute.'],
  underAge: ['מסלול זה מיועד לגיל 18 ומעלה. לאבחון ילדים ונוער יש לפתוח תיק במסלול הילדים.', 'هذا المسار مخصص لعمر 18 سنة فما فوق. لتقييم الأطفال والفتيان يُفتح ملف في مسار الأطفال.', 'This track is for ages 18 and above. For children and teenagers, open a file in the children’s track.'],
  birthInvalid: ['יש לוודא שתאריך הלידה נכון.', 'يرجى التأكد من تاريخ الميلاد.', 'Please check the date of birth.'],
  phoneInvalid: ['מספר הטלפון אינו תקין.', 'رقم الهاتف غير صحيح.', 'The phone number is not valid.'],
  childTrack: ['אבחון לילד/ה או לנער/ה? לטופס מסלול הילדים', 'تقييم لطفل/ة أو لفتى/فتاة؟ إلى نموذج مسار الأطفال', 'Assessment for a child or teenager? Go to the children’s form'],
  existingTitle: ['כבר קיים עבורך תיק', 'يوجد لك ملف', 'You already have a file'],
  existingBody: [
    'מצאנו במכון תיק אבחון עם אותם פרטים, ולכן לא נפתח תיק נוסף. אפשר להמשיך מהנקודה שבה עצרת; מה שכבר מילאת נשמר.',
    'وجدنا في المعهد ملف تقييم بنفس التفاصيل، لذلك لم يُفتح ملف إضافي. يمكنك المتابعة من حيث توقفت؛ ما عبأته محفوظ.',
    'We found an assessment file with the same details, so no additional file was opened. You can continue where you left off; what you already filled in is saved.',
  ],
  existingGo: ['המשך לתיק הקיים', 'المتابعة إلى الملف القائم', 'Continue to the existing file'],
  existsOther: [
    'כבר קיים עבורך תיק אבחון במכון, ולכן לא נפתח תיק נוסף. מספר הטלפון שהוזן שונה מזה שרשום בתיק. פנו למכון ונעזור לכם להמשיך.',
    'يوجد لك ملف تقييم في المعهد، لذلك لم يُفتح ملف إضافي. رقم الهاتف الذي أدخلته يختلف عن المسجَّل في الملف. تواصل مع المعهد وسنساعدك على المتابعة.',
    'You already have an assessment file at the institute, so no additional file was opened. The phone number you entered differs from the one on the file. Contact the institute and we will help you continue.',
  ],
  existsEnded: [
    'כבר קיים עבורך תיק אבחון במכון, והתהליך בו הסתיים. לתיאום המשך או הערכה חוזרת פנו למכון.',
    'يوجد لك ملف تقييم في المعهد وقد انتهى المسار فيه. لتنسيق متابعة أو تقييم جديد تواصل مع المعهد.',
    'You already have an assessment file at the institute and its process has ended. Contact the institute to arrange a follow-up or a new assessment.',
  ],
  mismatch: [
    'לא ניתן לפתוח תיק עם הפרטים שהוזנו. בדקו את מספר תעודת הזהות ואת תאריך הלידה, או פנו למכון.',
    'تعذّر فتح ملف بالتفاصيل المدخلة. تحقق من رقم الهوية وتاريخ الميلاد أو تواصل مع المعهد.',
    'A file cannot be opened with these details. Check the ID number and date of birth, or contact the institute.',
  ],
  existsLater: [
    'כבר קיים עבורך תיק אבחון במכון, אך לא ניתן לפתוח אותו כרגע. נסו שוב בעוד מספר דקות או פנו למכון.',
    'يوجد لك ملف تقييم في المعهد، لكن تعذّر فتحه حالياً. حاول بعد بضع دقائق أو تواصل مع المعهد.',
    'You already have an assessment file at the institute, but it cannot be opened right now. Try again in a few minutes or contact the institute.',
  ],
  home: ['חזרה לאתר המכון', 'العودة إلى موقع المعهد', 'Institute website'], help: ['עזרה מהמכון', 'مساعدة من المعهد', 'Contact the institute'],
} as const;
type Key = keyof typeof copy;
const serverCodes: Record<string, Key> = {
  existing_file: 'existsOther', existing_file_ended: 'existsEnded', details_mismatch: 'mismatch', link_unavailable: 'existsLater',
  under_age: 'underAge', invalid_birth_date: 'birthInvalid', invalid_id: 'idInvalid', invalid_phone: 'phoneInvalid',
};
type Data = { first_name: string; last_name: string; national_id: string; birth_date: string; gender: string; phone: string; email: string; consent: boolean };
const SITE = 'https://magickidsinstitute.com', WHATSAPP = 'https://wa.me/972544020043';

/** Public form /adults: an adult opens a file for their own assessment and continues to the self-report. */
export default function AdultOnboardingForm({ initialLanguage }: { initialLanguage: Language }) {
  const router = useRouter();
  const [language, setLanguage] = useState(initialLanguage), [step, setStep] = useState(1);
  const [data, setData] = useState<Data>({ first_name: '', last_name: '', national_id: '', birth_date: '', gender: 'male', phone: '', email: '', consent: false });
  const [loading, setLoading] = useState(false), [error, setError] = useState<Key | ''>(''), [existing, setExisting] = useState('');
  const existingHeading = useRef<HTMLHeadingElement>(null);
  const t = (key: Key) => copy[key][language === 'he' ? 0 : language === 'ar' ? 1 : 2];
  const questionnaire = (token: string) => `/questionnaire/adult/${encodeURIComponent(token)}?lang=${language}`;
  useEffect(() => { if (existing) existingHeading.current?.focus(); }, [existing]);
  useEffect(() => {
    document.documentElement.lang = language; document.documentElement.dir = language === 'en' ? 'ltr' : 'rtl';
    const url = new URL(location.href); url.searchParams.set('lang', language); history.replaceState(null, '', url.pathname + url.search);
  }, [language]);
  const update = <K extends keyof Data>(key: K, value: Data[K]) => setData(previous => ({ ...previous, [key]: value }));

  async function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (step === 1) {
      if (!isValidIsraeliId(data.national_id)) { setError('idInvalid'); return; }
      const age = ageOn(data.birth_date);
      if (!Number.isFinite(age) || age > ADULT_MAX_AGE) { setError('birthInvalid'); return; }
      if (age < ADULT_MIN_AGE) { setError('underAge'); return; }
      setStep(2); return;
    }
    if (loading || !data.consent) return;
    setLoading(true);
    try {
      const response = await fetch('/api/intake/adult', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, national_id: normalizeIsraeliId(data.national_id) }) });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.token) {
        if (result.existing) { setExisting(String(result.token)); return; }
        router.push(questionnaire(String(result.token))); return;
      }
      const known = typeof result.code === 'string' ? serverCodes[result.code] : undefined;
      if (known && ['mismatch', 'underAge', 'birthInvalid', 'idInvalid'].includes(known)) setStep(1);
      setError(known ?? 'error');
    } catch { setError('error'); } finally { setLoading(false); }
  }

  const input = (key: Exclude<keyof Data, 'consent'>, label: Key, type = 'text', required = false, maxLength = 120, autoComplete?: string) =>
    <label key={key}><span>{t(label)}</span><input value={data[key]} onChange={event => update(key, event.target.value)} type={type} required={required} maxLength={maxLength}
      minLength={type === 'tel' ? 7 : undefined} autoComplete={autoComplete} dir={type === 'tel' || type === 'email' ? 'ltr' : undefined} /></label>;
  const needsHelp = error === 'existsOther' || error === 'existsEnded' || error === 'mismatch' || error === 'existsLater' || error === 'error';
  const heading = t('headings').split('|')[step - 1];

  return <div className={styles.page} dir={language === 'en' ? 'ltr' : 'rtl'} lang={language}>
    <header className={styles.header}>
      <a className={styles.brand} href={`${SITE}/index.html?lang=${language}`}><img src={`${SITE}/assets/institute-logo.jpg`} width={56} height={56} alt="" /><span>{t('brand')}<small>MAGIC KIDS INSTITUTE</small></span></a>
      <div className={styles.languages} role="group" aria-label="Language / שפה / اللغة">{(['ar', 'he', 'en'] as const).map(lang =>
        <button key={lang} type="button" aria-pressed={language === lang} onClick={() => setLanguage(lang)}>{lang === 'ar' ? 'العربية' : lang === 'he' ? 'עברית' : 'EN'}</button>)}</div>
    </header>
    <main className={styles.main}>
      <aside className={styles.intro}>
        <span className={styles.eyebrow}>{t('clinic')}</span>
        <h1>{t('title')}</h1>
        <p>{t('intro')}</p>
        <ol className="space-y-3 mt-6">{t('steps').split('|').map((label, index) =>
          <li key={label} className="flex items-center gap-3"><span className="w-7 h-7 shrink-0 rounded-full bg-white/15 text-center text-sm" aria-hidden="true">{index + 1}</span>{label}</li>)}</ol>
        <p className="mt-6 text-sm opacity-90">{t('note')}</p>
        <div className={styles.doctor}><img src={`${SITE}/assets/doctor.jpg`} width={72} height={88} alt={t('doctor')} /><div><strong>{t('doctor')}</strong><span>{t('role')}</span></div></div>
        <a href={WHATSAPP} className={styles.phone}><span>{t('help')}</span><b dir="ltr">054-402-0043</b></a>
        <a className={styles.home} href={`${SITE}/index.html?lang=${language}`}>{t('home')}</a>
      </aside>
      <section className={styles.panel} aria-labelledby="adult-intake-title">{existing
        ? <div role="status">
            <h2 id="adult-intake-title" ref={existingHeading} tabIndex={-1} style={{ marginTop: 0 }}>{t('existingTitle')}</h2>
            <p className="mt-4 text-[#28423c] leading-relaxed">{t('existingBody')}</p>
            <a className={styles.primary} href={questionnaire(existing)}>{t('existingGo')}</a>
            <a href={WHATSAPP} className="inline-block mt-5 text-sm underline">{t('help')}: <bdi dir="ltr">054-402-0043</bdi></a>
          </div>
        : <>
            <p className={styles.muted}>{t('existing')}</p>
            <h2 id="adult-intake-title">{t('form')}</h2>
            <p className="text-sm text-[#01696f] mt-2 mb-4">{step} / 2 · {heading}</p>
            <div className="flex gap-2 mb-6" aria-hidden="true">{[1, 2].map(value => <span key={value} className={'h-1.5 flex-1 rounded-full ' + (step >= value ? 'bg-[#075a5d]' : 'bg-slate-100')} />)}</div>
            <form onSubmit={next}>
              <fieldset disabled={loading} className={styles.fields}>
                <legend className="sr-only">{heading}</legend>
                {step === 1 && <>
                  <div className="grid sm:grid-cols-2 gap-4">{input('first_name', 'first', 'text', true, 80, 'given-name')}{input('last_name', 'last', 'text', true, 80, 'family-name')}</div>
                  <label><span>{t('id')}</span><input value={data.national_id} onChange={event => update('national_id', normalizeIsraeliId(event.target.value).replace(/[^0-9]/g, '').slice(0, 9))}
                    type="text" inputMode="numeric" autoComplete="off" required minLength={9} maxLength={9} dir="ltr" /></label>
                  {input('birth_date', 'birth', 'date', true, 10, 'bday')}
                  <label><span>{t('gender')}</span><select className="w-full border border-slate-300 rounded-lg p-3 bg-white" value={data.gender} onChange={event => update('gender', event.target.value)}>
                    {['male', 'female', 'other'].map((value, index) => <option key={value} value={value}>{t('genders').split('|')[index]}</option>)}</select></label>
                </>}
                {step === 2 && <>
                  {input('phone', 'phone', 'tel', true, 25, 'tel')}
                  {input('email', 'email', 'email', false, 254, 'email')}
                  <label className={styles.consent}><input type="checkbox" required checked={data.consent} onChange={event => update('consent', event.target.checked)} /><span>{t('consent')}</span></label>
                </>}
              </fieldset>
              {error && <p role="alert" className={styles.error}>{t(error)}
                {error === 'underAge' && <><br /><a href={`/onboarding/public?lang=${language}`} className="inline-block mt-2 font-bold underline">{t('childTrack')}</a></>}
                {needsHelp && <><br /><a href={WHATSAPP} className="inline-block mt-2 font-bold underline">{t('help')}: <bdi dir="ltr">054-402-0043</bdi></a></>}</p>}
              <div className="flex items-center gap-3 mt-3">
                {step > 1 && <button type="button" disabled={loading} onClick={() => { setStep(1); setError(''); }} className="px-5 py-3 mt-5 rounded-xl border border-slate-300">{t('back')}</button>}
                <button type="submit" className={styles.primary} disabled={loading}>{t(loading ? 'saving' : step === 2 ? 'submit' : 'next')}</button>
              </div>
            </form>
            {error !== 'underAge' && <p className="mt-6 text-sm"><a className="underline text-[#01696f]" href={`/onboarding/public?lang=${language}`}>{t('childTrack')}</a></p>}
          </>}
      </section>
    </main>
    <footer className={styles.footer}><span>{t('brand')}</span><a href="mailto:magickids@magickidsinstitute.com" dir="ltr">magickids@magickidsinstitute.com</a></footer>
  </div>;
}
