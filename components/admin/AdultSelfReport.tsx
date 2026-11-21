import { ASRS_ADULT_INTRO_FIELDS, ASRS_ADULT_QUESTIONS, ASRS_COPYRIGHT, adultScale, type AdultPart } from '@/questions/asrs_adult';
import { ADULT_SYMPTOM_THRESHOLD, adultResponsesComplete, scoreAdult, screenerShadeFrom } from '@/lib/adult-scoring';
import { DSM5_HYPERACTIVITY, DSM5_INATTENTION } from '@/lib/adhd/dsm5';

const BAND: Record<string, { label: string; tone: string }> = {
  high_positive: { label: 'חיובי גבוה (18–24)', tone: 'bg-red-100 text-red-800' },
  low_positive: { label: 'חיובי נמוך (14–17)', tone: 'bg-orange-100 text-orange-800' },
  high_negative: { label: 'שלילי גבוה (10–13)', tone: 'bg-yellow-100 text-yellow-800' },
  low_negative: { label: 'שלילי נמוך (0–9)', tone: 'bg-green-100 text-green-800' },
};
const PRESENTATION: Record<string, string> = {
  combined: 'שני הצירים מעל הסף (הצגה משולבת)', inattentive: 'ציר חוסר הקשב מעל הסף', hyperactive_impulsive: 'ציר ההיפראקטיביות/אימפולסיביות מעל הסף', none: 'אף ציר אינו מגיע לסף',
};
const LANGUAGE: Record<string, string> = { he: 'עברית', ar: 'ערבית', en: 'אנגלית' };
const dsmText = new Map<string, string>([...DSM5_INATTENTION, ...DSM5_HYPERACTIVITY].map(symptom => [symptom.code, symptom.he]));
const of = (part: AdultPart) => ASRS_ADULT_QUESTIONS.filter(question => question.part === part);

/** Staff view of the adult self-report: the screener result, the per-symptom picture and every answer. */
export default function AdultSelfReport({ questionnaire }: { questionnaire: any }) {
  const responses = (questionnaire?.responses ?? {}) as Record<string, number>, intro = (questionnaire?.intro_data ?? {}) as Record<string, string>;
  const submitted = questionnaire?.is_complete === true && adultResponsesComplete(responses);
  const answered = ASRS_ADULT_QUESTIONS.filter(question => typeof responses[String(question.id)] === 'number').length;
  const score = scoreAdult(responses), value = (id: number) => responses[String(id)];
  const label = (part: AdultPart, v: number | undefined) => v === undefined ? '—' : adultScale(part)[v]?.label.he ?? String(v);
  const Tile = ({ title, main, sub, tone }: { title: string; main: string; sub: string; tone?: string }) =>
    <div className="rounded-lg border border-slate-200 p-3"><div className="text-xs text-slate-500">{title}</div>
      <div className="mt-1 text-lg font-bold text-slate-800">{main}</div><div className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${tone ?? 'bg-slate-100 text-slate-700'}`}>{sub}</div></div>;

  return <div className="space-y-6">
    <section className="card" aria-labelledby="adult-summary">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="adult-summary" className="text-xl font-bold text-[#01696f]">סיכום שאלון ההערכה העצמית</h2>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{submitted && questionnaire.submitted_at ? `נשלח ${new Date(questionnaire.submitted_at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' })}` : `בתהליך מילוי · ${answered}/${ASRS_ADULT_QUESTIONS.length}`}{intro.language ? ` · מולא ב${LANGUAGE[intro.language] ?? intro.language}` : ''}</span>
      </div>
      {!submitted
        ? <p className="mt-3 text-sm text-slate-600">הסיכום יוצג לאחר שליחת השאלון. התשובות שנשמרו עד כה מופיעות למטה.</p>
        : <>
          <p className="mt-2 text-sm text-slate-500">אינדיקציה מדיווח עצמי בלבד, לשימוש הרופא. אינה אבחנה ואינה מחליפה ראיון קליני.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile title="סקרינר ASRS · כלל מקורי" main={`${score.screenerCount} מתוך 6`} sub={score.screenerPositive ? 'סינון חיובי (4 ומעלה)' : 'סינון שלילי (פחות מ־4)'} tone={score.screenerPositive ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'} />
            <Tile title="סקרינר ASRS · ציון 0–24" main={`${score.screenerSum} מתוך 24`} sub={BAND[score.screenerBand].label} tone={BAND[score.screenerBand].tone} />
            <Tile title={`חוסר קשב · סף ${ADULT_SYMPTOM_THRESHOLD}`} main={`${score.inattention} מתוך 9`} sub={score.inattentionMet ? 'מעל הסף' : 'מתחת לסף'} tone={score.inattentionMet ? 'bg-orange-100 text-orange-800' : undefined} />
            <Tile title={`היפראקטיביות/אימפולסיביות · סף ${ADULT_SYMPTOM_THRESHOLD}`} main={`${score.hyperactivity} מתוך 9`} sub={score.hyperactivityMet ? 'מעל הסף' : 'מתחת לסף'} tone={score.hyperactivityMet ? 'bg-orange-100 text-orange-800' : undefined} />
          </div>
          <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div><dt className="inline text-slate-500">תסמינים בדיווח עצמי: </dt><dd className="inline font-semibold">{PRESENTATION[score.presentation]}</dd></div>
            <div><dt className="inline text-slate-500">ילדות, לפני גיל 12: </dt><dd className="inline font-semibold">{score.childhoodOnset === 'likely' ? `דווחו קשיים (${score.childhoodCount} מתוך 4)` : score.childhoodOnset === 'unknown' ? 'אינו/ה זוכר/ת' : `לא דווחו קשיים מספיקים (${score.childhoodCount} מתוך 4)`}</dd></div>
            <div className="sm:col-span-2"><dt className="inline text-slate-500">פגיעה תפקודית בינונית ומעלה: </dt><dd className="inline font-semibold">{score.impairedDomains.length ? `${score.impairedDomains.length} תחומים · ${score.impairedDomains.map(id => ASRS_ADULT_QUESTIONS.find(q => q.id === id)!.text.he.replace(/ \(.*\)$/, '')).join(', ')}` : 'לא דווחה'}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-slate-500">תסמין נספר כאשר דורג „לעיתים תכופות” או „לעיתים תכופות מאוד”. פריטים 1–6 הם הסקרינר הרשמי ASRS-v1.1; פריטים 7–18 הם פריטים משלימים של המכון לפי DSM-5 ואינם סולם מתוקף.</p>
        </>}
    </section>

    <section className="card" aria-labelledby="adult-background">
      <h2 id="adult-background" className="mb-3 font-bold text-slate-800">פרטי רקע מהנבדק/ת</h2>
      <dl className="space-y-2 text-sm">{ASRS_ADULT_INTRO_FIELDS.map(field => {
        const raw = intro[field.id], shown = field.options?.find(option => option.value === raw)?.label.he ?? raw;
        return <div key={field.id}><dt className="text-slate-500">{field.label.he.replace(' (אופציונלי)', '')}</dt><dd className="whitespace-pre-wrap font-medium text-slate-800">{shown || '—'}</dd></div>;
      })}</dl>
      {questionnaire?.free_text && <div className="mt-3 border-t pt-3 text-sm"><div className="text-slate-500">הערות חופשיות</div><p className="whitespace-pre-wrap font-medium text-slate-800">{questionnaire.free_text}</p></div>}
    </section>

    <section id="questionnaires" className="card scroll-mt-6" aria-labelledby="adult-answers">
      <h2 id="adult-answers" className="mb-1 font-bold text-slate-800">תשובות השאלון</h2>

      <h3 className="mt-4 font-semibold text-[#01696f]">חלק א · סקרינר ASRS-v1.1</h3>
      <p className="mb-2 text-xs text-slate-500">התאים האפורים הם טווח הציון בטופס הרשמי. ההצללה אינה מוצגת לנבדק/ת.</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-sm">
        <thead><tr className="text-xs text-slate-500"><th className="p-2 text-right font-medium">פריט</th>{adultScale('A').map(option => <th key={option.value} className="w-20 p-2 text-center font-medium">{option.label.he}</th>)}</tr></thead>
        <tbody>{of('A').map(question => <tr key={question.id} className="border-t border-slate-100">
          <td className="p-2 text-slate-800"><span className="text-slate-400">{question.id}. </span>{question.text.he}</td>
          {adultScale('A').map(option => { const shaded = option.value >= screenerShadeFrom(question.id), chosen = value(question.id) === option.value;
            return <td key={option.value} className={`p-2 text-center ${shaded ? 'bg-slate-200' : ''}`}>{chosen ? <span className="font-bold text-[#01696f]" aria-label={`נבחר: ${option.label.he}${shaded ? ' (בטווח הציון)' : ''}`}>✕</span> : ''}</td>; })}
        </tr>)}</tbody>
      </table></div>
      <p className="mt-2 text-[11px] leading-snug text-slate-400" dir="ltr" lang="en">{ASRS_COPYRIGHT}</p>

      <h3 className="mt-6 mb-2 font-semibold text-[#01696f]">חלק ב · פריטים משלימים לפי DSM-5</h3>
      <ul className="divide-y divide-slate-100 text-sm">{of('B').map(question => { const v = value(question.id), present = (v ?? 0) >= 3;
        return <li key={question.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
          <span className="min-w-0 flex-1 text-slate-800"><span className="text-slate-400">{question.id}. </span>{question.text.he}<span className="block text-xs text-slate-400">{question.dsm} · {dsmText.get(question.dsm!)}</span></span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${present ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600'}`}>{label('B', v)}</span></li>; })}</ul>

      <h3 className="mt-6 mb-2 font-semibold text-[#01696f]">ילדות, לפני גיל 12</h3>
      <ul className="divide-y divide-slate-100 text-sm">{of('childhood').map(question => { const v = value(question.id);
        return <li key={question.id} className="flex flex-wrap items-start justify-between gap-2 py-2"><span className="min-w-0 flex-1 text-slate-800"><span className="text-slate-400">{question.id}. </span>{question.text.he}</span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${v === 1 || v === 2 ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600'}`}>{label('childhood', v)}</span></li>; })}</ul>

      <h3 className="mt-6 mb-2 font-semibold text-[#01696f]">השפעה על חיי היומיום</h3>
      <ul className="divide-y divide-slate-100 text-sm">{of('impairment').map(question => { const v = value(question.id);
        return <li key={question.id} className="flex flex-wrap items-start justify-between gap-2 py-2"><span className="min-w-0 flex-1 text-slate-800"><span className="text-slate-400">{question.id}. </span>{question.text.he.replace(/ \(.*\)$/, '')}</span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${(v ?? 0) >= 2 ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600'}`}>{label('impairment', v)}</span></li>; })}</ul>
    </section>
  </div>;
}
