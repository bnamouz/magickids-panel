/**
 * Adult ADHD report (prompt adult-v1). Same pipeline as the child report: the DSM-5 arithmetic is computed in code,
 * GPT-4o writes the narrative, the PDF is laid out in lib/pdf-report.tsx. The inputs differ: one self-report
 * (questions/asrs_adult.ts) takes the place of the parent and teacher questionnaires, and the wording is for an adult.
 *
 * What the self-report can and cannot carry is stated to the model and printed in the report:
 *   – items 1–6 are the validated ASRS-v1.1 screener, a screening tool and not a diagnostic one;
 *   – items 7–18 are the institute's own supplement, not a validated scale;
 *   – it is a single informant, so without the physician's assessment the report is a preliminary summary.
 */
import { ASRS_ADULT_INTRO_FIELDS, ASRS_ADULT_QUESTIONS, ASRS_COPYRIGHT, adultScale, type AdultPart } from '@/questions/asrs_adult';
import { ADULT_SYMPTOM_THRESHOLD, scoreAdult, screenerShaded, type AdultScore } from './adult-scoring';
import {
  DSM5_HYPERACTIVITY, DSM5_INATTENTION, ageYears, effectivePresence, emptyAssessment, evaluateDsm5, selfReportEvidence, symptomText,
  type ClinicalAssessment, type Dsm5Evaluation,
} from './adhd/dsm5';
import { assessmentBlock, normalizeGeneratedReport, runReportModel, type GeneratedReport } from './report-generator';
import type { PdfAdultData, PdfSymptomRow } from './pdf-report';

export const ADULT_REPORT_PROMPT_VERSION = 'adult-v1';

export interface AdultReportInput {
  patient: { firstName: string; lastName: string; birthDate: string | null; gender: string | null };
  phone?: string | null;
  reasonForReferral: string | null;
  /** Item answers of the complete self-report, keys "1".."28". */
  responses: Record<string, number>;
  intro: Record<string, unknown> | null;
  freeText: string | null;
  submittedAt: string | null;
  clinicalNotes: Array<{ category: string; content: string }>;
  assessment: ClinicalAssessment | null;
}

const BAND_HE: Record<string, string> = { high_positive: 'חיובי גבוה (18–24)', low_positive: 'חיובי נמוך (14–17)', high_negative: 'שלילי גבוה (10–13)', low_negative: 'שלילי נמוך (0–9)' };
const GENDER_HE: Record<string, string> = { male: 'גבר', female: 'אישה' };
const LANGUAGE_HE: Record<string, string> = { he: 'עברית', ar: 'ערבית', en: 'אנגלית' };
const CATEGORY_HE: Record<string, string> = { general: 'כללי', clinical: 'קליני', follow_up: 'מעקב', flag: 'דגל אדום' };
const INTRO_SHORT: Record<string, string> = { occupation_status: 'עיסוק נוכחי', occupation: 'תחום העבודה או הלימודים', prior_adhd: 'אבחון קודם של הפרעת קשב', adhd_medication: 'טיפול תרופתי להפרעת קשב', family_adhd: 'הפרעת קשב במשפחה (דרגה ראשונה)' };

const of = (part: AdultPart) => ASRS_ADULT_QUESTIONS.filter(q => q.part === part);
const answerHe = (part: AdultPart, value: number | undefined | null) => typeof value === 'number' ? adultScale(part)[value]?.label.he ?? String(value) : 'לא נענה';
const fmtDate = (iso: string | null) => iso && Number.isFinite(Date.parse(iso)) ? new Date(iso).toLocaleDateString('he-IL-u-nu-latn', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric' }) : null;

/** Background answers as Hebrew label/value pairs (coded answers translated, free text as written). */
function introPairs(intro: Record<string, unknown> | null) {
  const text = (id: string) => { const v = intro?.[id]; return typeof v === 'string' && v.trim() ? v.trim() : null; };
  const coded = (id: string) => { const raw = text(id); return raw ? ASRS_ADULT_INTRO_FIELDS.find(f => f.id === id)?.options?.find(o => o.value === raw)?.label.he ?? raw : null; };
  return { text, coded };
}

/** Per-symptom evidence in the shape the clinician's form uses (0–3, "often" and above counts). */
export function adultEvidence(responses: Record<string, number>) {
  return selfReportEvidence(Object.fromEntries(ASRS_ADULT_QUESTIONS.filter(q => q.dsm).map(q => [q.dsm!, responses[String(q.id)]])));
}

/** DSM-5 evaluation of an adult file. An adult file is always scored with the adult threshold, also when the birth date is missing. */
export function evaluateAdult(responses: Record<string, number>, assessment: ClinicalAssessment | null, birthDate: string | null) {
  const evidence = adultEvidence(responses), age = ageYears(birthDate);
  return { evidence, age, evaluation: evaluateDsm5(assessment ?? emptyAssessment(), evidence, age === null || age < 17 ? 18 : age) };
}

/** Everything the PDF prints about the self-report, already in Hebrew. */
export function adultPdfData(input: Pick<AdultReportInput, 'responses' | 'intro' | 'submittedAt' | 'phone'>): PdfAdultData {
  const { responses, intro } = input, score = scoreAdult(responses), { text, coded } = introPairs(intro);
  const value = (id: number) => responses[String(id)];
  const field = text('occupation'), occupation = [coded('occupation_status'), field || null].filter(Boolean).join(' · ') || null;
  const background = (['prior_adhd', 'adhd_medication', 'family_adhd'] as const).map(id => ({ label: INTRO_SHORT[id], value: coded(id) ?? 'לא צוין' }));
  const language = text('language');
  return {
    occupation, phone: input.phone?.trim() || null, background, submittedAt: fmtDate(input.submittedAt), language: language ? LANGUAGE_HE[language] ?? null : null,
    screener: {
      count: score.screenerCount, positive: score.screenerPositive, sum: score.screenerSum, band: BAND_HE[score.screenerBand],
      items: of('A').map(q => ({ n: q.id, text: q.text.he, answer: answerHe('A', value(q.id)), shaded: screenerShaded(q.id, value(q.id) ?? 0) })),
    },
    axes: { inattention: score.inattention, hyperactivity: score.hyperactivity, threshold: ADULT_SYMPTOM_THRESHOLD, inattentionMet: score.inattentionMet, hyperactivityMet: score.hyperactivityMet },
    childhood: {
      summary: childhoodHe(score),
      items: of('childhood').map(q => ({ text: q.text.he, answer: answerHe('childhood', value(q.id)), flagged: value(q.id) === 1 || value(q.id) === 2 })),
    },
    impairment: of('impairment').map(q => ({ text: q.text.he.replace(/ \(.*\)$/, ''), answer: answerHe('impairment', value(q.id)), flagged: (value(q.id) ?? 0) >= 2 })),
    copyright: ASRS_COPYRIGHT,
  };
}

const childhoodHe = (score: AdultScore) => score.childhoodOnset === 'likely' ? `דווחו קשיים לפני גיל 12 (${score.childhoodCount} מתוך 4 היגדים)`
  : score.childhoodOnset === 'unknown' ? 'הנבדק/ת אינו/ה זוכר/ת את תקופת הילדות' : `לא דווחו קשיים מספיקים לפני גיל 12 (${score.childhoodCount} מתוך 4 היגדים)`;

/** Item-level criterion A table of the PDF: the self-report answer on its own 0–4 scale and the final judgement. */
export function adultSymptomRows(responses: Record<string, number>, assessment: ClinicalAssessment | null): { inattention: PdfSymptomRow[]; hyperactivity: PdfSymptomRow[] } {
  const evidence = adultEvidence(responses), a = assessment ?? emptyAssessment();
  const byCode = new Map(ASRS_ADULT_QUESTIONS.filter(q => q.dsm).map(q => [q.dsm!, responses[String(q.id)]]));
  const rows = (list: readonly { code: string; he: string }[]): PdfSymptomRow[] => list.map(s => {
    const v = byCode.get(s.code);
    return { code: s.code, text: symptomText(s, true), parent: typeof v === 'number' ? v : null, teacher: null, present: effectivePresence(s.code, a, evidence) };
  });
  return { inattention: rows(DSM5_INATTENTION), hyperactivity: rows(DSM5_HYPERACTIVITY) };
}

export function buildAdultSystemPrompt(): string {
  return `אתה כותב בשמו של ד"ר בסים נמוז – רופא מומחה המאבחן הפרעות קשב וריכוז (ADHD) – דוח אבחון רפואי רשמי בעברית עבור מבוגר/ת (גיל 18 ומעלה). הדוח מיועד לנבדק/ת עצמו/ה, לרופא/ה המטפל/ת ולקופת החולים, ולפי בחירת הנבדק/ת גם למקום העבודה או למוסד הלימודים לצורך התאמות.

רמת הכתיבה: שפה רפואית־קלינית גבוהה, מדויקת ומכבדת, בגוף שלישי ("הנבדק" או "הנבדקת" לפי המין שסופק; אם המין לא סופק – "הנבדק/ת"), ללא סלנג, ללא אימוג'ים, ללא נקודות תבליט בתוך פסקאות. אין לכתוב "הילד/ה", "ההורים" או "המורה" – זהו דוח של אדם בוגר. כל טענה קלינית נשענת על נתון שסופק (שאלון עצמי, אנמנזה, תצפית). מספרים נכתבים בספרות.

כללים מחייבים:
1. אל תמציא עובדות, שמות, תאריכים, תרופות או ממצאים שלא סופקו. אם מידע חסר – כתוב במפורש שהוא לא נאסף או לא דווח, או השמט.
2. הכרעת DSM-5 (ספירת תסמינים, סף 5 מתוך 9 למבוגרים, הצגה קלינית, קוד ICD-10) מחושבת בקוד ומופיעה בקלט תחת "הערכת DSM-5 מחושבת". אל תשנה את המספרים. אם הרופא סימן מסקנה אבחונית – היא קובעת; נמק אותה לאור הנתונים.
3. כאשר אין הערכה קלינית של הרופא עם מסקנה (קריטריונים B–E לא אושרו), הדוח הוא "סיכום ראשוני מבוסס דיווח עצמי" ואסור לקבוע אבחנה סופית; יש לנסח את האבחנה כ"רושם ראשוני" או "חשד" ולציין מה נדרש להשלמה. תשובות הנבדק/ת על הילדות ועל הפגיעה התפקודית הן מידע תומך בלבד; הן אינן מאשרות לבדן את קריטריונים B, C ו-D.
4. מקור המידע בשאלון הוא יחיד – דיווח עצמי. ציין זאת, וכאשר הופעת התסמינים בילדות לא אומתה ממקור נוסף, המלץ על מידע משלים (הורה או בן/בת זוג, תעודות בית ספר, אבחונים קודמים).
5. תאר נכון את הכלי: פריטים 1–6 הם סקרינר ASRS-v1.1 של ארגון הבריאות העולמי – כלי סינון מתוקף, שאינו כלי אבחוני. פריטים 7–18 הם פריטים משלימים שנוסחו במכון לפי תסמיני DSM-5 ואינם סולם מתוקף. אל תכנה את השאלון כולו "ASRS" ואל תציג את ספירת 18 הפריטים כציון של סולם מתוקף.
6. טקסט חופשי של הנבדק/ת עשוי להיות כתוב בערבית או באנגלית. מסור את תוכנו בעברית, בלי לצטט בשפה אחרת ובלי להוסיף עליו.
7. אבחנה מבדלת ותחלואה נלווית במבוגרים (חרדה, דיכאון, הפרעה דו־קוטבית, הפרעות שינה, שימוש בחומרים או באלכוהול, מצבים רפואיים ותרופות): התייחס רק למה שנבדק או דווח. מה שלא נבדק – כתוב שטרם נשלל.
8. ההמלצות: קונקרטיות ומנומקות במשפט אחד כל אחת (מה לעשות ולמה), מותאמות לעיסוק שדווח. לנבדק/ת 5–8 המלצות (ניהול זמן ומשימות, עזרים חיצוניים ותזכורות, פירוק משימות, צמצום מסיחים, שינה, פעילות גופנית). לעבודה או ללימודים 4–8 התאמות מעשיות לפי העיסוק שדווח (סביבת עבודה שקטה, הנחיות כתובות, חלוקת מטלות לשלבים עם מועדים, הפסקות קצרות; לסטודנטים – הארכת זמן ותנאי היבחנות). רפואי – לפי תוכנית הטיפול שסימן הרופא בלבד; אם סומן טיפול תרופתי: ציין שהתכשיר והמינון ייקבעו במפגש רפואי, שתיבדק היסטוריה לבבית ושיידרש מעקב לחץ דם, דופק, שינה ותיאבון; אל תמציא שם תכשיר או מינון שלא סופקו. טיפולים משלימים – לפי התוכנית שסומנה; בסיכום ראשוני נסח אותם כאפשרויות שיישקלו לאחר השלמת האבחון.
9. אין לכלול בדוח כותרות Markdown או סימני עיצוב – טקסט רגיל בלבד. פסקאות מופרדות בשורה ריקה.
10. אל תקצר: כל שדה טקסט צריך להיות מפורט ברמה של דוח רפואי מלא, לא תקציר.
11. החזר JSON תקין בלבד, לפי הסכמה הבאה (כל השדות חובה; מערכים יכולים להיות ריקים רק אם אין מידע):

{
  "background": "פסקה: פרטי רקע (גיל, עיסוק), מדוע פנה/תה לאבחון כעת והקושי העיקרי כפי שדווח.",
  "sources": "פסקה: מקורות המידע ושיטת האבחון – שאלון הערכה עצמית למבוגרים (סקרינר ASRS-v1.1 ופריטים משלימים של המכון, מועד המילוי אם סופק), ראיון אנמנסטי, תצפית ובדיקה קלינית, בדיקות נוספות – רק מה שאכן בוצע.",
  "history": "פסקה או שתיים: תסמינים בילדות כפי שדווחו, היסטוריה לימודית ותעסוקתית, רפואית ומשפחתית, אבחון וטיפול קודמים. אם לא נאסף – לציין בקצרה.",
  "questionnaireFindings": "2–3 פסקאות (150–250 מילים): תוצאת הסקרינר בשתי שיטות הציון, מספר התסמינים בכל ציר ביחס לסף 5, התסמינים הבולטים בשמם, הדיווח על הילדות ותחומי הפגיעה התפקודית.",
  "observation": "פסקה: תצפית קלינית במהלך האבחון ובדיקה גופנית/נוירולוגית, כפי שתועדו. אם לא תועדו – משפט שמציין זאת.",
  "dsm5": [
    {"criterion": "A", "title": "תסמינים", "finding": "משפט או שניים עם המספרים המחושבים", "status": "met|not_met|partial|unknown"},
    {"criterion": "B", "title": "הופעה לפני גיל 12", "finding": "...", "status": "..."},
    {"criterion": "C", "title": "נוכחות בשתי מסגרות לפחות", "finding": "...", "status": "..."},
    {"criterion": "D", "title": "פגיעה תפקודית", "finding": "...", "status": "..."},
    {"criterion": "E", "title": "שלילת הסבר חלופי", "finding": "...", "status": "..."}
  ],
  "clinicalImpression": "3 פסקאות (250–350 מילים, חובה): פסקה 1 – אינטגרציה של הדיווח העצמי עם ממצאי הרופא, תוך ציון התסמינים הבולטים בשמם; פסקה 2 – הרצף מהילדות לבגרות והשפעת התסמינים על העבודה או הלימודים, על ניהול הבית ועל היחסים; פסקה 3 – הנמקה קלינית למסקנה וחוזקות הנבדק/ת שעליהן ניתן להישען.",
  "diagnosis": "שורה–שתיים: האבחנה הפורמלית, למשל 'הפרעת קשב וריכוז (ADHD) במבוגר, הצגה משולבת – ICD-10 F90.2' או 'רושם ראשוני לתסמיני קשב – נדרשת השלמת הערכה קלינית'. כולל תחלואה נלווית אם אושרה.",
  "presentationAndSeverity": "פסקה קצרה: ההצגה הקלינית, דרגת החומרה (קלה/בינונית/חמורה) והנימוק.",
  "differential": "פסקה: אבחנה מבדלת שנבחנה, מה נשלל ומה נותר פתוח; תחלואה נלווית.",
  "recommendations": {
    "personal": ["המלצה לנבדק/ת 1", "..."],
    "workStudy": ["התאמה בעבודה או בלימודים 1", "..."],
    "medical": ["המלצה רפואית 1", "..."],
    "therapeutic": ["טיפולים משלימים לפי תוכנית הרופא"],
    "followUp": "פסקה: מעקב – מועד, מה ייבדק."
  },
  "summary": "פסקת סיכום של 3–5 משפטים לקריאה מהירה.",
  "disclaimers": ["הערות מתודולוגיות חשובות – מקור מידע יחיד, מגבלות הכלי, מקורות חסרים, שימוש מיועד"]
}`;
}

export function buildAdultUserPrompt(input: AdultReportInput): { prompt: string; evaluation: Dsm5Evaluation; reportKind: 'full' | 'preliminary'; score: AdultScore } {
  const { responses } = input, a = input.assessment ?? null, score = scoreAdult(responses);
  const { evidence, age, evaluation } = evaluateAdult(responses, a, input.patient.birthDate);
  const reportKind: 'full' | 'preliminary' = a && a.conclusion ? 'full' : 'preliminary';
  const { text, coded } = introPairs(input.intro), value = (id: number) => responses[String(id)];
  const parts: string[] = [];

  parts.push('# פרטי הנבדק/ת');
  parts.push(`שם: ${input.patient.firstName} ${input.patient.lastName}`.trim());
  parts.push(`גיל: ${age === null ? 'לא צוין' : `${age} שנים`}`);
  parts.push(`מין: ${GENDER_HE[input.patient.gender || ''] || 'לא צוין'}`);
  parts.push(`עיסוק נוכחי: ${coded('occupation_status') ?? 'לא צוין'}${text('occupation') ? ` – ${text('occupation')}` : ''}`);

  parts.push('\n# סיבת הפנייה והקושי העיקרי (בלשון הנבדק/ת)');
  parts.push(text('main_difficulty') || input.reasonForReferral || 'לא צוינה');
  if (text('main_difficulty') && input.reasonForReferral && input.reasonForReferral.trim() !== text('main_difficulty')) parts.push(`סיבת הפנייה שנרשמה בפתיחת התיק: ${input.reasonForReferral.trim()}`);

  parts.push('\n# רקע שדווח בשאלון');
  for (const id of ['prior_adhd', 'adhd_medication', 'family_adhd'] as const) parts.push(`${INTRO_SHORT[id]}: ${coded(id) ?? 'לא צוין'}`);
  parts.push(`מחלות רקע, אבחנות נפשיות, שינה ותרופות קבועות: ${text('health') ?? 'לא דווח'}`);

  parts.push(`\n# שאלון הערכה עצמית למבוגרים${fmtDate(input.submittedAt) ? ` (מולא ב-${fmtDate(input.submittedAt)})` : ''}`);
  if (text('language')) parts.push(`שפת המילוי: ${LANGUAGE_HE[text('language')!] ?? text('language')}`);
  parts.push('חלק א – סקרינר ASRS-v1.1 (פריטים 1–6, כלי סינון מתוקף):');
  parts.push(`  כלל הציון המקורי: ${score.screenerCount} מתוך 6 פריטים בטווח המסומן – ${score.screenerPositive ? 'סינון חיובי (4 ומעלה)' : 'סינון שלילי (פחות מ-4)'}`);
  parts.push(`  ציון סכום (עדכון 2024): ${score.screenerSum} מתוך 24 – ${BAND_HE[score.screenerBand]}; סף חיובי 14`);
  of('A').forEach(q => parts.push(`  ${q.id}. ${q.text.he} → ${answerHe('A', value(q.id))}${screenerShaded(q.id, value(q.id) ?? 0) ? ' (בטווח המסומן)' : ''}`));

  parts.push('\n# טבלת תסמיני DSM-5 לפי הדיווח העצמי ("לעיתים תכופות" או "לעיתים תכופות מאוד" = תסמין)');
  parts.push('המקור לכל תסמין: פריט הסקרינר (1–6) או פריט משלים של המכון (7–18), שאינו סולם מתוקף.');
  const byCode = new Map(ASRS_ADULT_QUESTIONS.filter(q => q.dsm).map(q => [q.dsm!, q]));
  const describe = (list: readonly { code: string; he: string }[]) => list.map(s => {
    const q = byCode.get(s.code)!, judged = a?.symptoms[s.code], eff = effectivePresence(s.code, a ?? emptyAssessment(), evidence);
    const j = judged ? ` | שיקול דעת הרופא: ${judged === 'present' ? 'קיים' : judged === 'absent' ? 'לא קיים' : 'לא ברור'}` : '';
    return `  ${s.code} ${symptomText(s, true)}: דיווח עצמי – ${answerHe(q.part, value(q.id))} (פריט ${q.id}, ${q.part === 'A' ? 'סקרינר' : 'משלים'})${j} → ${eff === 'present' ? 'נספר כתסמין' : eff === 'absent' ? 'לא נספר' : 'לא ברור'}`;
  });
  parts.push('A1 חוסר קשב:', ...describe(DSM5_INATTENTION));
  parts.push('A2 היפראקטיביות/אימפולסיביות:', ...describe(DSM5_HYPERACTIVITY));

  parts.push('\n# ילדות, לפני גיל 12 (דיווח עצמי – מידע תומך לקריטריון B)');
  of('childhood').forEach(q => parts.push(`  ${q.text.he} → ${answerHe('childhood', value(q.id))}`));
  parts.push(`  סיכום: ${childhoodHe(score)}`);

  parts.push('\n# פגיעה תפקודית בששת החודשים האחרונים (דיווח עצמי – מידע תומך לקריטריונים C ו-D)');
  of('impairment').forEach(q => parts.push(`  ${q.text.he.replace(/ \(.*\)$/, '')} → ${answerHe('impairment', value(q.id))}`));
  parts.push(`  תחומים בדרגה בינונית ומעלה: ${score.impairedDomains.length}`);
  if (input.freeText?.trim()) parts.push(`\n# הערות חופשיות של הנבדק/ת\n"${input.freeText.trim()}"`);

  parts.push('\n# הערכת DSM-5 מחושבת (אל תשנה מספרים אלה)');
  parts.push(`סף תסמינים למבוגרים: ${evaluation.threshold}`);
  parts.push(`חוסר קשב: ${evaluation.inattention}/9 – ${evaluation.inattentionMet ? 'עומד בסף' : 'מתחת לסף'}`);
  parts.push(`היפראקטיביות/אימפולסיביות: ${evaluation.hyperactivity}/9 – ${evaluation.hyperactivityMet ? 'עומד בסף' : 'מתחת לסף'}`);
  parts.push(`קריטריון A: ${evaluation.criteriaA ? 'מתקיים' : 'לא מתקיים'}; B: ${evaluation.criteriaB}; C: ${evaluation.criteriaC ? 'מתקיים' : 'לא מתקיים'}; D: ${evaluation.criteriaD ? 'מתקיים' : 'לא מתקיים'}; E: ${evaluation.criteriaE}`);
  parts.push('קריטריונים B–E נקבעים רק לפי ההערכה הקלינית של הרופא, לא לפי הדיווח העצמי.');
  parts.push(`הצגה קלינית: ${evaluation.presentationHe}${evaluation.icd10 ? ` (ICD-10 ${evaluation.icd10})` : ''}`);
  parts.push(evaluation.allMet ? 'כל הקריטריונים A–E מתקיימים.' : `קריטריונים חסרים: ${evaluation.missing.join('; ')}`);
  parts.push(`סוג הדוח: ${reportKind === 'full' ? 'דוח אבחון מלא (הרופא השלים הערכה קלינית וסימן מסקנה)' : 'סיכום ראשוני מבוסס דיווח עצמי – הרופא טרם סימן מסקנה אבחונית; אין לקבוע אבחנה סופית'}`);

  if (a) parts.push(...assessmentBlock(a, evaluation, true)); else parts.push('\n# הערכה קלינית של הרופא: לא מולאה');

  if (input.clinicalNotes.length > 0) {
    parts.push('\n# הערות קליניות מהתיק');
    input.clinicalNotes.forEach(n => parts.push(`[${CATEGORY_HE[n.category] ?? n.category}] ${n.content}`));
  }
  parts.push('\n---\nכתוב כעת את הדוח המלא לפי הסכמה. JSON תקין בלבד.');
  return { prompt: parts.join('\n'), evaluation, reportKind, score };
}

export async function generateAdultReportContent(input: AdultReportInput): Promise<{ report: GeneratedReport; evaluation: Dsm5Evaluation; score: AdultScore; tokensIn: number | null; tokensOut: number | null }> {
  const { prompt, evaluation, reportKind, score } = buildAdultUserPrompt(input);
  const { parsed, tokensIn, tokensOut } = await runReportModel(buildAdultSystemPrompt(), prompt);
  return { report: normalizeGeneratedReport(parsed, evaluation, reportKind, 'adult'), evaluation, score, tokensIn, tokensOut };
}
