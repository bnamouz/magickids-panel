import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../lib/booking/format.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
new Function('module', 'exports', compiled)(module, module.exports);
const { bookingLocale } = module.exports;
const easternDigits = /[\u0660-\u0669\u06f0-\u06f9]/;

for (const language of ['he', 'ar', 'en']) {
  test(`${language}: Western digits in times, dates, calendar headings and cancellation details`, () => {
    const locale = bookingLocale(language);
    const time = new Intl.DateTimeFormat(locale, {
      timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false,
    });
    assert.equal(time.resolvedOptions().numberingSystem, 'latn');
    assert.equal(time.format(new Date('2026-09-21T12:00:00Z')), '15:00');
    assert.equal(time.format(new Date('2026-12-07T13:00:00Z')), '15:00');
    assert.equal(time.format(new Date('2026-09-22T13:00:00Z')), '16:00');
    for (const options of [
      { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
      { month: 'long', year: 'numeric' },
      { dateStyle: 'full', timeStyle: 'short' },
    ]) {
      const label = new Intl.DateTimeFormat(locale, {
        timeZone: 'Asia/Jerusalem', ...options,
      }).format(new Date('2026-09-21T12:00:00Z'));
      assert.match(label, /2026/);
      assert.doesNotMatch(label, easternDigits);
      if (language === 'ar') assert.match(label, /[\u0621-\u064a]/);
      if (language === 'he') assert.match(label, /[\u05d0-\u05ea]/);
    }
  });
}
