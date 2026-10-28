/**
 * DSM-5 ADHD criteria model used by the clinician's assessment form and the report generator.
 * Vanderbilt items 1–9 and 10–18 follow the DSM-5 symptom order, so questionnaire answers pre-fill criterion A.
 */
export type Presence = 'present' | 'absent' | 'unclear';
export type Severity = 'mild' | 'moderate' | 'severe';
export type Tri = 'yes' | 'no' | 'unknown';

export const DSM5_INATTENTION = [
  { code: 'A1a', vanderbilt: 1, he: 'אינו/ה שם/ה לב לפרטים או עושה טעויות רשלניות במטלות' },
  { code: 'A1b', vanderbilt: 2, he: 'מתקשה לשמור על קשב במשימות או במשחק' },
  { code: 'A1c', vanderbilt: 3, he: 'נראה/ית כמי שאינו/ה מקשיב/ה כשמדברים אליו/ה ישירות' },
  { code: 'A1d', vanderbilt: 4, he: 'אינו/ה ממלא/ת הוראות ואינו/ה מסיים/ת מטלות' },
  { code: 'A1e', vanderbilt: 5, he: 'מתקשה בארגון משימות ופעילויות' },
  { code: 'A1f', vanderbilt: 6, he: 'נמנע/ת ממשימות הדורשות מאמץ שכלי מתמשך' },
  { code: 'A1g', vanderbilt: 7, he: 'מאבד/ת חפצים הדרושים למשימות' },
  { code: 'A1h', vanderbilt: 8, he: 'מוסח/ת בקלות על ידי גירויים חיצוניים' },
  { code: 'A1i', vanderbilt: 9, he: 'שכחן/ית בפעילויות יומיומיות' },
] as const;

export const DSM5_HYPERACTIVITY = [
  { code: 'A2a', vanderbilt: 10, he: 'מתנועע/ת בחוסר שקט בידיים או ברגליים, מתפתל/ת בכיסא' },
  { code: 'A2b', vanderbilt: 11, he: 'קם/ה מהמקום במצבים שבהם מצופה לשבת' },
  { code: 'A2c', vanderbilt: 12, he: 'מתרוצץ/ת או מטפס/ת במצבים לא מתאימים (במתבגרים – חוסר מנוחה)' },
  { code: 'A2d', vanderbilt: 13, he: 'מתקשה לשחק או לעסוק בפעילות פנאי בשקט' },
  { code: 'A2e', vanderbilt: 14, he: '"בתנועה מתמדת", פועל/ת כאילו "מונע/ת על ידי מנוע"' },
  { code: 'A2f', vanderbilt: 15, he: 'מדבר/ת יתר על המידה' },
  { code: 'A2g', vanderbilt: 16, he: 'פולט/ת תשובה לפני שהשאלה הושלמה' },
  { code: 'A2h', vanderbilt: 17, he: 'מתקשה לחכות לתורו/ה' },
  { code: 'A2i', vanderbilt: 18, he: 'מפריע/ה או מתפרץ/ת לאחרים' },
] as const;

export const SETTINGS = [['home', 'בית'], ['school', 'בית ספר / גן'], ['social', 'חברתי'], ['other', 'אחר (חוגים, קהילה)']] as const;
export const IMPAIRMENT_DOMAINS = [['academic', 'לימודי'], ['social', 'חברתי'], ['family', 'משפחתי / ביתי'], ['emotional', 'רגשי / דימוי עצמי'], ['behavioral', 'התנהגותי / משמעתי'], ['daily', 'תפקוד יומיומי וארגון']] as const;
export const DIFFERENTIALS = [
  ['anxiety', 'הפרעת חרדה'], ['depression', 'דיכאון / הפרעת מצב רוח'], ['learning', 'לקות למידה'], ['language', 'עיכוב שפתי / תקשורתי'], ['asd', 'ספקטרום אוטיסטי'],
  ['odd_cd', 'הפרעת התנגדות / התנהגות'], ['sleep', 'הפרעת שינה'], ['hearing_vision', 'ליקוי שמיעה / ראייה'], ['thyroid', 'תת/יתר פעילות בלוטת התריס'],
  ['neuro', 'מצב נוירולוגי (אפילפסיה, טיקים, חבלת ראש)'], ['medication', 'השפעת תרופות / חומרים'], ['trauma', 'טראומה / גורמי דחק סביבתיים'], ['intellectual', 'תפקוד שכלי גבולי'],
] as const;
export const COMORBIDITIES = [['odd', 'ODD'], ['cd', 'הפרעת התנהגות'], ['anxiety', 'חרדה'], ['depression', 'דיכאון'], ['learning', 'לקות למידה'], ['language', 'לקות שפה'], ['tics', 'טיקים / טורט'], ['asd', 'ASD'], ['sleep', 'הפרעת שינה'], ['enuresis', 'הרטבה'], ['dcd', 'DCD / מוטוריקה']] as const;
export const PLAN_OPTIONS = [['parent_training', 'הדרכת הורים'], ['school_accommodations', 'התאמות והתערבות בבית הספר'], ['medication', 'טיפול תרופתי'], ['ot', 'ריפוי בעיסוק'], ['emotional', 'טיפול רגשי / CBT'], ['didactic', 'אבחון דידקטי / פסיכו-דידקטי'], ['moxo', 'מבחן ביצוע ממוחשב (MOXO)'], ['speech', 'קלינאות תקשורת'], ['neuro_referral', 'הפניה לנוירולוג / פסיכיאטר ילדים'], ['labs', 'בדיקות דם / שמיעה / ראייה'], ['follow_up', 'מעקב במרפאה']] as const;

export type ClinicalAssessment = {
  symptoms: Record<string, Presence>;                  // A1a…A2i → clinician's judgement
  onsetBefore12: Tri; onsetAge?: string; onsetNotes?: string;       // criterion B
  settings: string[]; settingsNotes?: string;                        // criterion C
  impairmentDomains: string[]; impairmentSeverity?: Severity | ''; impairmentFindings?: string; // criterion D
  differentialsExcluded: string[]; differentialNotes?: string; notBetterExplained: Tri;          // criterion E
  comorbidities: string[]; comorbidityNotes?: string;
  observation?: string;            // behaviour during the evaluation
  developmentalHistory?: string;   // pregnancy, birth, milestones
  medicalHistory?: string;         // illnesses, medications, allergies, sleep, appetite
  familyHistory?: string;
  schoolHistory?: string;
  physicalExam?: string;
  testsResults?: string;           // MOXO, hearing, vision, labs
  strengths?: string;
  severity?: Severity | '';
  conclusion: 'adhd' | 'not_met' | 'needs_more' | '';
  presentationOverride?: 'inattentive' | 'hyperactive_impulsive' | 'combined' | '';
  plan: string[]; medicationPlan?: string; planNotes?: string;
  updatedAt?: string;
};

export const emptyAssessment = (): ClinicalAssessment => ({ symptoms: {}, onsetBefore12: 'unknown', settings: [], impairmentDomains: [], impairmentSeverity: '', differentialsExcluded: [], notBetterExplained: 'unknown', comorbidities: [], severity: '', conclusion: '', presentationOverride: '', plan: [] });

export function normalizeAssessment(raw: unknown): ClinicalAssessment {
  const a = { ...emptyAssessment(), ...(raw && typeof raw === 'object' ? raw as Partial<ClinicalAssessment> : {}) };
  const arr = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 40) : [];
  const str = (v: unknown, max = 4000) => typeof v === 'string' ? v.slice(0, max) : undefined;
  const tri = (v: unknown): Tri => v === 'yes' || v === 'no' ? v : 'unknown';
  const symptoms: Record<string, Presence> = {};
  for (const s of [...DSM5_INATTENTION, ...DSM5_HYPERACTIVITY]) { const v = (a.symptoms ?? {})[s.code]; if (v === 'present' || v === 'absent' || v === 'unclear') symptoms[s.code] = v; }
  const sev = (v: unknown): Severity | '' => v === 'mild' || v === 'moderate' || v === 'severe' ? v : '';
  return {
    symptoms, onsetBefore12: tri(a.onsetBefore12), onsetAge: str(a.onsetAge, 40), onsetNotes: str(a.onsetNotes), settings: arr(a.settings), settingsNotes: str(a.settingsNotes),
    impairmentDomains: arr(a.impairmentDomains), impairmentSeverity: sev(a.impairmentSeverity), impairmentFindings: str(a.impairmentFindings), differentialsExcluded: arr(a.differentialsExcluded),
    differentialNotes: str(a.differentialNotes), notBetterExplained: tri(a.notBetterExplained), comorbidities: arr(a.comorbidities), comorbidityNotes: str(a.comorbidityNotes),
    observation: str(a.observation), developmentalHistory: str(a.developmentalHistory), medicalHistory: str(a.medicalHistory), familyHistory: str(a.familyHistory), schoolHistory: str(a.schoolHistory),
    physicalExam: str(a.physicalExam), testsResults: str(a.testsResults), strengths: str(a.strengths), severity: sev(a.severity),
    conclusion: a.conclusion === 'adhd' || a.conclusion === 'not_met' || a.conclusion === 'needs_more' ? a.conclusion : '',
    presentationOverride: a.presentationOverride === 'inattentive' || a.presentationOverride === 'hyperactive_impulsive' || a.presentationOverride === 'combined' ? a.presentationOverride : '',
    plan: arr(a.plan), medicationPlan: str(a.medicationPlan, 600), planNotes: str(a.planNotes), updatedAt: str(a.updatedAt, 40),
  };
}

export type QuestionnaireSources = { parent?: Record<string, number> | null; teacher?: Record<string, number> | null };

/** Questionnaire evidence per symptom (Vanderbilt 2–3 = "often / very often"). */
export function symptomEvidence(src: QuestionnaireSources) {
  const out: Record<string, { parent: number | null; teacher: number | null; parentPositive: boolean; teacherPositive: boolean }> = {};
  for (const s of [...DSM5_INATTENTION, ...DSM5_HYPERACTIVITY]) {
    const p = src.parent?.[String(s.vanderbilt)], t = src.teacher?.[String(s.vanderbilt)];
    const pv = typeof p === 'number' ? p : null, tv = typeof t === 'number' ? t : null;
    out[s.code] = { parent: pv, teacher: tv, parentPositive: (pv ?? 0) >= 2, teacherPositive: (tv ?? 0) >= 2 };
  }
  return out;
}

/** Effective presence: clinician's judgement wins; otherwise a symptom counts if either informant rates it often/very often. */
export function effectivePresence(code: string, a: ClinicalAssessment, ev: ReturnType<typeof symptomEvidence>): Presence {
  const j = a.symptoms[code]; if (j) return j;
  const e = ev[code]; if (!e) return 'unclear';
  if (e.parentPositive || e.teacherPositive) return 'present';
  if (e.parent === null && e.teacher === null) return 'unclear';
  return 'absent';
}

export function ageYears(birthDate: string | null | undefined, at = new Date()): number | null {
  if (!birthDate) return null; const b = new Date(birthDate); if (Number.isNaN(b.getTime())) return null;
  let y = at.getFullYear() - b.getFullYear(); const m = at.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < b.getDate())) y--; return y;
}

export type Dsm5Evaluation = {
  threshold: number; inattention: number; hyperactivity: number; inattentionMet: boolean; hyperactivityMet: boolean;
  criteriaA: boolean; criteriaB: Tri; criteriaC: boolean; criteriaD: boolean; criteriaE: Tri;
  presentation: 'inattentive' | 'hyperactive_impulsive' | 'combined' | 'none'; presentationHe: string; icd10: string | null;
  allMet: boolean; missing: string[];
};

export function evaluateDsm5(a: ClinicalAssessment, ev: ReturnType<typeof symptomEvidence>, age: number | null): Dsm5Evaluation {
  const threshold = age !== null && age >= 17 ? 5 : 6;
  const count = (list: readonly { code: string }[]) => list.filter((s) => effectivePresence(s.code, a, ev) === 'present').length;
  const inattention = count(DSM5_INATTENTION), hyperactivity = count(DSM5_HYPERACTIVITY);
  const inattentionMet = inattention >= threshold, hyperactivityMet = hyperactivity >= threshold;
  let presentation: Dsm5Evaluation['presentation'] = inattentionMet && hyperactivityMet ? 'combined' : inattentionMet ? 'inattentive' : hyperactivityMet ? 'hyperactive_impulsive' : 'none';
  if (a.presentationOverride) presentation = a.presentationOverride;
  const presentationHe = { combined: 'הצגה משולבת', inattentive: 'הצגה של חוסר קשב בעיקר', hyperactive_impulsive: 'הצגה של היפראקטיביות/אימפולסיביות בעיקר', none: 'אינו עומד בסף התסמינים' }[presentation];
  const icd10 = { combined: 'F90.2', inattentive: 'F90.0', hyperactive_impulsive: 'F90.1', none: null }[presentation];
  const criteriaA = inattentionMet || hyperactivityMet;
  const criteriaC = a.settings.length >= 2, criteriaD = a.impairmentDomains.length > 0 || Boolean(a.impairmentFindings?.trim());
  const missing: string[] = [];
  if (!criteriaA) missing.push(`קריטריון A – נדרשים לפחות ${threshold} תסמינים באחד הצירים (נמצאו ${inattention} / ${hyperactivity})`);
  if (a.onsetBefore12 !== 'yes') missing.push('קריטריון B – הופעת תסמינים לפני גיל 12 לא אושרה');
  if (!criteriaC) missing.push('קריטריון C – נדרשת נוכחות תסמינים בשתי מסגרות לפחות');
  if (!criteriaD) missing.push('קריטריון D – לא תועדה פגיעה תפקודית');
  if (a.notBetterExplained !== 'yes') missing.push('קריטריון E – לא אושר שהתסמינים אינם מוסברים טוב יותר על ידי הפרעה אחרת');
  return { threshold, inattention, hyperactivity, inattentionMet, hyperactivityMet, criteriaA, criteriaB: a.onsetBefore12, criteriaC, criteriaD, criteriaE: a.notBetterExplained, presentation, presentationHe, icd10, allMet: missing.length === 0, missing };
}

export const labelOf = (list: readonly (readonly [string, string])[], key: string) => list.find(([k]) => k === key)?.[1] ?? key;
export const SEVERITY_HE: Record<Severity, string> = { mild: 'קלה', moderate: 'בינונית', severe: 'חמורה' };
