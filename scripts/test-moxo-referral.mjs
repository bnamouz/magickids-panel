// MOXO through Maccabi: families are asked for a valid referral from the referring physician, and staff are told to check eligibility.
// Usage: node --test scripts/test-moxo-referral.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
function compile(relative) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  const load = name => name.startsWith('./') ? compile(path.join(path.dirname(relative), name) + '.ts') : require(name);
  new Function('require', 'module', 'exports', js)(load, module, module.exports);
  return module.exports;
}
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('calendar event: the referral reminder appears only for a MOXO test requested through Maccabi', () => {
  const { fundLines } = compile('lib/booking/fund-lines.ts');
  const reminder = 'הפניה ל־MOXO: המשפחה התבקשה לשלוח הפניה מהרופא המפנה. לוודא שההפניה בתוקף ולבדוק זכאות במכבי שלי';
  assert.equal(fundLines('adhd', { fund: 'maccabi', maccabiSheli: true, moxo: true }, 'assessment'),
    `קופה: מכבי (מכבי שלי)\nמבדק MOXO: מבוקש\n${reminder}\nתשלום: העברת כרטיס מכבי בביקור\n`);
  assert.equal(fundLines('adhd', { fund: 'maccabi', maccabiSheli: false, moxo: true }, 'assessment'),
    `קופה: מכבי (ללא מכבי שלי)\nמבדק MOXO: מבוקש — ללא מכבי שלי: בתשלום 944 ₪\n${reminder}\nתשלום: העברת כרטיס מכבי בביקור\n`);
  // Unchanged lines everywhere else.
  assert.equal(fundLines('adhd', { fund: 'maccabi', maccabiSheli: true, moxo: false }, 'assessment'), 'קופה: מכבי (מכבי שלי)\nמבדק MOXO: לא מבוקש\nתשלום: העברת כרטיס מכבי בביקור\n');
  assert.equal(fundLines('adhd', { fund: 'maccabi', maccabiSheli: true, moxo: true }, 'followup'), 'קופה: מכבי (מכבי שלי)\nתשלום: העברת כרטיס מכבי בביקור\n');
  assert.equal(fundLines('adhd', { fund: 'clalit', moxo: true }, 'assessment'), 'קופה: כללית\nמבדק MOXO: מבוקש\nתשלום: שולם מראש — אסמכתה אושרה בפאנל\n');
  assert.equal(fundLines('adhd', {}, 'assessment'), '');
  assert.equal(fundLines('pediatrics', { fund: 'maccabi', moxo: true }, 'assessment'), '');
});

test('booking page: the request names the referring physician, Maccabi Sheli and validity in three languages', () => {
  const { paymentCopy } = compile('lib/booking/payment-copy.ts');
  const words = { he: ['הרופא המפנה', 'מכבי שלי', 'בתוקף'], ar: ['الطبيب المُحيل', 'مكابي شيلي', 'سارية المفعول'], en: ['referring physician', 'Maccabi Sheli', 'valid'] };
  for (const [language, expected] of Object.entries(words)) {
    const copy = paymentCopy[language];
    for (const word of expected) assert.ok(copy.moxoReferral.includes(word), `${language}: ${word}`);
    assert.ok(copy.moxoReferralAction.includes('WhatsApp') || copy.moxoReferralAction.includes('واتساب'));
    assert.ok(copy.moxoReferralMessage.includes('MOXO') && copy.moxoReferralMessage.length > 40);
  }
  const page = read('components/booking/BookingPage.tsx');
  // Shown beside the MOXO choice of a Maccabi family, whether or not Maccabi Sheli is ticked, and again after booking.
  assert.match(page, /fund === 'maccabi' && <div className=\{styles\.fundNote\}>[\s\S]*?\{visitType === 'assessment' && moxo && moxoReferral\}/);
  assert.match(page, /confirmation\.clinic === 'adhd' && fund === 'maccabi' && visitType === 'assessment' && moxo && moxoReferral/);
  assert.match(page, /wa\.me\/972544020043\?text=\$\{encodeURIComponent\(p\.moxoReferralMessage\)\}/);
});

test('MOXO request form: the referral box explains the Maccabi requirement in three languages', () => {
  const form = read('components/moxo/RequestForm.tsx');
  for (const text of ['חובה לצרף בטופס את ההפניה מהרופא המפנה. לפי ההפניה נבדוק אם קיימת זכאות לביצוע המבדק דרך מכבי שלי. ההפניה צריכה להיות בתוקף.', 'مكابي شيلي. يجب أن تكون الإحالة سارية المفعول.', 'through Maccabi Sheli. The referral must still be valid.']) assert.ok(form.includes(text), text);
  assert.ok(form.includes('{referral.maccabi}'));
});
