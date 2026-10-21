// Booking confirmation wording: institute appointments carry the map pin, pediatrics ones do not.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'fs'; import ts from 'typescript'; import { createRequire } from 'module';
const require=createRequire(import.meta.url);
function compile(file,overrides={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>overrides[n]??(n.startsWith('@/')?compile(n.replace('@/','')+'.ts',overrides):n.startsWith('./')?compile('lib/booking/'+n.slice(2)+'.ts',overrides):require(n)),m,m.exports);return m.exports;}
const stub={'@/lib/supabase':{},'@/lib/whatsapp-clinic':{},'@/lib/moxo/notification':{},'@/lib/booking/server':{cancellationToken:()=>'a'.repeat(64)},'./server':{cancellationToken:()=>'a'.repeat(64)}};
const c=compile('lib/booking/confirmation-whatsapp.ts',stub);
const base={visitType:'assessment',start:'2026-11-04T14:00:00Z',durationMinutes:60,childName:'דנה',parentName:'רים חדאד',reference:'11111111-1111-4111-8111-111111111111'};
test('institute confirmations include the map link in every language', () => {
  for (const lang of ['he','ar','en']) {
    const t=c.bookingConfirmationMessage({...base,clinic:'adhd',lang});
    assert.match(t,/maps\.app\.goo\.gl\/MG3eHopWuLA4imPH8/); assert.match(t,/אלזידאני|الزيداني|Al-Zaydani/);
  }
});
test('pediatric confirmations keep the clinic address and no institute map link', () => {
  for (const lang of ['he','ar','en']) {
    const t=c.bookingConfirmationMessage({...base,clinic:'pediatrics',visitType:'pediatrics',durationMinutes:10,lang});
    assert.doesNotMatch(t,/maps\.app\.goo\.gl/); assert.match(t,/תופיק זיאד|توفيق زياد|Tawfiq Ziad/);
  }
});
