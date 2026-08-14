/**
 * Report Generator — uses OpenAI GPT-4o to synthesize clinical narrative
 * from Vanderbilt scores, clinical notes, and patient context.
 */

import OpenAI from 'openai';
import type { VanderbiltScore } from './vanderbilt-scoring';

export interface ReportInput {
  patient: {
    firstName: string;
    lastName: string;
    birthDate: string | null;
    gender: string | null;
    grade: string | null;
    school: string | null;
    teacherName: string | null;
  };
  parent: {
    fullName: string;
    relation: string | null;
    phone: string;
  } | null;
  reasonForReferral: string | null;
  parentScore: VanderbiltScore | null;
  teacherScore: VanderbiltScore | null;
  clinicalNotes: Array<{ category: string; content: string }>;
  additionalObservations?: string;
}

export interface GeneratedReport {
  clinicalImpression: string;
  diagnosis: string;
  recommendations: {
    therapeutic: string[];
    educational: string[];
    medical: string[];
    followUp: string;
  };
  disclaimers: string[];
}

function calculateAge(birthDate: string | null): string {
  if (!birthDate) return 'לא צוין';
  const b = new Date(birthDate);
  const now = new Date();
  const years = now.getFullYear() - b.getFullYear();
  const monthDiff = now.getMonth() - b.getMonth();
  const actualYears = monthDiff < 0 || (monthDiff === 0 && now.getDate() < b.getDate())
    ? years - 1
    : years;
  return `${actualYears} שנים`;
}

function buildSystemPrompt(): string {
  return `אתה עוזר קליני מקצועי המסייע בכתיבת דוחות אבחון ADHD לפי סקאלת NICHQ Vanderbilt.

תפקידך: לנסח סעיפים קליניים לדוח מקצועי בעברית, על בסיס נתונים כמותיים ואיכותיים שסופקו לך.

עקרונות חשובים:
1. הדוח נחתם על ידי ד"ר בסים נמוז — מומחה ברפואת ילדים והפרעות קשב וריכוז. אתה מנסח בשמו בגוף שלישי מקצועי.
2. אל תמציא נתונים. השתמש רק במידע שסופק.
3. השתמש בשפה קלינית מקצועית אך נגישה.
4. אבחנה של ADHD ניתנת רק כשהקריטריונים הסטטיסטיים של Vanderbilt עונים על הסף.
5. אם רק שאלון הורה קיים (ללא מורה), הזכר שהאבחנה מתבססת על מקור מידע יחיד ומומלץ להשלים.
6. תשובה בפורמט JSON בלבד, לפי הסכמה.

סכמת התשובה:
{
  "clinicalImpression": "פסקה ארוכה (150-250 מילים) המסכמת את ההתרשמות הקלינית: מהות הפרעה, פרופיל תסמינים, השפעה על תפקוד. השתמש בעברית תקנית.",
  "diagnosis": "אבחנה פורמלית לפי DSM-5 בעברית, למשל: 'אבחון ADHD, תת-סוג מעורב (F90.2)' או 'תסמינים חלקיים - לא ניתן לאשר ADHD ברמת הביטחון הנדרשת'. אם יש קומורבידיות (ODD, חרדה) — ציין גם.",
  "recommendations": {
    "therapeutic": ["המלצה 1", "המלצה 2", ...],
    "educational": ["המלצה 1", "המלצה 2", ...],
    "medical": ["המלצה 1", "המלצה 2", ...],
    "followUp": "פסקה קצרה על המשך הטיפול והמעקב."
  },
  "disclaimers": [
    "הערה 1 (למשל: 'הדוח מתבסס על שאלון הורה בלבד - מומלץ להשלים שאלון מורה')",
    "הערה 2 (למשל: 'האבחנה טעונה אימות במפגש קליני פרונטלי')"
  ]
}`;
}

function buildUserPrompt(input: ReportInput): string {
  const age = calculateAge(input.patient.birthDate);
  const parts: string[] = [];

  parts.push('# פרטי הילד');
  parts.push(`שם: ${input.patient.firstName} ${input.patient.lastName}`);
  parts.push(`גיל: ${age}`);
  parts.push(`מין: ${input.patient.gender || 'לא צוין'}`);
  parts.push(`כיתה: ${input.patient.grade || 'לא צוין'}`);
  parts.push(`בית ספר: ${input.patient.school || 'לא צוין'}`);

  if (input.parent) {
    parts.push('\n# פרטי הורה');
    parts.push(`שם: ${input.parent.fullName}`);
    parts.push(`קרבה: ${input.parent.relation || 'לא צוין'}`);
  }

  if (input.reasonForReferral) {
    parts.push('\n# סיבת ההפניה');
    parts.push(input.reasonForReferral);
  }

  if (input.parentScore) {
    parts.push('\n# שאלון הורה (NICHQ Vanderbilt)');
    parts.push(`מילוי: ${input.parentScore.completeness}% מהשאלון`);
    parts.push(`הצגה קלינית: ${input.parentScore.presentationLabelHe}`);
    parts.push('\nניקוד תת-סקאלות:');
    input.parentScore.subscales.forEach((s) => {
      const status = s.meetsThreshold ? '✓ עבר סף קליני' : '✗ לא עבר סף';
      parts.push(`  - ${s.labelHe}: ${s.symptomCount} סימפטומים מתוך ${s.threshold} נדרשים ${status}`);
    });
    parts.push(`\nתפקוד: ${input.parentScore.performance.interpretation}`);
  } else {
    parts.push('\n# שאלון הורה: לא מולא');
  }

  if (input.teacherScore) {
    parts.push('\n# שאלון מורה (NICHQ Vanderbilt)');
    parts.push(`מילוי: ${input.teacherScore.completeness}% מהשאלון`);
    parts.push(`הצגה קלינית: ${input.teacherScore.presentationLabelHe}`);
    parts.push('\nניקוד תת-סקאלות:');
    input.teacherScore.subscales.forEach((s) => {
      const status = s.meetsThreshold ? '✓ עבר סף קליני' : '✗ לא עבר סף';
      parts.push(`  - ${s.labelHe}: ${s.symptomCount} סימפטומים ${status}`);
    });
  } else {
    parts.push('\n# שאלון מורה: לא מולא');
  }

  if (input.clinicalNotes.length > 0) {
    parts.push('\n# הערות קליניות מהמאבחן');
    input.clinicalNotes.forEach((n) => {
      parts.push(`[${n.category}]: ${n.content}`);
    });
  }

  if (input.additionalObservations) {
    parts.push('\n# תצפיות נוספות');
    parts.push(input.additionalObservations);
  }

  parts.push('\n---\nעל בסיס המידע שסופק, כתוב את סעיפי הדוח לפי הסכמה שהוגדרה. השב אך ורק ב-JSON תקין.');

  return parts.join('\n');
}

export async function generateReportContent(input: ReportInput): Promise<GeneratedReport> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserPrompt(input) },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 3000,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned empty response');
  }

  let parsed: GeneratedReport;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error(`Invalid JSON from OpenAI: ${(e as Error).message}`);
  }

  // Validate shape
  if (!parsed.clinicalImpression || !parsed.diagnosis || !parsed.recommendations) {
    throw new Error('OpenAI response missing required fields');
  }

  return parsed;
}
