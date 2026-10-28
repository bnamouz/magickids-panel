/**
 * Report Generator (prompt v2) — GPT-4o writes the narrative of a formal ADHD diagnostic report in the voice of a
 * diagnosing paediatrician. Inputs: Vanderbilt parent/teacher questionnaires (item level), the clinician's DSM-5
 * assessment captured during the evaluation, clinical notes and intake details. The DSM-5 arithmetic (symptom counts,
 * thresholds, presentation, ICD-10) is computed in code and handed to the model so it is never "guessed".
 */

import OpenAI from 'openai';
import type { VanderbiltScore } from './vanderbilt-scoring';
import {
  COMORBIDITIES, DIFFERENTIALS, DSM5_HYPERACTIVITY, DSM5_INATTENTION, IMPAIRMENT_DOMAINS, PLAN_OPTIONS, SETTINGS, SEVERITY_HE,
  ageYears, effectivePresence, evaluateDsm5, labelOf, symptomEvidence, type ClinicalAssessment, type Dsm5Evaluation,
} from './adhd/dsm5';

export const REPORT_PROMPT_VERSION = 'v2';
export const REPORT_MODEL = 'gpt-4o';

export interface ReportInput {
  patient: { firstName: string; lastName: string; birthDate: string | null; gender: string | null; grade: string | null; school: string | null; teacherName: string | null };
  parent: { fullName: string; relation: string | null; phone: string } | null;
  reasonForReferral: string | null;
  parentScore: VanderbiltScore | null;
  teacherScore: VanderbiltScore | null;
  /** Raw item responses (keys "1".."55") – used for the DSM-5 item-level table. */
  parentResponses?: Record<string, number> | null;
  teacherResponses?: Record<string, number> | null;
  parentIntro?: Record<string, unknown> | null;      // intro_data of the parent questionnaire (strengths, main_difficulty, medication_status…)
  parentFreeText?: string | null;
  teacherFreeText?: string | null;
  teacherRespondent?: { name: string | null; role: string | null } | null;
  clinicalNotes: Array<{ category: string; content: string }>;
  assessment?: ClinicalAssessment | null;
  additionalObservations?: string;
}

export type Dsm5CriterionRow = { criterion: 'A' | 'B' | 'C' | 'D' | 'E'; title: string; finding: string; status: 'met' | 'not_met' | 'partial' | 'unknown' };

export interface GeneratedReport {
  reportKind: 'full' | 'preliminary';
  background: string;
  sources: string;
  history: string;
  questionnaireFindings: string;
  observation: string;
  dsm5: Dsm5CriterionRow[];
  clinicalImpression: string;
  diagnosis: string;
  presentationAndSeverity: string;
  differential: string;
  recommendations: { parents: string[]; educational: string[]; medical: string[]; therapeutic: string[]; followUp: string };
  summary: string;
  disclaimers: string[];
}

const SCORE_HE = ['אף פעם (0)', 'לעיתים (1)', 'לעיתים קרובות (2)', 'לעיתים קרובות מאוד (3)'];
const GENDER_HE: Record<string, string> = { male: 'בן', female: 'בת', other: '' };
const CATEGORY_HE: Record<string, string> = { general: 'כללי', clinical: 'קליני', follow_up: 'מעקב', flag: 'דגל אדום' };
const MED_HE: Record<string, string> = { none: 'ללא טיפול תרופתי', past: 'טיפול תרופתי בעבר', current: 'טיפול תרופתי נוכחי', yes: 'כן', no: 'לא' };

function buildSystemPrompt(): string {
  return `אתה כותב בשמו של ד"ר בסים נמוז – רופא ילדים מומחה המאבחן הפרעות קשב וריכוז (ADHD) – דוח אבחון רפואי רשמי בעברית, המיועד להורים, לצוות החינוכי ולגורמי בריאות (קופת חולים, ועדות התאמות).

רמת הכתיבה: שפה רפואית־קלינית גבוהה, מדויקת ואמפתית, בגוף שלישי ("הילד/ה", "ההורים דיווחו", "בבדיקה נצפה"), ללא סלנג, ללא אימוג'ים, ללא נקודות תבליט בתוך פסקאות. כל טענה קלינית נשענת על נתון שסופק (שאלון, תצפית, אנמנזה). מספרים נכתבים בספרות.

כללים מחייבים:
1. אל תמציא עובדות, שמות, תאריכים, תרופות או ממצאים שלא סופקו. אם מידע חסר – כתוב במפורש שהוא לא נאסף/לא דווח, או השמט.
2. הכרעת DSM-5 (ספירת תסמינים, סף, הצגה קלינית, קוד ICD-10) מחושבת בקוד ומופיעה בקלט תחת "הערכת DSM-5 מחושבת". אל תשנה את המספרים. אם הרופא סימן מסקנה אבחונית – היא קובעת; נמק אותה לאור הנתונים.
3. כאשר אין הערכה קלינית של הרופא (קריטריונים B–E לא אושרו), הדוח הוא "סיכום ראשוני מבוסס שאלונים" ואסור לקבוע אבחנה סופית; יש לנסח את האבחנה כ"רושם/חשד" ולציין מה נדרש להשלמה.
4. אם קיים רק שאלון הורה, ציין שהמידע נשען על מקור יחיד וממליצים להשלים שאלון מורה.
5. התייחס לכל ממצא נלווה (ODD, הפרעת התנהגות, חרדה/דיכאון) ולאבחנה המבדלת שנבדקה.
6. ההמלצות: קונקרטיות ומנומקות במשפט אחד כל אחת (מה לעשות ולמה), מותאמות לגיל ולכיתה; להורים 5–8 המלצות, לצוות החינוכי 6–10 המלצות, רפואיות לפי התוכנית. לצוות החינוכי – התאמות מעשיות (ישיבה קרובה למורה, פיצול משימות, הארכת זמן, הפסקות תנועה, תקשורת שוטפת עם ההורים, מעקב התנהגותי). להורים – שגרה, חיזוקים חיוביים, הוראות קצרות, הדרכת הורים, שינה ומסכים. רפואי – לפי תוכנית הטיפול שסימן הרופא בלבד (אם סומן טיפול תרופתי: ציין שהתכשיר והמינון ייקבעו במפגש רפואי ושיידרש מעקב גדילה, דופק ולחץ דם; אל תמציא שם תכשיר שלא סופק).
7. אין לכלול בדוח כותרות Markdown או סימני עיצוב – טקסט רגיל בלבד. פסקאות מופרדות בשורה ריקה.
8. אל תקצר: כל שדה טקסט צריך להיות מפורט ברמה של דוח רפואי מלא, לא תקציר.
9. החזר JSON תקין בלבד, לפי הסכמה הבאה (כל השדות חובה; מערכים יכולים להיות ריקים רק אם אין מידע):

{
  "background": "פסקה: פרטי רקע (גיל, כיתה, מסגרת), מי פנה ומדוע, התלונה העיקרית כפי שדווחה.",
  "sources": "פסקה: מקורות המידע ושיטת האבחון – שאלוני NICHQ Vanderbilt (הורה/מורה, תאריכים אם סופקו), ראיון אנמנסטי, תצפית ובדיקה קלינית, בדיקות נוספות.",
  "history": "פסקה או שתיים: היסטוריה התפתחותית, רפואית, משפחתית ולימודית. אם לא נאסף – לציין בקצרה.",
  "questionnaireFindings": "2–3 פסקאות (150–250 מילים): ניתוח ממצאי השאלונים – כמות תסמיני חוסר קשב והיפראקטיביות/אימפולסיביות אצל כל מדווח, מידת ההסכמה בין הורה למורה, תת־סקאלות נלוות (ODD/CD/חרדה־דיכאון), ופריטי התפקוד.",
  "observation": "פסקה: תצפית קלינית במהלך האבחון ובדיקה גופנית/נוירולוגית, כפי שתועדו. אם לא תועדו – משפט שמציין זאת.",
  "dsm5": [
    {"criterion": "A", "title": "תסמינים", "finding": "משפט או שניים עם המספרים המחושבים", "status": "met|not_met|partial|unknown"},
    {"criterion": "B", "title": "הופעה לפני גיל 12", "finding": "...", "status": "..."},
    {"criterion": "C", "title": "נוכחות בשתי מסגרות לפחות", "finding": "...", "status": "..."},
    {"criterion": "D", "title": "פגיעה תפקודית", "finding": "...", "status": "..."},
    {"criterion": "E", "title": "שלילת הסבר חלופי", "finding": "...", "status": "..."}
  ],
  "clinicalImpression": "3 פסקאות (250–350 מילים, חובה): פסקה 1 – אינטגרציה של המקורות ומידת ההסכמה בין הורה למורה, תוך ציון התסמינים הבולטים בשמם; פסקה 2 – ההקשר ההתפתחותי, המשפחתי והלימודי והשפעת התסמינים על התפקוד בכל תחום; פסקה 3 – הנמקה קלינית למסקנה האבחונית וחוזקות הילד/ה שעליהן ניתן להישען.",
  "diagnosis": "שורה–שתיים: האבחנה הפורמלית, למשל 'הפרעת קשב וריכוז (ADHD), הצגה משולבת – ICD-10 F90.2' או 'רושם ראשוני לתסמיני קשב – נדרש השלמת הערכה'. כולל תחלואה נלווית אם אושרה.",
  "presentationAndSeverity": "פסקה קצרה: ההצגה הקלינית, דרגת החומרה (קלה/בינונית/חמורה) והנימוק.",
  "differential": "פסקה: אבחנה מבדלת שנבחנה, מה נשלל ומה נותר פתוח; תחלואה נלווית.",
  "recommendations": {
    "parents": ["המלצה להורים 1", "..."],
    "educational": ["המלצה לצוות החינוכי 1", "..."],
    "medical": ["המלצה רפואית/טיפולית 1", "..."],
    "therapeutic": ["טיפולים משלימים (ריפוי בעיסוק, טיפול רגשי, אבחון דידקטי) לפי תוכנית הרופא"],
    "followUp": "פסקה: מעקב – מועד, מה ייבדק, שאלוני מעקב."
  },
  "summary": "פסקת סיכום של 3–5 משפטים לקריאה מהירה.",
  "disclaimers": ["הערות מתודולוגיות חשובות – מקורות חסרים, תוקף הדוח, שימוש מיועד"]
}`;
}

function describeItems(list: readonly { code: string; vanderbilt: number; he: string }[], input: ReportInput, a: ClinicalAssessment | null, ev: ReturnType<typeof symptomEvidence>): string[] {
  return list.map((s) => {
    const e = ev[s.code];
    const p = e?.parent === null || e?.parent === undefined ? '—' : SCORE_HE[e.parent] ?? String(e.parent);
    const t = e?.teacher === null || e?.teacher === undefined ? '—' : SCORE_HE[e.teacher] ?? String(e.teacher);
    const judged = a?.symptoms[s.code];
    const eff = a ? effectivePresence(s.code, a, ev) : (e?.parentPositive || e?.teacherPositive ? 'present' : 'absent');
    const j = judged ? ` | שיקול דעת הרופא: ${judged === 'present' ? 'קיים' : judged === 'absent' ? 'לא קיים' : 'לא ברור'}` : '';
    return `  ${s.code} ${s.he}: הורה ${p} | מורה ${t}${j} → ${eff === 'present' ? 'נספר כתסמין' : eff === 'absent' ? 'לא נספר' : 'לא ברור'}`;
  });
}

function scoreBlock(title: string, score: VanderbiltScore, freeText?: string | null): string[] {
  const parts = [`\n# ${title}`, `מילוי: ${score.completeness}% מהשאלון`, `הצגה לפי השאלון: ${score.presentationLabelHe}`, 'תת-סקאלות:'];
  score.subscales.forEach((s) => parts.push(`  - ${s.labelHe}: ${s.symptomCount} תסמינים (סף ${s.threshold}) – ${s.meetsThreshold ? 'מעל הסף' : 'מתחת לסף'}; ציון כולל ${s.totalScore}/${s.maxScore}`));
  parts.push(`תפקוד: ${score.performance.interpretation}`);
  if (score.performance.problematicItems?.length) parts.push(`פריטי תפקוד בעייתיים (4–5): ${score.performance.problematicItems.join(', ')}`);
  if (freeText?.trim()) parts.push(`טקסט חופשי של המדווח: "${freeText.trim()}"`);
  return parts;
}

function assessmentBlock(a: ClinicalAssessment, evaluation: Dsm5Evaluation): string[] {
  const tri = (v: string) => v === 'yes' ? 'כן' : v === 'no' ? 'לא' : 'לא ידוע';
  const parts = ['\n# הערכה קלינית של הרופא (מולאה במהלך האבחון)'];
  parts.push(`קריטריון B – הופעה לפני גיל 12: ${tri(a.onsetBefore12)}${a.onsetAge ? `; גיל הופעה משוער: ${a.onsetAge}` : ''}${a.onsetNotes ? `; ${a.onsetNotes}` : ''}`);
  parts.push(`קריטריון C – מסגרות: ${a.settings.length ? a.settings.map((k) => labelOf(SETTINGS, k)).join(', ') : 'לא סומן'}${a.settingsNotes ? `; ${a.settingsNotes}` : ''}`);
  parts.push(`קריטריון D – תחומי פגיעה: ${a.impairmentDomains.length ? a.impairmentDomains.map((k) => labelOf(IMPAIRMENT_DOMAINS, k)).join(', ') : 'לא סומן'}${a.impairmentSeverity ? `; חומרת הפגיעה: ${SEVERITY_HE[a.impairmentSeverity]}` : ''}`);
  if (a.impairmentFindings) parts.push(`ממצאי הפגיעה התפקודית: ${a.impairmentFindings}`);
  parts.push(`קריטריון E – מצבים שנבדקו ונשללו: ${a.differentialsExcluded.length ? a.differentialsExcluded.map((k) => labelOf(DIFFERENTIALS, k)).join(', ') : 'לא סומן'}; התסמינים אינם מוסברים טוב יותר על ידי הפרעה אחרת: ${tri(a.notBetterExplained)}`);
  if (a.differentialNotes) parts.push(`הערות אבחנה מבדלת: ${a.differentialNotes}`);
  parts.push(`תחלואה נלווית: ${a.comorbidities.length ? a.comorbidities.map((k) => labelOf(COMORBIDITIES, k)).join(', ') : 'לא סומנה'}${a.comorbidityNotes ? `; ${a.comorbidityNotes}` : ''}`);
  const text = (label: string, v?: string) => { if (v?.trim()) parts.push(`${label}: ${v.trim()}`); };
  text('תצפית קלינית במהלך האבחון', a.observation);
  text('היסטוריה התפתחותית', a.developmentalHistory);
  text('היסטוריה רפואית', a.medicalHistory);
  text('היסטוריה משפחתית', a.familyHistory);
  text('תפקוד לימודי והיסטוריה בית-ספרית', a.schoolHistory);
  text('בדיקה גופנית ונוירולוגית', a.physicalExam);
  text('בדיקות ואבחונים נוספים', a.testsResults);
  text('חוזקות ומשאבים', a.strengths);
  parts.push(`מסקנת הרופא: ${a.conclusion === 'adhd' ? 'ADHD – עומד/ת בקריטריונים' : a.conclusion === 'not_met' ? 'אינו/ה עומד/ת בקריטריונים ל-ADHD' : a.conclusion === 'needs_more' ? 'נדרש מידע / הערכה נוספת' : 'לא סומנה'}`);
  if (a.presentationOverride) parts.push(`הצגה קלינית שקבע הרופא: ${evaluation.presentationHe}`);
  if (a.severity) parts.push(`חומרה כוללת: ${SEVERITY_HE[a.severity]}`);
  parts.push(`תוכנית טיפול שסומנה: ${a.plan.length ? a.plan.map((k) => labelOf(PLAN_OPTIONS, k)).join(', ') : 'לא סומנה'}`);
  text('פירוט טיפול תרופתי', a.medicationPlan);
  text('הערות הרופא לתוכנית ולדוח', a.planNotes);
  return parts;
}

export function buildUserPrompt(input: ReportInput): { prompt: string; evaluation: Dsm5Evaluation; reportKind: 'full' | 'preliminary' } {
  const age = ageYears(input.patient.birthDate);
  const ev = symptomEvidence({ parent: input.parentResponses ?? null, teacher: input.teacherResponses ?? null });
  const a = input.assessment ?? null;
  const evaluation = evaluateDsm5(a ?? { ...emptyLike(), symptoms: {} }, ev, age);
  const reportKind: 'full' | 'preliminary' = a && a.conclusion ? 'full' : 'preliminary';
  const parts: string[] = [];

  parts.push('# פרטי הילד/ה');
  parts.push(`שם: ${input.patient.firstName} ${input.patient.lastName}`);
  parts.push(`גיל: ${age === null ? 'לא צוין' : `${age} שנים`}`);
  parts.push(`מין: ${GENDER_HE[input.patient.gender || ''] || input.patient.gender || 'לא צוין'}`);
  parts.push(`כיתה: ${input.patient.grade || 'לא צוין'}`);
  parts.push(`בית ספר: ${input.patient.school || 'לא צוין'}`);
  if (input.patient.teacherName) parts.push(`מחנך/ת: ${input.patient.teacherName}`);
  if (input.parent) parts.push(`הורה מדווח: ${input.parent.fullName}${input.parent.relation ? ` (${input.parent.relation})` : ''}`);
  if (input.teacherRespondent?.name) parts.push(`מורה מדווח/ת: ${input.teacherRespondent.name}${input.teacherRespondent.role ? ` (${input.teacherRespondent.role})` : ''}`);

  parts.push('\n# סיבת ההפניה והתלונה העיקרית');
  parts.push(input.reasonForReferral || 'לא צוינה');
  const intro = input.parentIntro ?? {};
  const introStr = (k: string) => { const v = intro[k]; return typeof v === 'string' && v.trim() ? v.trim() : Array.isArray(v) ? v.join(', ') : null; };
  if (introStr('main_difficulty')) parts.push(`הקושי העיקרי לפי ההורה: ${introStr('main_difficulty')}`);
  if (introStr('strengths')) parts.push(`חוזקות הילד/ה לפי ההורה: ${introStr('strengths')}`);
  if (introStr('medication_status')) parts.push(`מצב תרופתי לפי ההורה: ${MED_HE[String(introStr('medication_status'))] ?? introStr('medication_status')}`);
  if (introStr('languages')) parts.push(`שפות בבית: ${introStr('languages')}`);
  if (introStr('marital_status')) parts.push(`מצב משפחתי: ${introStr('marital_status')}${introStr('marital_status_other') ? ` (${introStr('marital_status_other')})` : ''}`);

  if (input.parentScore) parts.push(...scoreBlock('שאלון הורה (NICHQ Vanderbilt)', input.parentScore, input.parentFreeText)); else parts.push('\n# שאלון הורה: לא מולא');
  if (input.teacherScore) parts.push(...scoreBlock('שאלון מורה (NICHQ Vanderbilt)', input.teacherScore, input.teacherFreeText)); else parts.push('\n# שאלון מורה: לא מולא');

  parts.push('\n# טבלת תסמיני DSM-5 (פריט-פריט; ציון 2–3 = תסמין)');
  parts.push('A1 חוסר קשב:'); parts.push(...describeItems(DSM5_INATTENTION, input, a, ev));
  parts.push('A2 היפראקטיביות/אימפולסיביות:'); parts.push(...describeItems(DSM5_HYPERACTIVITY, input, a, ev));

  parts.push('\n# הערכת DSM-5 מחושבת (אל תשנה מספרים אלה)');
  parts.push(`סף תסמינים לגיל: ${evaluation.threshold}`);
  parts.push(`חוסר קשב: ${evaluation.inattention}/9 – ${evaluation.inattentionMet ? 'עומד בסף' : 'מתחת לסף'}`);
  parts.push(`היפראקטיביות/אימפולסיביות: ${evaluation.hyperactivity}/9 – ${evaluation.hyperactivityMet ? 'עומד בסף' : 'מתחת לסף'}`);
  parts.push(`קריטריון A: ${evaluation.criteriaA ? 'מתקיים' : 'לא מתקיים'}; B: ${evaluation.criteriaB}; C: ${evaluation.criteriaC ? 'מתקיים' : 'לא מתקיים'}; D: ${evaluation.criteriaD ? 'מתקיים' : 'לא מתקיים'}; E: ${evaluation.criteriaE}`);
  parts.push(`הצגה קלינית: ${evaluation.presentationHe}${evaluation.icd10 ? ` (ICD-10 ${evaluation.icd10})` : ''}`);
  parts.push(evaluation.allMet ? 'כל הקריטריונים A–E מתקיימים.' : `קריטריונים חסרים: ${evaluation.missing.join('; ')}`);
  parts.push(`סוג הדוח: ${reportKind === 'full' ? 'דוח אבחון מלא (הרופא השלים הערכה קלינית וסימן מסקנה)' : 'סיכום ראשוני מבוסס שאלונים – הרופא טרם סימן מסקנה אבחונית; אין לקבוע אבחנה סופית'}`);

  if (a) parts.push(...assessmentBlock(a, evaluation)); else parts.push('\n# הערכה קלינית של הרופא: לא מולאה');

  if (input.clinicalNotes.length > 0) {
    parts.push('\n# הערות קליניות מתיק המטופל');
    input.clinicalNotes.forEach((n) => parts.push(`[${CATEGORY_HE[n.category] ?? n.category}] ${n.content}`));
  }
  if (input.additionalObservations) { parts.push('\n# תצפיות נוספות'); parts.push(input.additionalObservations); }

  parts.push('\n---\nכתוב כעת את הדוח המלא לפי הסכמה. JSON תקין בלבד.');
  return { prompt: parts.join('\n'), evaluation, reportKind };
}

function emptyLike(): ClinicalAssessment {
  return { symptoms: {}, onsetBefore12: 'unknown', settings: [], impairmentDomains: [], impairmentSeverity: '', differentialsExcluded: [], notBetterExplained: 'unknown', comorbidities: [], severity: '', conclusion: '', presentationOverride: '', plan: [] };
}

const asStr = (v: unknown) => typeof v === 'string' ? v.trim() : '';
const asArr = (v: unknown) => Array.isArray(v) ? v.map(asStr).filter(Boolean) : [];

/** Coerce the model output into the strict GeneratedReport shape (never trust the JSON blindly). */
export function normalizeGeneratedReport(raw: unknown, evaluation: Dsm5Evaluation, reportKind: 'full' | 'preliminary'): GeneratedReport {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rec = (r.recommendations && typeof r.recommendations === 'object' ? r.recommendations : {}) as Record<string, unknown>;
  const fallbackDsm5: Dsm5CriterionRow[] = [
    { criterion: 'A', title: 'תסמינים', finding: `חוסר קשב ${evaluation.inattention}/9, היפראקטיביות/אימפולסיביות ${evaluation.hyperactivity}/9 (סף ${evaluation.threshold}).`, status: evaluation.criteriaA ? 'met' : 'not_met' },
    { criterion: 'B', title: 'הופעה לפני גיל 12', finding: evaluation.criteriaB === 'yes' ? 'אושר באנמנזה.' : evaluation.criteriaB === 'no' ? 'לא אושר.' : 'לא נבדק / לא ידוע.', status: evaluation.criteriaB === 'yes' ? 'met' : evaluation.criteriaB === 'no' ? 'not_met' : 'unknown' },
    { criterion: 'C', title: 'נוכחות בשתי מסגרות לפחות', finding: evaluation.criteriaC ? 'תועד בשתי מסגרות לפחות.' : 'לא תועד בשתי מסגרות.', status: evaluation.criteriaC ? 'met' : 'unknown' },
    { criterion: 'D', title: 'פגיעה תפקודית', finding: evaluation.criteriaD ? 'תועדה פגיעה תפקודית.' : 'לא תועדה פגיעה תפקודית.', status: evaluation.criteriaD ? 'met' : 'unknown' },
    { criterion: 'E', title: 'שלילת הסבר חלופי', finding: evaluation.criteriaE === 'yes' ? 'התסמינים אינם מוסברים טוב יותר על ידי הפרעה אחרת.' : 'טרם נשלל הסבר חלופי.', status: evaluation.criteriaE === 'yes' ? 'met' : evaluation.criteriaE === 'no' ? 'not_met' : 'unknown' },
  ];
  const dsm5Raw = Array.isArray(r.dsm5) ? r.dsm5 as Record<string, unknown>[] : [];
  const dsm5 = fallbackDsm5.map((fb) => {
    const m = dsm5Raw.find((x) => asStr(x.criterion).toUpperCase() === fb.criterion);
    const st = asStr(m?.status);
    return { criterion: fb.criterion, title: asStr(m?.title) || fb.title, finding: asStr(m?.finding) || fb.finding, status: (['met', 'not_met', 'partial', 'unknown'].includes(st) ? st : fb.status) as Dsm5CriterionRow['status'] };
  });
  const out: GeneratedReport = {
    reportKind,
    background: asStr(r.background), sources: asStr(r.sources), history: asStr(r.history), questionnaireFindings: asStr(r.questionnaireFindings), observation: asStr(r.observation),
    dsm5, clinicalImpression: asStr(r.clinicalImpression), diagnosis: asStr(r.diagnosis), presentationAndSeverity: asStr(r.presentationAndSeverity), differential: asStr(r.differential),
    recommendations: { parents: asArr(rec.parents), educational: asArr(rec.educational), medical: asArr(rec.medical), therapeutic: asArr(rec.therapeutic), followUp: asStr(rec.followUp) },
    summary: asStr(r.summary), disclaimers: asArr(r.disclaimers),
  };
  if (!out.clinicalImpression || !out.diagnosis) throw new Error('OpenAI response missing required fields');
  if (reportKind === 'preliminary' && !out.disclaimers.some((d) => /ראשוני|שאלונ/.test(d))) out.disclaimers.unshift('דוח זה הוא סיכום ראשוני המבוסס על שאלוני Vanderbilt בלבד; אבחנה סופית של ADHD מחייבת השלמת הערכה קלינית של הרופא לפי קריטריוני DSM-5.');
  return out;
}

export async function generateReportContent(input: ReportInput): Promise<{ report: GeneratedReport; evaluation: Dsm5Evaluation; tokensIn: number | null; tokensOut: number | null }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
  const { prompt, evaluation, reportKind } = buildUserPrompt(input);
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: REPORT_MODEL,
    messages: [{ role: 'system', content: buildSystemPrompt() }, { role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.25,
    max_tokens: 6000,
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned empty response');
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch (e) { throw new Error(`Invalid JSON from OpenAI: ${(e as Error).message}`); }
  return { report: normalizeGeneratedReport(parsed, evaluation, reportKind), evaluation, tokensIn: completion.usage?.prompt_tokens ?? null, tokensOut: completion.usage?.completion_tokens ?? null };
}
