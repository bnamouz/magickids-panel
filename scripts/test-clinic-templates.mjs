// Ready-made WhatsApp messages for a single clinic patient: every template is valid, unique and renders with the child's name.
// Usage: node --test scripts/test-clinic-templates.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';
const root = path.resolve(import.meta.dirname, '..');
function compile(relative) {
  const js = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} }; new Function('require', 'module', 'exports', js)(name => { throw new Error('unexpected import ' + name); }, module, module.exports);
  return module.exports;
}
const { CLINIC_TEMPLATES, CLINIC_TEMPLATE_GROUPS, CLINIC_GREETING, templateText, freeText } = compile('lib/clinic-patients/templates.ts');

test('every ready-made message is unique, names the child once and fits the message limit', () => {
  assert.ok(CLINIC_TEMPLATES.length >= 10);
  assert.equal(new Set(CLINIC_TEMPLATES.map(t => t.id)).size, CLINIC_TEMPLATES.length);
  assert.equal(new Set(CLINIC_TEMPLATES.map(t => t.label)).size, CLINIC_TEMPLATES.length);
  assert.equal(CLINIC_TEMPLATE_GROUPS.flatMap(g => g.items).length, CLINIC_TEMPLATES.length);
  for (const t of CLINIC_TEMPLATES) {
    assert.match(t.id, /^[a-z_]+$/);
    assert.equal(t.body.split('{שם}').length - 1, 1, t.id);
    assert.ok(t.body.endsWith('.'), t.id);
    const full = templateText(t.id, 'עלי');
    assert.ok(full.startsWith(CLINIC_GREETING + '\n'), t.id);
    assert.ok(full.includes('עלי') && !full.includes('{') && full.length <= 1000, t.id);
  }
});

test('the throat-swab message matches the wording the doctor asked for', () => {
  assert.equal(templateText('throat_positive', ' עלי '), 'שלום, כאן מרפאת הילדים של ד״ר בסים נמוז.\nמשטח הגרון של עלי יצא חיובי, ולכן יש לקחת אנטיביוטיקה למשך 10 ימים שלמים.');
});

test('free text keeps the previous opening line, also for an unknown template id', () => {
  assert.equal(freeText('עלי'), 'שלום, כאן מרפאת הילדים של ד״ר בסים נמוז לגבי עלי. ');
  assert.equal(templateText('', 'עלי'), freeText('עלי'));
  assert.equal(templateText('no_such_template', 'עלי'), freeText('עלי'));
});

test('the dialog offers the templates and still sends the edited text through the existing send_one action', () => {
  const ui = fs.readFileSync(path.join(root, 'components/admin/ClinicPatients.tsx'), 'utf8');
  assert.ok(ui.includes('CLINIC_TEMPLATE_GROUPS.map') && ui.includes('pickTemplate(e.target.value)'));
  assert.ok(ui.includes("action: 'send_one', patient_id: msg.patient.id, phone: msg.phone, text: msg.text, request_id: msg.request_id"));
});
