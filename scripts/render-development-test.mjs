import fs from 'node:fs';import ts from 'typescript';
const catalog=JSON.parse(fs.readFileSync('public/development-original/catalog.json','utf8'));
let src=fs.readFileSync('lib/development/official-pdf.tsx','utf8').replace("import {officialPages} from './official';",'const raw='+JSON.stringify(catalog)+';const officialPages=(template,role)=>raw[template].pages.filter(p=>p.role===role);');
fs.writeFileSync('scripts/.render-official.mjs',ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText);
try{const {originalPdf}=await import('./.render-official.mjs');const answers={};for(const p of catalog.child.pages.filter(p=>p.role==='parent'))for(const f of p.fields){if(!answers[f.id])answers[f.id]=f.type==='text'?'בדיקת תצוגה בלבד — ללא פרטי מטופל':f.value;}
fs.writeFileSync('/tmp/development-render-test.pdf',await originalPdf({form_template:'child',parent_answers:answers},'parent'));console.log('Rendered synthetic official questionnaire');}finally{fs.unlinkSync('scripts/.render-official.mjs');}
