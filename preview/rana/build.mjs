import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const here = path.dirname(fileURLToPath(import.meta.url));
await fs.mkdir(path.join(here, 'generated'), { recursive: true });
await fs.mkdir(path.join(here, 'dist'), { recursive: true });
for (const [source, target] of [
  ['lib/booking/schedule.ts', 'schedule.mjs'],
  ['lib/therapists/request-slots.ts', 'request-slots.mjs'],
]) {
  const text = await fs.readFile(path.join(here, '../..', source), 'utf8');
  const compiled = ts.transpileModule(text, { compilerOptions: {
    module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022,
  } }).outputText.replace("'../booking/schedule'", "'./schedule.mjs'");
  await fs.writeFile(path.join(here, 'generated', target), compiled);
}
for (const file of ['index.html', 'app.js', 'style.css']) {
  await fs.copyFile(path.join(here, 'web', file), path.join(here, 'dist', file));
}
console.log('Built isolated Rana preview. No production code or credentials loaded.');
