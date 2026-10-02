import {PGlite} from '@electric-sql/pglite';import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const db=new PGlite();try{await db.exec('create role anon;create role authenticated;create role service_role;');await db.exec(fs.readFileSync('supabase/migrations/20261002221819_class_interest_lists.sql','utf8'));
const send=(type,patient='Test')=>db.query('select submit_class_interest($1,$2,$3,$4,$5,$6) as result',[randomUUID(),type,patient,'Parent','+972501234567','he']);
assert.equal((await send('robotics')).rows[0].result,'received');assert.equal((await send('robotics')).rows[0].result,'received');await send('chess');assert.equal((await db.query('select count(*)::int as n from class_interests')).rows[0].n,2);
assert.equal((await db.query("select has_table_privilege('anon','class_interests','SELECT') as access")).rows[0].access,false);
assert.equal((await db.query("select has_function_privilege('authenticated','submit_class_interest(uuid,text,text,text,text,text)','EXECUTE') as access")).rows[0].access,false);
console.log('PASS class separation, duplicate suppression, private access');}finally{await db.close();}
