// Tests for the DSM-5 clinical assessment model + report generator v2 + PDF layout.
// Usage: node scripts/test-adhd-report.mjs            (offline – mock report, renders /tmp/adhd-report-test.pdf)
//        node scripts/test-adhd-report.mjs --live     (also calls GPT-4o with synthetic data; needs OPENAI_API_KEY)
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import assert from 'node:assert/strict';

const dir = 'scripts/.adhd-test'; fs.mkdirSync(dir, { recursive: true });
const build = (src, out, rewrite = (s) => s) => {
  let code = rewrite(fs.readFileSync(src, 'utf8'));
  code = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  fs.writeFileSync(path.join(dir, out), code);
};
build('lib/adhd/dsm5.ts', 'dsm5.mjs');
build('lib/vanderbilt-scoring.ts', 'vanderbilt.mjs');
build('lib/report-generator.ts', 'generator.mjs', (s) => s.replace("from './vanderbilt-scoring'", "from './vanderbilt.mjs'").replace("from './adhd/dsm5'", "from './dsm5.mjs'"));
build('lib/pdf-report.tsx', 'pdf.mjs', (s) => s.replace("from './report-generator'", "from './generator.mjs'").replace("from './vanderbilt-scoring'", "from './vanderbilt.mjs'"));

let passed = 0; const test = (name, fn) => Promise.resolve().then(fn).then(() => { passed++; console.log('✓', name); }, (e) => { console.error('✗', name, '\n ', e.message); process.exitCode = 1; });

try {
  const dsm5 = await import(`../${dir}/dsm5.mjs`);
  const { scoreVanderbilt } = await import(`../${dir}/vanderbilt.mjs`);
  const gen = await import(`../${dir}/generator.mjs`);
  const { generatePdfReport } = await import(`../${dir}/pdf.mjs`);

  // Synthetic questionnaires: parent – 7 inattention + 4 hyperactivity symptoms; teacher – 6 inattention + 2.
  const parent = {}; for (let i = 1; i <= 55; i++) parent[String(i)] = i <= 48 ? 1 : 3;
  [1, 2, 3, 4, 5, 6, 8].forEach((i) => (parent[String(i)] = 3)); [10, 11, 14, 16].forEach((i) => (parent[String(i)] = 2)); [49, 50].forEach((i) => (parent[String(i)] = 5));
  const teacher = {}; for (let i = 1; i <= 43; i++) teacher[String(i)] = 1;
  [1, 2, 4, 5, 6, 8].forEach((i) => (teacher[String(i)] = 2)); [10, 16].forEach((i) => (teacher[String(i)] = 3)); [36, 37].forEach((i) => (teacher[String(i)] = 5));

  await test('symptomEvidence maps Vanderbilt items to DSM-5 codes', () => {
    const ev = dsm5.symptomEvidence({ parent, teacher });
    assert.equal(ev.A1a.parent, 3); assert.equal(ev.A1a.teacher, 2); assert.equal(ev.A1a.parentPositive, true);
    assert.equal(ev.A1g.parentPositive, false); assert.equal(ev.A2a.vanderbilt, undefined);
  });

  await test('evaluateDsm5 without clinician input counts questionnaire symptoms (either informant)', () => {
    const ev = dsm5.symptomEvidence({ parent, teacher });
    const r = dsm5.evaluateDsm5(dsm5.emptyAssessment(), ev, 9);
    assert.equal(r.threshold, 6); assert.equal(r.inattention, 7); assert.equal(r.hyperactivity, 4);
    assert.equal(r.inattentionMet, true); assert.equal(r.hyperactivityMet, false); assert.equal(r.presentation, 'inattentive'); assert.equal(r.icd10, 'F90.0');
    assert.equal(r.allMet, false); assert.ok(r.missing.some((m) => m.startsWith('קריטריון B')));
  });

  await test('clinician judgement overrides questionnaire, threshold 5 at age 17+', () => {
    const ev = dsm5.symptomEvidence({ parent, teacher });
    const a = { ...dsm5.emptyAssessment(), symptoms: { A1a: 'absent', A1b: 'absent', A1c: 'absent', A2c: 'present' }, onsetBefore12: 'yes', settings: ['home', 'school'], impairmentDomains: ['academic'], notBetterExplained: 'yes' };
    const r9 = dsm5.evaluateDsm5(a, ev, 9);
    assert.equal(r9.inattention, 4); assert.equal(r9.hyperactivity, 5); assert.equal(r9.criteriaA, false);
    const r17 = dsm5.evaluateDsm5(a, ev, 17);
    assert.equal(r17.threshold, 5); assert.equal(r17.hyperactivityMet, true); assert.equal(r17.presentation, 'hyperactive_impulsive'); assert.equal(r17.icd10, 'F90.1'); assert.equal(r17.allMet, true);
    const rOverride = dsm5.evaluateDsm5({ ...a, presentationOverride: 'combined' }, ev, 17);
    assert.equal(rOverride.icd10, 'F90.2');
  });

  await test('normalizeAssessment drops garbage and caps strings', () => {
    const a = dsm5.normalizeAssessment({ symptoms: { A1a: 'present', A1b: 'maybe', ZZZ: 'present' }, onsetBefore12: 'later', settings: ['home', 5, 'x'], observation: 'x'.repeat(5000), conclusion: 'adhd', plan: ['medication'], impairmentSeverity: 'huge' });
    assert.deepEqual(a.symptoms, { A1a: 'present' }); assert.equal(a.onsetBefore12, 'unknown'); assert.deepEqual(a.settings, ['home', 'x']);
    assert.equal(a.observation.length, 4000); assert.equal(a.conclusion, 'adhd'); assert.equal(a.impairmentSeverity, '');
  });

  const parentScore = scoreVanderbilt(parent, 'parent'), teacherScore = scoreVanderbilt(teacher, 'teacher');
  const assessment = { ...dsm5.emptyAssessment(), symptoms: { A1g: 'present', A2c: 'present' }, onsetBefore12: 'yes', onsetAge: '5', settings: ['home', 'school'], impairmentDomains: ['academic', 'social'], impairmentSeverity: 'moderate',
    impairmentFindings: 'ירידה בהישגים בחשבון ובקריאה; קשיים בשמירה על חברויות; מריבות תכופות עם אחים סביב שיעורי בית.', differentialsExcluded: ['anxiety', 'hearing_vision', 'sleep', 'thyroid'], notBetterExplained: 'yes',
    comorbidities: [], observation: 'ילד חביב ומשתף פעולה, קשר עין תקין. במהלך הבדיקה קם מהכיסא מספר פעמים, נגע בחפצים על השולחן, נדרש לחזור על הוראות. שפה תקינה לגיל.', developmentalHistory: 'הריון ולידה תקינים, אבני דרך מוטוריות ושפתיות בזמן.',
    medicalHistory: 'בריא בדרך כלל, ללא תרופות קבועות, שינה תקינה.', familyHistory: 'אב עם קשיי קשב בילדות, ללא אבחון פורמלי.', schoolHistory: 'כיתה ד׳, ללא התאמות קיימות; המורה מדווחת על קושי בהשלמת משימות.',
    physicalExam: 'גובה ומשקל באחוזון 50, ל״ד 98/62, דופק 84, בדיקה נוירולוגית תקינה, ללא טיקים.', testsResults: '', strengths: 'יצירתי, אוהב לצייר, יחסים חמים עם המשפחה.', severity: 'moderate', conclusion: 'adhd', presentationOverride: '',
    plan: ['parent_training', 'school_accommodations', 'medication', 'follow_up'], medicationPlan: 'דיון עם ההורים על התחלת טיפול בממריצים; ייקבע במפגש רפואי.', planNotes: '' };
  const input = {
    patient: { firstName: 'בדיקה', lastName: 'מערכת', birthDate: '2017-03-14', gender: 'male', grade: 'ד׳', school: 'יסודי לדוגמה', teacherName: 'מורה לדוגמה' },
    parent: { fullName: 'הורה לדוגמה', relation: 'אם', phone: '050-0000000' }, reasonForReferral: 'קשיי קשב וריכוז בבית הספר, אי-השלמת משימות, חוסר שקט.',
    parentScore, teacherScore, parentResponses: parent, teacherResponses: teacher, parentIntro: { strengths: 'יצירתי ואוהב לצייר', main_difficulty: 'לא מסיים שיעורי בית', medication_status: 'none' },
    parentFreeText: 'קשה לו מאוד להתארגן בבוקר.', teacherFreeText: 'תלמיד נעים אך מתקשה להתמיד.', teacherRespondent: { name: 'מורה לדוגמה', role: 'מחנכת' },
    clinicalNotes: [{ category: 'clinical', content: 'בשיחת ההיכרות ההורים תיארו קשיים כבר מהגן.' }], assessment,
  };

  await test('buildUserPrompt includes computed DSM-5 block, item table and assessment', () => {
    const { prompt, evaluation, reportKind } = gen.buildUserPrompt(input);
    assert.equal(reportKind, 'full'); assert.equal(evaluation.inattention, 8); assert.equal(evaluation.hyperactivity, 5); assert.equal(evaluation.icd10, 'F90.0'); assert.equal(evaluation.allMet, true);
    for (const needle in { 'הערכת DSM-5 מחושבת': 1, 'A1a ': 1, 'שיקול דעת הרופא: קיים': 1, 'מסקנת הרופא: ADHD': 1, 'הקושי העיקרי לפי ההורה': 1, 'טקסט חופשי של המדווח': 1, 'דוח אבחון מלא': 1 }) assert.ok(prompt.includes(needle), 'missing ' + needle);
    const prelim = gen.buildUserPrompt({ ...input, assessment: null });
    assert.equal(prelim.reportKind, 'preliminary'); assert.ok(prelim.prompt.includes('סיכום ראשוני'));
  });

  await test('normalizeGeneratedReport fills DSM-5 rows and preliminary disclaimer', () => {
    const { evaluation } = gen.buildUserPrompt({ ...input, assessment: null });
    const r = gen.normalizeGeneratedReport({ clinicalImpression: 'x', diagnosis: 'y', dsm5: [{ criterion: 'a', finding: 'ok', status: 'met' }], recommendations: { parents: ['p'], educational: 'bad' } }, evaluation, 'preliminary');
    assert.equal(r.dsm5.length, 5); assert.equal(r.dsm5[0].finding, 'ok'); assert.equal(r.dsm5[1].status, 'unknown'); assert.deepEqual(r.recommendations.educational, []);
    assert.ok(r.disclaimers[0].includes('ראשוני'));
    assert.throws(() => gen.normalizeGeneratedReport({ diagnosis: 'y' }, evaluation, 'full'), /missing required/);
  });

  const mockReport = {
    reportKind: 'full', background: 'בדיקה מערכת, בן 9 בכיתה ד׳, הופנה על ידי הוריו בשל קשיי קשב.\n\nהתלונה העיקרית: אי-השלמת משימות וחוסר שקט.', sources: 'שאלוני הורה ומורה, ראיון אנמנסטי ובדיקה קלינית.', history: 'הריון ולידה תקינים. אב עם קשיי קשב בילדות.',
    questionnaireFindings: 'בשאלון ההורה 7 תסמיני חוסר קשב ו-4 תסמיני היפראקטיביות. בשאלון המורה 6 ו-2 בהתאמה. הסכמה גבוהה בין המדווחים בציר הקשב.', observation: 'במהלך הבדיקה קם מהכיסא מספר פעמים ונדרש לחזור על הוראות. בדיקה נוירולוגית תקינה.',
    dsm5: [
      { criterion: 'A', title: 'תסמינים', finding: '8/9 תסמיני חוסר קשב ו-5/9 היפראקטיביות (סף 6).', status: 'met' }, { criterion: 'B', title: 'הופעה לפני גיל 12', finding: 'תסמינים מגיל 5 לפי ההורים.', status: 'met' },
      { criterion: 'C', title: 'נוכחות בשתי מסגרות לפחות', finding: 'בית ובית ספר.', status: 'met' }, { criterion: 'D', title: 'פגיעה תפקודית', finding: 'ירידה בהישגים וקשיים חברתיים, חומרה בינונית.', status: 'met' }, { criterion: 'E', title: 'שלילת הסבר חלופי', finding: 'נשללו חרדה, הפרעת שינה, ליקוי שמיעה/ראייה ובלוטת התריס.', status: 'met' },
    ],
    clinicalImpression: 'פסקה ראשונה של התרשמות קלינית ארוכה מספיק כדי לבדוק גלישת שורות בעברית בתוך מסמך PDF מרובה עמודים.\n\nפסקה שנייה עם חוזקות הילד והשפעה על התפקוד.', diagnosis: 'הפרעת קשב וריכוז (ADHD), הצגה של חוסר קשב בעיקר – ICD-10 F90.0',
    presentationAndSeverity: 'הצגה של חוסר קשב בעיקר, חומרה בינונית.', differential: 'נשללו חרדה והפרעת שינה; לא זוהתה תחלואה נלווית.',
    recommendations: { parents: ['שגרה קבועה והוראות קצרות.', 'הדרכת הורים.'], educational: ['ישיבה קרובה למורה.', 'פיצול משימות והארכת זמן.', 'הפסקות תנועה קצרות.'], medical: ['דיון על טיפול תרופתי במפגש רפואי, עם מעקב גדילה, דופק ולחץ דם.'], therapeutic: ['שקילת אבחון דידקטי.'], followUp: 'ביקורת בעוד 3 חודשים עם שאלוני מעקב.' },
    summary: 'סיכום קצר של הדוח לקריאה מהירה.', disclaimers: ['הדוח מיועד להורים ולצוות החינוכי.'],
  };
  const ev = dsm5.symptomEvidence({ parent, teacher });
  const rows = (list) => list.map((s) => ({ code: s.code, text: s.he, parent: ev[s.code].parent, teacher: ev[s.code].teacher, present: dsm5.effectivePresence(s.code, assessment, ev) }));
  const pdfInput = { ...input, report: mockReport, dsm5Items: { inattention: rows(dsm5.DSM5_INATTENTION), hyperactivity: rows(dsm5.DSM5_HYPERACTIVITY), threshold: 6, inattentionCount: 8, hyperactivityCount: 5 }, clinicianName: 'ד"ר בסים נמוז', clinicianTitle: 'מומחה ברפואת ילדים, הפרעות קשב וריכוז', reportDate: '29.10.2026' };

  await test('PDF renders with the new sections', async () => {
    const buf = await generatePdfReport(pdfInput);
    assert.ok(buf.length > 20000); fs.writeFileSync('/tmp/adhd-report-test.pdf', buf);
  });

  if (process.argv.includes('--live')) {
    await test('live GPT-4o generation produces a full report', async () => {
      const { report, evaluation, tokensIn, tokensOut } = await gen.generateReportContent(input);
      console.log('  tokens', tokensIn, tokensOut, '| diagnosis:', report.diagnosis);
      assert.equal(report.reportKind, 'full'); assert.ok(report.recommendations.educational.length >= 2); assert.ok(report.recommendations.parents.length >= 2); assert.equal(report.dsm5.length, 5);
      fs.writeFileSync('/tmp/adhd-report-live.json', JSON.stringify(report, null, 2));
      fs.writeFileSync('/tmp/adhd-report-live.pdf', await generatePdfReport({ ...pdfInput, report, dsm5Items: { ...pdfInput.dsm5Items, threshold: evaluation.threshold, inattentionCount: evaluation.inattention, hyperactivityCount: evaluation.hyperactivity } }));
    });
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`${passed} passed${process.exitCode ? ' (with failures)' : ''}`);
