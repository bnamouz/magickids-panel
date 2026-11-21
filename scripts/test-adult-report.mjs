// Adult ADHD report: prompt, DSM-5 evaluation from the self-report, normalisation and the adult PDF layout.
// Usage: node --test scripts/test-adult-report.mjs            (offline – mock narrative, renders /tmp/adult-report-test.pdf)
//        ADULT_REPORT_LIVE=1 node --test scripts/test-adult-report.mjs   (also calls the model with synthetic data; needs OPENAI_API_KEY)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';
const require = createRequire(import.meta.url), root = path.resolve(import.meta.dirname, '..'), cache = new Map();
function compile(relative) {
  if (cache.has(relative)) return cache.get(relative).exports;
  const filename = path.join(root, relative), source = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.React } }).outputText;
  const module = { exports: {} }; cache.set(relative, module);
  new Function('require', 'module', 'exports', js)(name => {
    if (!name.startsWith('@/') && !name.startsWith('./')) return require(name);
    const base = name.startsWith('@/') ? name.slice(2) : path.relative(root, path.resolve(path.dirname(filename), name));
    return compile(['.ts', '.tsx', '/index.ts'].map(ext => base + ext).find(file => fs.existsSync(path.join(root, file))));
  }, module, module.exports);
  return module.exports;
}
const { ASRS_ADULT_QUESTIONS: questions, ASRS_COPYRIGHT } = compile('questions/asrs_adult.ts');
const dsm5 = compile('lib/adhd/dsm5.ts'), adult = compile('lib/adult-report.ts'), generator = compile('lib/report-generator.ts');
const { generatePdfReport } = compile('lib/pdf-report.tsx');

// Synthetic self-report: 7 inattention and 3 hyperactivity symptoms, screener 5/6, childhood reported, 4 impaired domains.
const responses = Object.fromEntries(questions.map(q => [String(q.id), 1]));
const set = (code, value) => { responses[String(questions.find(q => q.dsm === code).id)] = value; };
['A1a', 'A1b', 'A1d', 'A1e', 'A1f', 'A1h', 'A1i'].forEach(code => set(code, 4)); ['A2a', 'A2c', 'A2h'].forEach(code => set(code, 3)); set('A1c', 2);
Object.assign(responses, { 19: 2, 20: 1, 21: 2, 22: 0, 23: 3, 24: 3, 25: 2, 26: 1, 27: 0, 28: 2 });
const intro = { main_difficulty: 'קושי מתמשך לסיים משימות בעבודה, דחיינות ושכחת התחייבויות.', occupation_status: 'employee', occupation: 'הנהלת חשבונות', prior_adhd: 'no', adhd_medication: 'never', family_adhd: 'yes', health: 'ללא מחלות רקע. קשיי הירדמות.', language: 'he' };
const assessment = { ...dsm5.emptyAssessment(), symptoms: { A1c: 'present', A2h: 'absent' }, onsetBefore12: 'yes', onsetAge: '8', onsetNotes: 'האם מאשרת קשיי ריכוז מכיתה ג׳; תעודות עם הערות על חוסר ריכוז.',
  settings: ['home', 'school'], impairmentDomains: ['academic', 'daily', 'family'], impairmentSeverity: 'moderate', impairmentFindings: 'איחורים בהגשת דוחות, שתי אזהרות בעבודה בשנה האחרונה, קושי בניהול חשבונות הבית.',
  differentialsExcluded: ['anxiety', 'depression', 'bipolar', 'thyroid', 'medication'], notBetterExplained: 'yes', comorbidities: ['sleep'], comorbidityNotes: 'קשיי הירדמות, ללא דום נשימה ידוע.',
  observation: 'משתף פעולה, דיבור שוטף, מאבד את חוט המחשבה בשאלות ארוכות, מניע רגל לאורך הפגישה.', developmentalHistory: 'קשיי ריכוז מבית הספר היסודי, ללא אבחון בילדות.', medicalHistory: 'בריא, ללא תרופות קבועות, ללא מחלת לב ידועה.',
  familyHistory: 'אח עם אבחנת ADHD.', schoolHistory: 'בגרות מלאה, תואר ראשון שנמשך חמש שנים; שלושה מקומות עבודה בחמש שנים.', physicalExam: 'ל״ד 122/78, דופק 72, בדיקה נוירולוגית תקינה.', strengths: 'יצירתי, יחסי אנוש טובים, מוטיבציה גבוהה לטיפול.',
  severity: 'moderate', conclusion: 'adhd', plan: ['parent_training', 'school_accommodations', 'medication', 'emotional', 'follow_up'], medicationPlan: 'דיון על טיפול בממריצים; ייקבע במפגש רפואי.' };
const input = { patient: { firstName: 'בדיקה', lastName: 'מערכת', birthDate: '1992-05-10', gender: 'male' }, phone: '+972500000000', reasonForReferral: 'אבחון קשב וריכוז למבוגרים', responses, intro,
  freeText: 'מרגיש שאני עובד כפול מאחרים כדי להגיע לאותה תוצאה.', submittedAt: '2026-11-20T09:30:00Z', clinicalNotes: [{ category: 'clinical', content: 'הגיע בזמן, מסר תעודות מבית הספר היסודי.' }], assessment };

test('the self-report feeds criterion A with the adult threshold; the physician’s judgement overrides it', () => {
  const plain = adult.evaluateAdult(responses, null, '1992-05-10');
  assert.equal(plain.evaluation.threshold, 5); assert.equal(plain.evaluation.inattention, 7); assert.equal(plain.evaluation.hyperactivity, 3);
  assert.equal(plain.evaluation.presentation, 'inattentive'); assert.equal(plain.evaluation.icd10, 'F90.0');
  // Childhood and impairment answers never confirm criteria B–D on their own.
  assert.equal(plain.evaluation.criteriaB, 'unknown'); assert.equal(plain.evaluation.criteriaC, false); assert.equal(plain.evaluation.criteriaD, false); assert.equal(plain.evaluation.allMet, false);
  const judged = adult.evaluateAdult(responses, assessment, '1992-05-10').evaluation;
  assert.equal(judged.inattention, 8); assert.equal(judged.hyperactivity, 2); assert.equal(judged.allMet, true);
  // An adult file keeps the adult threshold when the birth date is missing.
  assert.equal(adult.evaluateAdult(responses, null, null).evaluation.threshold, 5);
});

test('the prompt carries the screener, the item table, the computed block and the adult wording', () => {
  const { prompt, reportKind, evaluation } = adult.buildAdultUserPrompt(input);
  assert.equal(reportKind, 'full'); assert.equal(evaluation.inattention, 8);
  for (const needle of ['# פרטי הנבדק/ת', 'גיל: 34 שנים', 'עיסוק נוכחי: שכיר/ה – הנהלת חשבונות', 'סקרינר ASRS-v1.1', 'מתוך 24', 'A1a ', 'שיקול דעת הרופא: קיים', 'הערכת DSM-5 מחושבת', 'סף תסמינים למבוגרים: 5',
    'מסקנת הרופא: ADHD', 'דוח אבחון מלא', 'עבודה / לימודים', 'התאמות בעבודה / בלימודים', 'הדרכה פסיכו-חינוכית', 'היסטוריה לימודית ותעסוקתית', 'הערות חופשיות של הנבדק/ת', 'הגיע בזמן']) assert.ok(prompt.includes(needle), 'missing: ' + needle);
  for (const childWord of ['בית ספר / גן', 'הדרכת הורים', 'שאלון הורה', 'שאלון מורה', 'Vanderbilt']) assert.ok(!prompt.includes(childWord), 'child wording leaked: ' + childWord);
  const preliminary = adult.buildAdultUserPrompt({ ...input, assessment: null });
  assert.equal(preliminary.reportKind, 'preliminary'); assert.match(preliminary.prompt, /סיכום ראשוני מבוסס דיווח עצמי/); assert.match(preliminary.prompt, /הערכה קלינית של הרופא: לא מולאה/);
  // A physician's form without a conclusion is still preliminary.
  assert.equal(adult.buildAdultUserPrompt({ ...input, assessment: { ...assessment, conclusion: '' } }).reportKind, 'preliminary');
  const system = adult.buildAdultSystemPrompt();
  assert.match(system, /"personal"/); assert.match(system, /"workStudy"/); assert.match(system, /אינם סולם מתוקף/); assert.match(system, /אסור לקבוע אבחנה סופית/);
});

test('the model output is normalised into the shared report shape', () => {
  const { evaluation } = adult.buildAdultUserPrompt({ ...input, assessment: null });
  const report = generator.normalizeGeneratedReport({ clinicalImpression: 'x', diagnosis: 'y', recommendations: { personal: ['a', 'b'], workStudy: ['c'], medical: 'bad' } }, evaluation, 'preliminary', 'adult');
  assert.equal(report.audience, 'adult'); assert.deepEqual(report.recommendations.parents, ['a', 'b']); assert.deepEqual(report.recommendations.educational, ['c']); assert.deepEqual(report.recommendations.medical, []);
  assert.match(report.disclaimers[0], /שאלון הערכה עצמית/); assert.doesNotMatch(report.disclaimers[0], /Vanderbilt/); assert.equal(report.dsm5.length, 5);
  // The child report is unchanged.
  const child = generator.normalizeGeneratedReport({ clinicalImpression: 'x', diagnosis: 'y', recommendations: { parents: ['p'], personal: ['ignored'] } }, evaluation, 'preliminary');
  assert.deepEqual(child.recommendations.parents, ['p']); assert.match(child.disclaimers[0], /Vanderbilt/);
});

test('the printed self-report: Hebrew labels and the original 0–4 answers', () => {
  const data = adult.adultPdfData(input);
  assert.equal(data.occupation, 'שכיר/ה · הנהלת חשבונות'); assert.equal(data.screener.items.length, 6); assert.equal(data.childhood.items.length, 4); assert.equal(data.impairment.length, 6);
  assert.equal(data.impairment.filter(row => row.flagged).length, 4); assert.equal(data.childhood.items.filter(row => row.flagged).length, 3); assert.equal(data.copyright, ASRS_COPYRIGHT);
  assert.equal(data.language, 'עברית'); assert.equal(data.submittedAt, '20.11.2026');
  // Text typed in Arabic is printed as typed (the PDF falls back to an Arabic font).
  assert.equal(adult.adultPdfData({ ...input, intro: { ...intro, occupation: 'محاسبة' } }).occupation, 'שכיר/ה · محاسبة');
  const rows = adult.adultSymptomRows(responses, assessment);
  assert.equal(rows.inattention.length, 9); assert.equal(rows.hyperactivity.length, 9);
  assert.deepEqual(rows.inattention.find(row => row.code === 'A1a'), { code: 'A1a', text: dsm5.DSM5_ADULT_HE.A1a, parent: 4, teacher: null, present: 'present' });
  assert.equal(rows.inattention.find(row => row.code === 'A1c').present, 'present'); assert.equal(rows.hyperactivity.find(row => row.code === 'A2h').present, 'absent');
});

const mock = (kind) => generator.normalizeGeneratedReport(JSON.parse(fs.readFileSync(path.join(root, 'scripts/fixtures/adult-report-sample.json'), 'utf8'))[kind], adult.evaluateAdult(responses, kind === 'full' ? assessment : null, '1992-05-10').evaluation, kind, 'adult');
const pdfInput = (kind) => {
  const a = kind === 'full' ? assessment : null, { evaluation } = adult.evaluateAdult(responses, a, '1992-05-10');
  return { patient: { ...input.patient, grade: null, school: null, teacherName: null }, parent: null, reasonForReferral: input.reasonForReferral, parentScore: null, teacherScore: null, clinicalNotes: input.clinicalNotes,
    adult: adult.adultPdfData(input), report: mock(kind), dsm5Items: { ...adult.adultSymptomRows(responses, a), threshold: evaluation.threshold, inattentionCount: evaluation.inattention, hyperactivityCount: evaluation.hyperactivity },
    clinicianName: 'ד"ר בסים נמוז', clinicianTitle: 'מומחה בהפרעות קשב וריכוז', reportDate: '21.11.2026' };
};

test('the adult PDF renders, full and preliminary, and with an Arabic name', async () => {
  for (const kind of ['full', 'preliminary']) {
    const buffer = await generatePdfReport(pdfInput(kind));
    assert.ok(buffer.length > 20000, kind); fs.writeFileSync(`/tmp/adult-report-test-${kind}.pdf`, buffer);
  }
  const arabic = { ...pdfInput('preliminary'), patient: { firstName: 'محمد', lastName: 'زيدان', birthDate: '1992-05-10', gender: 'male', grade: null, school: null, teacherName: null },
    adult: adult.adultPdfData({ ...input, intro: { ...intro, occupation: 'محاسبة', language: 'ar' } }) };
  const buffer = await generatePdfReport(arabic);
  // The Arabic fallback font is embedded only when Arabic text is present.
  assert.ok(buffer.length > 20000); assert.match(buffer.toString('latin1'), /Tajawal/); assert.doesNotMatch((await generatePdfReport(pdfInput('preliminary'))).toString('latin1'), /Tajawal/);
  fs.writeFileSync('/tmp/adult-report-test-arabic.pdf', buffer);
});

test('adult reports are signed without the paediatric title', () => {
  const route = fs.readFileSync(path.join(root, 'app/api/admin/reports/generate/route.ts'), 'utf8'), adultBranch = route.slice(route.indexOf('async function generateAdult'), route.indexOf('export async function POST'));
  assert.match(route, /const ADULT_CLINICIAN_TITLE = 'מומחה בהפרעות קשב וריכוז';/); assert.match(adultBranch, /clinicianTitle: ADULT_CLINICIAN_TITLE/); assert.doesNotMatch(adultBranch, /clinicianTitle: CLINICIAN_TITLE/);
});

test('live generation', { skip: !process.env.ADULT_REPORT_LIVE }, async () => {
  const { report, evaluation, tokensIn, tokensOut } = await adult.generateAdultReportContent(input);
  console.log('tokens', tokensIn, tokensOut, '|', report.diagnosis);
  assert.equal(report.reportKind, 'full'); assert.ok(report.recommendations.parents.length >= 3); assert.ok(report.recommendations.educational.length >= 2); assert.equal(evaluation.icd10, 'F90.0');
  fs.writeFileSync('/tmp/adult-report-live.json', JSON.stringify(report, null, 2));
  fs.writeFileSync('/tmp/adult-report-live.pdf', await generatePdfReport({ ...pdfInput('full'), report }));
});
