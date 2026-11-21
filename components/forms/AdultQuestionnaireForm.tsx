'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import { ASRS_ADULT_INTRO_FIELDS, ASRS_ADULT_QUESTIONS, ASRS_COPYRIGHT, adultScale, type AdultIntroField, type AdultLang, type AdultPart } from '@/questions/asrs_adult';

type L = Record<AdultLang, string>;
type Responses = Record<string, number>;
const l = (he: string, ar: string, en: string): L => ({ he, ar, en });
/** Section headings are deliberately neutral: the person assessed is not told which answers count. */
const SECTIONS: { key: string; part: AdultPart | 'intro'; ids: [number, number]; title: L; lead: L }[] = [
  { key: 'intro', part: 'intro', ids: [0, 0], title: l('פרטי רקע', 'معلومات أساسية', 'Background'),
    lead: l('כמה פרטים שיעזרו לרופא להכיר אותך לפני הפגישה.', 'بعض المعلومات التي تساعد الطبيب على التعرف عليك قبل اللقاء.', 'A few details that help the physician get to know you before the appointment.') },
  { key: 'a', part: 'A', ids: [1, 6], title: l('חלק א', 'القسم الأول', 'Part A'),
    lead: l('בחר/י בכל שאלה את התשובה המתארת בצורה הטובה ביותר את האופן בו הרגשת וניהלת את עצמך בששת החודשים האחרונים.',
      'اختر في كل سؤال الإجابة التي تمثل أفضل وصف لكيف كان شعورك وحالك على مدى الـ ٦ اشهر الماضية.',
      'For each question, choose the answer that best describes how you have felt and conducted yourself over the past 6 months.') },
  { key: 'b1', part: 'B', ids: [7, 11], title: l('חלק ב', 'القسم الثاني', 'Part B'),
    lead: l('גם כאן: ששת החודשים האחרונים.', 'هنا أيضاً: الأشهر الستة الماضية.', 'Here too: the past 6 months.') },
  { key: 'b2', part: 'B', ids: [12, 18], title: l('חלק ג', 'القسم الثالث', 'Part C'),
    lead: l('גם כאן: ששת החודשים האחרונים.', 'هنا أيضاً: الأشهر الستة الماضية.', 'Here too: the past 6 months.') },
  { key: 'childhood', part: 'childhood', ids: [19, 22], title: l('בילדות', 'في الطفولة', 'In childhood'),
    lead: l('חשוב/י על התקופה שלפני גיל 12, בבית הספר היסודי. אם אינך זוכר/ת, אפשר לסמן זאת.',
      'فكّر في الفترة قبل سن 12، في المدرسة الابتدائية. إذا كنت لا تتذكر، يمكنك اختيار ذلك.',
      'Think of the time before age 12, in primary school. If you do not remember, you can say so.') },
  { key: 'impairment', part: 'impairment', ids: [23, 28], title: l('השפעה על חיי היומיום', 'التأثير على الحياة اليومية', 'Effect on daily life'),
    lead: l('באיזו מידה הקשיים שתיארת מפריעים לך בכל אחד מהתחומים הבאים, בששת החודשים האחרונים?',
      'إلى أي درجة تزعجك الصعوبات التي وصفتها في كل من المجالات التالية، خلال الأشهر الستة الماضية؟',
      'How much do the difficulties you described interfere with each of the following areas, over the past 6 months?') },
];
const ui = {
  eyebrow: l('שאלון הערכה עצמית למבוגרים', 'استبيان التقييم الذاتي للبالغين', 'Adult self-report questionnaire'),
  step: l('שלב {n} מתוך {total}', 'المرحلة {n} من {total}', 'Step {n} of {total}'),
  answered: l('{n} מתוך {total} שאלות', '{n} من {total} سؤالاً', '{n} of {total} questions'),
  back: l('חזרה', 'رجوع', 'Back'), next: l('הבא', 'التالي', 'Next'), submit: l('שליחת השאלון', 'إرسال الاستبيان', 'Submit questionnaire'),
  sending: l('שולח…', 'جارٍ الإرسال…', 'Sending…'),
  saving: l('שומר…', 'جارٍ الحفظ…', 'Saving…'), saved: l('נשמר', 'تم الحفظ', 'Saved'), saveError: l('השמירה נכשלה', 'تعذّر الحفظ', 'Not saved'),
  missing: l('יש לענות על כל השאלות בשלב זה כדי להמשיך.', 'يجب الإجابة عن كل أسئلة هذه المرحلة للمتابعة.', 'Please answer every question in this step to continue.'),
  submitError: l('השליחה נכשלה. התשובות שמורות; נסו שוב בעוד רגע.', 'تعذّر الإرسال. إجاباتك محفوظة؛ حاول مجدداً بعد قليل.', 'Sending failed. Your answers are saved; please try again in a moment.'),
  expired: l('הקישור פג תוקף. צרו קשר עם המכון לקבלת קישור חדש.', 'انتهت صلاحية الرابط. تواصل مع المعهد للحصول على رابط جديد.', 'This link has expired. Contact the institute for a new one.'),
  required: l('שדה חובה', 'حقل إلزامي', 'Required'),
  freeTitle: l('משהו נוסף שחשוב שהרופא ידע? (אופציונלי)', 'هل هناك شيء آخر من المهم أن يعرفه الطبيب؟ (اختياري)', 'Anything else the physician should know? (optional)'),
  resume: l('התשובות נשמרות אוטומטית. אפשר לסגור ולחזור לקישור הזה בכל עת.', 'تُحفظ الإجابات تلقائياً. يمكنك الإغلاق والعودة إلى هذا الرابط في أي وقت.', 'Your answers are saved automatically. You can close this page and return to this link at any time.'),
  note: l('השאלון הוא כלי עזר לרופא ואינו אבחנה.', 'الاستبيان أداة مساعدة للطبيب وليس تشخيصاً.', 'This questionnaire assists the physician and is not a diagnosis.'),
  thanks: l('תודה, השאלון התקבל', 'شكراً، تم استلام الاستبيان', 'Thank you, your questionnaire was received'),
  thanksBody: l('התיק שלך מופיע כעת לצוות המכון כמוכן לזימון. ניצור איתך קשר לתיאום פגישת האבחון עם הרופא.',
    'يظهر ملفك الآن لطاقم المعهد كجاهز لتنسيق الموعد. سنتواصل معك لتنسيق موعد التقييم مع الطبيب.',
    'Your file now shows to our team as ready to schedule. We will contact you to arrange the assessment appointment with the physician.'),
  thanksNote: l('תוצאות השאלון נמסרות לרופא בלבד. האבחנה נקבעת רק בפגישה.', 'نتائج الاستبيان تُسلَّم للطبيب فقط. يُحدَّد التشخيص في اللقاء فقط.', 'The questionnaire results go to the physician only. A diagnosis is made only at the appointment.'),
  status: l('מעקב אחר מצב התיק', 'متابعة حالة الملف', 'Track your file'), contact: l('לפנייה למכון', 'للتواصل مع المعهد', 'Contact the institute'),
  demo: l('מצב הדגמה: התשובות אינן נשמרות.', 'وضع تجريبي: لا تُحفظ الإجابات.', 'Demo mode: answers are not saved.'),
};
const fill = (text: string, values: Record<string, number>) => text.replace(/\{(\w+)\}/g, (_, key) => String(values[key]));
const TOTAL = ASRS_ADULT_QUESTIONS.length;
const choice = (selected: boolean) => `min-h-[44px] px-4 py-2 rounded-lg border-2 transition text-sm font-medium ${selected ? 'bg-[#01696f] text-white border-[#01696f] shadow-md' : 'bg-white text-slate-700 border-slate-300 hover:border-[#01696f]'}`;
const field = 'w-full border border-slate-300 rounded-lg p-3 focus:outline-none focus:border-[#01696f] focus:ring-2 focus:ring-teal-100';

/** Adult self-report in Hebrew, Arabic or English. Drafts are saved every 30 seconds and on every step change. */
export default function AdultQuestionnaireForm({ token, name, initialLanguage, initialResponses = {}, initialIntroData = {}, initialFreeText = '' }: {
  token: string; name: string; initialLanguage: AdultLang; initialResponses?: Responses; initialIntroData?: Record<string, string>; initialFreeText?: string;
}) {
  const [language, setLanguage] = useState<AdultLang>(initialLanguage);
  const [responses, setResponses] = useState<Responses>(initialResponses);
  const [intro, setIntro] = useState<Record<string, string>>(initialIntroData);
  const [freeText, setFreeText] = useState(initialFreeText);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [submitting, setSubmitting] = useState(false), [submitted, setSubmitted] = useState(false), [error, setError] = useState<keyof typeof ui | null>(null);
  const answeredIn = (section: typeof SECTIONS[number], r = responses, i = intro) => section.part === 'intro'
    ? ASRS_ADULT_INTRO_FIELDS.every(f => !f.required || (i[f.id] ?? '').trim())
    : ASRS_ADULT_QUESTIONS.filter(q => q.id >= section.ids[0] && q.id <= section.ids[1]).every(q => r[String(q.id)] !== undefined);
  // Resume at the first step that still has something to answer.
  const [section, setSection] = useState(() => { const first = SECTIONS.findIndex(s => !answeredIn(s, initialResponses, initialIntroData)); return first < 0 ? SECTIONS.length - 1 : first; });
  const top = useRef<HTMLDivElement>(null), dirty = useRef(false), latest = useRef({ responses, intro, freeText, language });
  latest.current = { responses, intro, freeText, language };
  const t = (key: keyof typeof ui) => ui[key][language];
  const current = SECTIONS[section], questions = ASRS_ADULT_QUESTIONS.filter(q => q.id >= current.ids[0] && q.id <= current.ids[1]);
  const answered = ASRS_ADULT_QUESTIONS.filter(q => responses[String(q.id)] !== undefined).length;
  const allDone = SECTIONS.every(s => answeredIn(s)), last = section === SECTIONS.length - 1;

  useEffect(() => { document.documentElement.lang = language; document.documentElement.dir = language === 'en' ? 'ltr' : 'rtl'; }, [language]);

  const save = useCallback(async () => {
    if (!dirty.current) return;
    dirty.current = false; setSaveStatus('saving');
    const { responses, intro, freeText, language } = latest.current;
    try {
      const res = await fetch('/api/questionnaire/adult', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, responses, intro_data: intro, free_text: freeText, language }) });
      const body = await res.json().catch(() => ({}));
      if (body.already_submitted) { setSubmitted(true); return; }
      if (res.status === 403 && body.error === 'expired_token') setError('expired');
      if (!res.ok) throw new Error('save_failed');
      setSaveStatus('saved'); setTimeout(() => setSaveStatus(s => s === 'saved' ? 'idle' : s), 2000);
    } catch { dirty.current = true; setSaveStatus('error'); }
  }, [token]);
  useEffect(() => { if (submitted) return; const timer = setInterval(save, 30_000); return () => clearInterval(timer); }, [save, submitted]);
  useEffect(() => { if (!submitted) void save(); }, [section, submitted, save]);

  const touch = () => { dirty.current = true; setError(null); };
  const go = (to: number) => { setSection(to); setError(null); requestAnimationFrame(() => top.current?.scrollIntoView({ block: 'start' })); };

  async function submit() {
    if (!allDone) { setError('missing'); return; }
    setSubmitting(true); setError(null);
    try {
      const res = await fetch('/api/questionnaire/adult', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, responses, intro_data: intro, free_text: freeText, language }) });
      const body = await res.json().catch(() => ({}));
      if (res.status === 403 && body.error === 'expired_token') { setError('expired'); return; }
      if (!res.ok) throw new Error('submit_failed');
      dirty.current = false; setSubmitted(true);
    } catch { setError('submitError'); } finally { setSubmitting(false); }
  }

  const dir = language === 'en' ? 'ltr' : 'rtl', Forward = language === 'en' ? ChevronRight : ChevronLeft, Backward = language === 'en' ? ChevronLeft : ChevronRight;
  const languages = <div className="flex gap-1" role="group" aria-label="Language / שפה / اللغة">{(['ar', 'he', 'en'] as const).map(code =>
    <button key={code} type="button" aria-pressed={language === code} onClick={() => { setLanguage(code); dirty.current = true; }}
      className={`rounded-full border px-3 py-1 text-sm ${language === code ? 'bg-[#01696f] text-white border-[#01696f]' : 'bg-white text-slate-600 border-slate-300'}`}>{code === 'ar' ? 'العربية' : code === 'he' ? 'עברית' : 'EN'}</button>)}</div>;

  if (submitted) return <div className="max-w-2xl mx-auto px-4 py-12" dir={dir} lang={language}>
    <div className="card text-center">
      <CheckCircle2 className="text-green-600 mx-auto mb-4" size={56} aria-hidden="true" />
      <h1 className="text-2xl font-bold text-[#01696f] mb-3">{t('thanks')}</h1>
      <p className="text-slate-700 leading-relaxed mb-4">{t('thanksBody')}</p>
      <p className="text-sm text-slate-500 mb-6">{t('thanksNote')}</p>
      <div className="flex flex-wrap justify-center gap-3">
        {token !== 'demo' && <a className="btn-primary inline-block" href={`/onboarding/status/${encodeURIComponent(token)}`}>{t('status')}</a>}
        <a className="btn-ghost inline-block" href="https://wa.me/972544020043">{t('contact')}: <bdi dir="ltr">054-402-0043</bdi></a>
      </div>
    </div>
  </div>;

  return <div className="max-w-3xl mx-auto px-4 py-6" dir={dir} lang={language} ref={top}>
    <div className="card mb-6">
      <div className="flex flex-wrap justify-between items-start gap-3 mb-3">
        <div>
          <div className="text-sm text-orange-700 font-semibold mb-1">{t('eyebrow')}</div>
          <h1 className="text-2xl font-bold text-[#01696f]">{current.title[language]}</h1>
          <p className="text-sm text-slate-600 mt-1">{fill(t('step'), { n: section + 1, total: SECTIONS.length })}{name ? ` · ${name}` : ''}</p>
        </div>
        <div className="flex flex-col items-end gap-2">{languages}
          <span role="status" className={`text-sm font-medium min-h-[1.25rem] ${saveStatus === 'error' ? 'text-red-600' : saveStatus === 'saved' ? 'text-green-700' : 'text-slate-500'}`}>
            {saveStatus === 'saving' ? t('saving') : saveStatus === 'saved' ? t('saved') : saveStatus === 'error' ? t('saveError') : ''}</span></div>
      </div>
      <div className="bg-slate-100 rounded-full h-3 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={TOTAL} aria-valuenow={answered}>
        <div className="h-full bg-[#01696f] transition-all duration-500" style={{ width: `${(answered / TOTAL) * 100}%` }} /></div>
      <div className="text-xs text-slate-500 mt-2">{fill(t('answered'), { n: answered, total: TOTAL })}</div>
      {token === 'demo' && <p className="text-sm text-amber-800 mt-2">{t('demo')}</p>}
    </div>

    <div className="mb-6 rounded-xl border border-[#cfe3e5] bg-[#eef7f8] p-5"><p className="text-slate-700 leading-relaxed">{current.lead[language]}</p>
      {section === 0 && <p className="text-sm text-slate-500 mt-2">{t('resume')} {t('note')}</p>}</div>

    {current.part === 'intro'
      ? <div className="space-y-4 mb-6">{ASRS_ADULT_INTRO_FIELDS.map(f => <IntroRow key={f.id} field={f} language={language} required={t('required')} value={intro[f.id] ?? ''}
          onChange={value => { setIntro(previous => ({ ...previous, [f.id]: value })); touch(); }} />)}</div>
      : <div className="space-y-3 mb-6">{questions.map(q => {
          const value = responses[String(q.id)], labelId = `q${q.id}`;
          return <div key={q.id} className="card">
            <div className="flex gap-3 mb-3">
              <span className="bg-[#01696f] text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" aria-hidden="true">{q.id}</span>
              <p id={labelId} className="text-slate-800 leading-relaxed">{q.text[language]}</p>
            </div>
            <div className="flex flex-wrap gap-2 ms-10" role="radiogroup" aria-labelledby={labelId}>{adultScale(q.part).map(option =>
              <button key={option.value} type="button" role="radio" aria-checked={value === option.value} className={choice(value === option.value)}
                onClick={() => { setResponses(previous => ({ ...previous, [String(q.id)]: option.value })); touch(); }}>{option.label[language]}</button>)}</div>
          </div>;
        })}</div>}

    {current.part === 'A' && <p className="text-xs text-slate-500 mb-6" dir="ltr" lang="en">{ASRS_COPYRIGHT}</p>}

    {last && <div className="card mb-6"><label className="block">
      <span className="block font-semibold text-[#01696f] mb-3">{t('freeTitle')}</span>
      <textarea className={field} rows={4} maxLength={4000} value={freeText} onChange={event => { setFreeText(event.target.value); touch(); }} />
    </label></div>}

    {error && <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
      <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={20} aria-hidden="true" /><div className="text-red-800">{t(error)}</div></div>}

    <div className="flex justify-between gap-3">
      <button type="button" onClick={() => go(Math.max(0, section - 1))} disabled={section === 0} className="btn-ghost flex items-center gap-2 disabled:opacity-40"><Backward size={20} aria-hidden="true" /> {t('back')}</button>
      {last
        ? <button type="button" onClick={submit} disabled={submitting} className="btn-accent flex items-center gap-2 disabled:opacity-60"><CheckCircle2 size={20} aria-hidden="true" /> {t(submitting ? 'sending' : 'submit')}</button>
        : <button type="button" onClick={() => answeredIn(current) ? go(section + 1) : setError('missing')} className="btn-primary flex items-center gap-2">{t('next')} <Forward size={20} aria-hidden="true" /></button>}
    </div>
  </div>;
}

function IntroRow({ field: f, language, value, required, onChange }: { field: AdultIntroField; language: AdultLang; value: string; required: string; onChange: (value: string) => void }) {
  const id = `intro-${f.id}`;
  const label = <>{f.label[language]}{f.required && <span className="text-red-600 ms-1" title={required} aria-hidden="true">*</span>}</>;
  if (f.type === 'radio') return <div className="card">
    <p id={id} className="font-semibold text-slate-800 mb-3">{label}</p>
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={id} aria-required={f.required}>{f.options!.map(option =>
      <button key={option.value} type="button" role="radio" aria-checked={value === option.value} className={choice(value === option.value)} onClick={() => onChange(option.value)}>{option.label[language]}</button>)}</div>
  </div>;
  return <div className="card"><label htmlFor={id} className="block font-semibold text-slate-800 mb-3">{label}</label>
    {f.type === 'textarea'
      ? <textarea id={id} rows={3} maxLength={2000} required={f.required} className={field} value={value} onChange={event => onChange(event.target.value)} />
      : <input id={id} type="text" maxLength={200} required={f.required} className={field} value={value} onChange={event => onChange(event.target.value)} />}
  </div>;
}
