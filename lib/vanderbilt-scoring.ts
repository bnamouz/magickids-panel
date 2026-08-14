/**
 * NICHQ Vanderbilt Assessment Scale — Scoring Engine
 *
 * The Vanderbilt scale is a validated ADHD screening tool with 55 items.
 * Symptom items (1-47) use a 0-3 scale where 2 or 3 counts as "symptomatic"
 * Performance items (48-55) use a 1-5 scale where 4 or 5 counts as "problematic"
 *
 * Subscales (parent form):
 *   Inattention: items 1-9 (need ≥6 items scored 2 or 3)
 *   Hyperactivity/Impulsivity: items 10-18 (need ≥6 items scored 2 or 3)
 *   ODD (Oppositional Defiant Disorder): items 19-26 (need ≥4 items scored 2 or 3)
 *   CD (Conduct Disorder): items 27-40 (need ≥3 items scored 2 or 3)
 *   Anxiety/Depression: items 41-47 (need ≥3 items scored 2 or 3)
 *   Performance (school/home function): items 48-55 (any 4 or 5 = problematic)
 */

export type VanderbiltResponses = Record<string, number>;

export interface SubscaleResult {
  key: string;
  labelHe: string;
  itemRange: [number, number];
  itemsScored: number[];
  symptomCount: number;
  totalScore: number;
  maxScore: number;
  threshold: number;
  meetsThreshold: boolean;
  interpretation: string;
}

export interface VanderbiltScore {
  respondent: 'parent' | 'teacher';
  subscales: SubscaleResult[];
  performance: {
    problematicItems: number[];
    totalProblematic: number;
    hasImpairment: boolean;
    interpretation: string;
  };
  presentation: 'inattentive' | 'hyperactive_impulsive' | 'combined' | 'none' | 'insufficient_data';
  presentationLabelHe: string;
  totalResponses: number;
  completeness: number; // percent
  flags: {
    inattentionMet: boolean;
    hyperactivityMet: boolean;
    oddMet: boolean;
    cdMet: boolean;
    anxietyDepressionMet: boolean;
    performanceImpaired: boolean;
  };
  clinicalSummary: string;
}

const SYMPTOM_THRESHOLD = 2; // 2 or 3 counts as symptomatic
const PERFORMANCE_THRESHOLD = 4; // 4 or 5 counts as problematic

const SUBSCALES_PARENT: Array<{
  key: string;
  labelHe: string;
  itemRange: [number, number];
  threshold: number;
}> = [
  { key: 'inattention', labelHe: 'תסמיני חוסר קשב', itemRange: [1, 9], threshold: 6 },
  { key: 'hyperactivity', labelHe: 'תסמיני היפראקטיביות/אימפולסיביות', itemRange: [10, 18], threshold: 6 },
  { key: 'odd', labelHe: 'הפרעת התנגדות מרדנית (ODD)', itemRange: [19, 26], threshold: 4 },
  { key: 'cd', labelHe: 'הפרעת התנהגות (CD)', itemRange: [27, 40], threshold: 3 },
  { key: 'anxiety_depression', labelHe: 'חרדה/דיכאון', itemRange: [41, 47], threshold: 3 },
];

const SUBSCALES_TEACHER: Array<{
  key: string;
  labelHe: string;
  itemRange: [number, number];
  threshold: number;
}> = [
  { key: 'inattention', labelHe: 'תסמיני חוסר קשב', itemRange: [1, 9], threshold: 6 },
  { key: 'hyperactivity', labelHe: 'תסמיני היפראקטיביות/אימפולסיביות', itemRange: [10, 18], threshold: 6 },
  { key: 'odd_cd', labelHe: 'הפרעת התנגדות/התנהגות (ODD/CD)', itemRange: [19, 28], threshold: 3 },
  { key: 'anxiety_depression', labelHe: 'חרדה/דיכאון', itemRange: [29, 35], threshold: 3 },
];

function getSubscaleConfig(respondent: 'parent' | 'teacher') {
  return respondent === 'parent' ? SUBSCALES_PARENT : SUBSCALES_TEACHER;
}

function getPerformanceRange(respondent: 'parent' | 'teacher'): [number, number] {
  return respondent === 'parent' ? [48, 55] : [36, 43];
}

function computeSubscale(
  responses: VanderbiltResponses,
  config: { key: string; labelHe: string; itemRange: [number, number]; threshold: number }
): SubscaleResult {
  const [start, end] = config.itemRange;
  const items: number[] = [];
  let symptomCount = 0;
  let totalScore = 0;

  for (let i = start; i <= end; i++) {
    const val = responses[String(i)];
    if (typeof val === 'number') {
      items.push(i);
      totalScore += val;
      if (val >= SYMPTOM_THRESHOLD) symptomCount++;
    }
  }

  const meetsThreshold = symptomCount >= config.threshold;
  const maxScore = (end - start + 1) * 3;

  let interpretation = '';
  if (meetsThreshold) {
    interpretation = `סף קליני עבר (${symptomCount} מתוך ${config.threshold} סימפטומים נדרשים ומעלה).`;
  } else if (symptomCount >= config.threshold - 2) {
    interpretation = `קרוב לסף הקליני (${symptomCount} סימפטומים, נדרשים ${config.threshold}).`;
  } else {
    interpretation = `אינו עומד בסף הקליני (${symptomCount} סימפטומים, נדרשים ${config.threshold}).`;
  }

  return {
    key: config.key,
    labelHe: config.labelHe,
    itemRange: config.itemRange,
    itemsScored: items,
    symptomCount,
    totalScore,
    maxScore,
    threshold: config.threshold,
    meetsThreshold,
    interpretation,
  };
}

function computePerformance(
  responses: VanderbiltResponses,
  respondent: 'parent' | 'teacher'
) {
  const [start, end] = getPerformanceRange(respondent);
  const problematicItems: number[] = [];

  for (let i = start; i <= end; i++) {
    const val = responses[String(i)];
    if (typeof val === 'number' && val >= PERFORMANCE_THRESHOLD) {
      problematicItems.push(i);
    }
  }

  const hasImpairment = problematicItems.length >= 1;
  let interpretation = '';
  if (hasImpairment) {
    interpretation = `זוהה פגיעה תפקודית ב-${problematicItems.length} תחומים (בית/ביה"ס).`;
  } else {
    interpretation = 'לא זוהתה פגיעה תפקודית משמעותית.';
  }

  return {
    problematicItems,
    totalProblematic: problematicItems.length,
    hasImpairment,
    interpretation,
  };
}

function determinePresentation(
  subscales: SubscaleResult[]
): { presentation: VanderbiltScore['presentation']; label: string } {
  const inattention = subscales.find((s) => s.key === 'inattention');
  const hyperactivity = subscales.find((s) => s.key === 'hyperactivity');

  const inMet = inattention?.meetsThreshold ?? false;
  const hyMet = hyperactivity?.meetsThreshold ?? false;

  if (!inattention || !hyperactivity) {
    return { presentation: 'insufficient_data', label: 'נתונים חסרים' };
  }

  if (inMet && hyMet) {
    return { presentation: 'combined', label: 'מעורב (חוסר קשב + היפראקטיביות)' };
  }
  if (inMet) {
    return { presentation: 'inattentive', label: 'חוסר קשב בעיקר' };
  }
  if (hyMet) {
    return { presentation: 'hyperactive_impulsive', label: 'היפראקטיביות/אימפולסיביות בעיקר' };
  }
  return { presentation: 'none', label: 'לא עומד בקריטריונים ל-ADHD' };
}

export function scoreVanderbilt(
  responses: VanderbiltResponses,
  respondent: 'parent' | 'teacher' = 'parent'
): VanderbiltScore {
  const config = getSubscaleConfig(respondent);
  const subscales = config.map((c) => computeSubscale(responses, c));
  const performance = computePerformance(responses, respondent);
  const { presentation, label } = determinePresentation(subscales);

  const totalResponses = Object.keys(responses).length;
  const expectedTotal = respondent === 'parent' ? 55 : 43;
  const completeness = Math.round((totalResponses / expectedTotal) * 100);

  const flags = {
    inattentionMet: subscales.find((s) => s.key === 'inattention')?.meetsThreshold ?? false,
    hyperactivityMet: subscales.find((s) => s.key === 'hyperactivity')?.meetsThreshold ?? false,
    oddMet:
      subscales.find((s) => s.key === 'odd')?.meetsThreshold ??
      subscales.find((s) => s.key === 'odd_cd')?.meetsThreshold ??
      false,
    cdMet: subscales.find((s) => s.key === 'cd')?.meetsThreshold ?? false,
    anxietyDepressionMet: subscales.find((s) => s.key === 'anxiety_depression')?.meetsThreshold ?? false,
    performanceImpaired: performance.hasImpairment,
  };

  // Build clinical summary text
  const parts: string[] = [];
  parts.push(`הצגה קלינית: ${label}.`);

  if (flags.inattentionMet || flags.hyperactivityMet) {
    parts.push('סימני ADHD זוהו לפי סף הקריטריונים הסטטיסטיים.');
  } else {
    parts.push('לא זוהו סימני ADHD ברמה קלינית בשאלון זה.');
  }

  if (flags.oddMet) parts.push('זוהו סימני התנגדות מרדנית.');
  if (flags.cdMet) parts.push('זוהו סימני הפרעת התנהגות — נדרשת התייחסות נוספת.');
  if (flags.anxietyDepressionMet) parts.push('זוהו סימני חרדה/דיכאון — נדרשת הערכה נוספת.');
  if (flags.performanceImpaired) {
    parts.push(`זוהתה פגיעה תפקודית ב-${performance.totalProblematic} תחומים.`);
  }

  const clinicalSummary = parts.join(' ');

  return {
    respondent,
    subscales,
    performance,
    presentation,
    presentationLabelHe: label,
    totalResponses,
    completeness,
    flags,
    clinicalSummary,
  };
}
