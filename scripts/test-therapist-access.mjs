import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
function compile(file,overrides={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>overrides[n]??require(n),m,m.exports);return m.exports;}
process.env.BOOKING_HASH_SECRET='test-secret-not-real';
let profile={id:'00000000-0000-4000-8000-000000000001',token_version:'version1',active:true,token_expires_at:'2099-01-01'};
const db={from(){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:profile})};}};
const server=compile('lib/therapists/server.ts',{'@/lib/supabase':{getSupabaseAdmin:()=>db},'./slots':{therapistSlots:()=>[]}});
const token=server.portalToken(profile);assert.ok(await server.authenticateTherapist(profile.id,token));assert.equal(await server.authenticateTherapist(profile.id,'0'.repeat(64)),null);
profile.token_version='version2';assert.equal(await server.authenticateTherapist(profile.id,token),null);profile.token_version='version1';profile.active=false;assert.equal(await server.authenticateTherapist(profile.id,token),null);profile.active=true;profile.token_expires_at='2020-01-01';assert.equal(await server.authenticateTherapist(profile.id,token),null);
let calls=0;
const route=compile('app/api/therapist/route.ts',{'@/lib/therapists/server':{authenticateTherapist:async()=>({id:profile.id}),availableSlots:async()=>[]},'@/lib/therapists/schema':{availabilitySchema:{}},'@/lib/supabase':{getSupabaseAdmin:()=>({from(){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:null})};}})},'@/lib/therapists/workflow':{scheduleTreatment:async()=>{calls++;},closeTreatment:async()=>{calls++;}}});
for(const action of ['schedule','close']){const req={headers:new Headers({origin:'https://example.com'}),nextUrl:new URL('https://example.com/api/therapist'),text:async()=>JSON.stringify({id:profile.id,token,action,requestId:'00000000-0000-4000-8000-000000000099'})};assert.equal((await route.POST(req)).status,403);}assert.equal(calls,0);
console.log('PASS portal tokens, revocation, expiry, inactive therapist and cross-therapist request denial');
