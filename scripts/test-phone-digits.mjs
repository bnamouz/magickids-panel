// Phone hygiene: Arabic-Indic digits and bidi marks must not block case edits or reminders.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'fs'; import ts from 'typescript';
function compile(file){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(()=>({}),m,m.exports);return m.exports;}
const { asciiDigits } = compile('lib/phone-digits.ts');
test('Arabic-Indic and Persian digits become ASCII', () => {
  assert.equal(asciiDigits('٠٥٢٤٣٢٢٩٩٦'),'0524322996');
  assert.equal(asciiDigits('۰۵۰-۹۹۵۵۱۳۷'),'050-9955137');
});
test('bidi marks and NBSP are removed, ASCII input untouched', () => {
  assert.equal(asciiDigits('\u202a+972 50-995-5137\u202c'),'+972 50-995-5137');
  assert.equal(asciiDigits('050\u00a09955137'),'050 9955137');
  assert.equal(asciiDigits(' 054-402-0043 '),'054-402-0043');
  assert.equal(asciiDigits(null),''); assert.equal(asciiDigits(undefined),'');
});
