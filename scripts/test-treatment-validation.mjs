import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
function compile(file,overrides={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>overrides[n]??require(n),m,m.exports);return m.exports;}
const schema=compile('lib/treatments/schema.ts');
const body={id:'00000000-0000-4000-8000-000000000001',patient:'Test Child',contact:'Test Parent',phone:'0501234567',treatment:'speech',language:'he',availability:'',consent:true,website:''};
for(const phone of ['0501234567','050-123 4567','+972501234567','00972501234567','٠٥٠١٢٣٤٥٦٧','\u200e0501234567\u200f'])assert.equal(schema.treatmentSchema.parse({...body,phone}).phone,'+972501234567');
let writes=0;
process.env.BOOKING_HASH_SECRET='test-only';
const route=compile('app/api/treatments/route.ts',{'@/lib/treatments/schema':schema,'@/lib/supabase':{getSupabaseAdmin:()=>({rpc:async()=>{writes++;return {data:'received'};}})}});
const req=b=>({headers:new Headers({origin:'https://example.com'}),nextUrl:new URL('https://example.com/api/treatments'),text:async()=>JSON.stringify(b)});
const invalid=await route.POST(req({...body,phone:'123'}));assert.equal(invalid.status,400);assert.deepEqual((await invalid.json()).fields,['phone']);assert.equal(writes,0);
const valid=await route.POST(req(body));assert.equal(valid.status,200);assert.deepEqual(await valid.json(),{received:true,reference:body.id});assert.equal(writes,1);
console.log('PASS phone normalization, actionable validation errors, confirmation only after successful save');
