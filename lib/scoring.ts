/**
 * Vanderbilt Scoring Engine – DSM-5 aligned
 * מנוע ניקוד לוונדרבילט הורה ומורה
 */

import { VANDERBILT_PARENT_QUESTIONS } from '@/questions/vanderbilt_parent';
import { VANDERBILT_TEACHER_QUESTIONS } from '@/questions/vanderbilt_teacher';
import type { VanderbiltQuestion, SymptomCategory } from '@/questions/vanderbilt_parent';

export type Responses = Record<number, number>;

export interface CategoryResult {
  category: SymptomCategory;
  itemsTotal: number;
  itemsPositive: number;     // items rated ≥2 in scale A, or ≥4 in scale B
  threshold: number;
  positive: boolean;
}

export interface FormScore {
  scope: 'parent' | 'teacher';
  byCategory: Record<SymptomCategory, CategoryResult>;
  hasImpairment: boolean;
  raw: Record<SymptomCategory, number>;
}

export interface CombinedProfile {
  presentation:
    | 'ADHD-Combined'
    | 'ADHD-Inattentive'
    | 'ADHD-Hyperactive-Impulsive'
    | 'Subthreshold'
    | 'Inconclusive';
  confidence: number;        // 0..1
  flags: {
    inattention_parent: boolean;
    inattention_teacher: boolean;
    hyperactivity_parent: boolean;
    hyperactivity_teacher: boolean;
    odd_parent: boolean;
    odd_teacher: boolean;
    cd_parent: boolean;
    anxiety_parent: boolean;
    anxiety_teacher: boolean;
    impairment_parent: boolean;
    impairment_teacher: boolean;
    cross_rater_disagreement: boolean;
  };
  alerts: string[];
  parentScore: FormScore;
  teacherScore: FormScore;
}

// DSM-5 thresholds (Vanderbilt)
const THRESHOLDS: Record<SymptomCategory, number> = {
  inattention:  6,
  hyperactivity: 6,
  odd:          4,
  cd:           3,
  anxiety_dep:  3,
  function:     1,  // ≥1 item rated 4-5 = impairment
};

const TEACHER_THRESHOLDS: Record<SymptomCategory, number> = {
  inattention:  6,
  hyperactivity: 6,
  odd:          3,  // combined ODD/CD on teacher
  cd:           3,
  anxiety_dep:  3,
  function:     1,
};

function scoreForm(
  responses: Responses,
  questions: VanderbiltQuestion[],
  thresholds: Record<SymptomCategory, number>,
  scope: 'parent' | 'teacher',
): FormScore {
  const byCat: Record<SymptomCategory, CategoryResult> = {} as any;
  const raw: Record<SymptomCategory, number> = {} as any;

  const categories: SymptomCategory[] = ['inattention','hyperactivity','odd','cd','anxiety_dep','function'];

  categories.forEach(cat => {
    const items = questions.filter(q => q.category === cat);
    let positiveCount = 0;
    items.forEach(q => {
      const val = responses[q.id];
      if (val === undefined) return;
      if (q.section === 'A' && val >= 2) positiveCount++;
      if (q.section === 'B' && val >= 4) positiveCount++;
    });
    byCat[cat] = {
      category: cat,
      itemsTotal: items.length,
      itemsPositive: positiveCount,
      threshold: thresholds[cat],
      positive: positiveCount >= thresholds[cat],
    };
    raw[cat] = positiveCount;
  });

  return {
    scope,
    byCategory: byCat,
    hasImpairment: byCat.function.positive,
    raw,
  };
}

export function scoreParent(responses: Responses): FormScore {
  return scoreForm(responses, VANDERBILT_PARENT_QUESTIONS, THRESHOLDS, 'parent');
}

export function scoreTeacher(responses: Responses): FormScore {
  return scoreForm(responses, VANDERBILT_TEACHER_QUESTIONS, TEACHER_THRESHOLDS, 'teacher');
}

export function combineProfile(
  parentResponses: Responses,
  teacherResponses: Responses | null,
): CombinedProfile {
  const p = scoreParent(parentResponses);
  const t = teacherResponses ? scoreTeacher(teacherResponses) : scoreParent({}); // empty

  const flags = {
    inattention_parent:    p.byCategory.inattention.positive,
    inattention_teacher:   teacherResponses ? t.byCategory.inattention.positive : false,
    hyperactivity_parent:  p.byCategory.hyperactivity.positive,
    hyperactivity_teacher: teacherResponses ? t.byCategory.hyperactivity.positive : false,
    odd_parent:            p.byCategory.odd.positive,
    odd_teacher:           teacherResponses ? t.byCategory.odd.positive : false,
    cd_parent:             p.byCategory.cd.positive,
    anxiety_parent:        p.byCategory.anxiety_dep.positive,
    anxiety_teacher:       teacherResponses ? t.byCategory.anxiety_dep.positive : false,
    impairment_parent:     p.hasImpairment,
    impairment_teacher:    teacherResponses ? t.hasImpairment : false,
    cross_rater_disagreement: false,
  };

  // DSM-5 requires symptoms in 2+ settings (parent home + teacher school)
  let presentation: CombinedProfile['presentation'] = 'Subthreshold';
  if (!teacherResponses) {
    presentation = 'Inconclusive';
  } else {
    const inattConfirmed = flags.inattention_parent && flags.inattention_teacher;
    const hyperConfirmed = flags.hyperactivity_parent && flags.hyperactivity_teacher;
    const inattEither    = flags.inattention_parent || flags.inattention_teacher;
    const hyperEither    = flags.hyperactivity_parent || flags.hyperactivity_teacher;
    const impairBoth     = flags.impairment_parent && flags.impairment_teacher;
    const impairEither   = flags.impairment_parent || flags.impairment_teacher;

    if (inattConfirmed && hyperConfirmed && impairBoth) {
      presentation = 'ADHD-Combined';
    } else if (inattConfirmed && (hyperEither || impairEither)) {
      presentation = 'ADHD-Inattentive';
    } else if (hyperConfirmed && (inattEither || impairEither)) {
      presentation = 'ADHD-Hyperactive-Impulsive';
    } else if ((inattEither || hyperEither) && impairEither) {
      presentation = 'Subthreshold';
    }
  }

  // Cross-rater disagreement check
  flags.cross_rater_disagreement = teacherResponses
    ? (flags.inattention_parent !== flags.inattention_teacher) ||
      (flags.hyperactivity_parent !== flags.hyperactivity_teacher)
    : false;

  // Confidence: how strongly both raters agree on positive findings
  const agreementBits = [
    flags.inattention_parent && flags.inattention_teacher,
    flags.hyperactivity_parent && flags.hyperactivity_teacher,
    flags.impairment_parent && flags.impairment_teacher,
  ];
  const agreementScore = agreementBits.filter(Boolean).length / agreementBits.length;
  const confidence = teacherResponses ? Math.round(agreementScore * 100) / 100 : 0.5;

  const alerts: string[] = [];
  if (flags.cross_rater_disagreement) {
    alerts.push('יש פער בין הדיווח של ההורה למורה – יש לבחון אם הקשיים מתבטאים בעיקר בסביבה מסוימת.');
  }
  if (flags.cd_parent) {
    alerts.push('דווחו תסמינים של הפרעת התנהגות (CD) – נדרשת בחינה קלינית מעמיקה.');
  }
  if (flags.anxiety_parent && flags.anxiety_teacher) {
    alerts.push('יש אינדיקציה לתסמיני חרדה/דיכאון משני הצדדים – שקול קומורבידיות.');
  }
  if (!flags.impairment_parent && !flags.impairment_teacher) {
    alerts.push('לא דווחה פגיעה תפקודית – האבחנה דורשת הוכחת פגיעה תפקודית לפי DSM-5.');
  }

  return {
    presentation,
    confidence,
    flags,
    alerts,
    parentScore: p,
    teacherScore: t,
  };
}
