import {PGlite} from '@electric-sql/pglite';import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role;');
 await db.exec(fs.readFileSync('db/migrations/20260909_moxo_requests.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261002213054_moxo_tuesday_thursday_hourly.sql','utf8'));
 const submit=async(id,start=null,date=null)=>(await db.query("select submit_moxo_preference($1,'Test Child','Test Parent',$2,'he',$3,$4) as r",[id,'+9725'+Math.floor(10000000+Math.random()*89999999),date,start])).rows[0].r;
 // 2099-01-06 is Tuesday; January uses UTC+2 in Israel.
 const day='2099-01-06';assert.equal(new Date(day+'T12:00:00Z').getUTCDay(),2);
 const book=async(id,start,duration=60)=>(await db.query('select approve_moxo_request($1,$2,$3,$4) as r',[id,start,duration,randomUUID()])).rows[0].r;
 for(const hour of [9,10,11,12]){const id=randomUUID(),start=`${day}T${String(hour-2).padStart(2,'0')}:00:00Z`;assert.equal(await submit(id,start,day),'pending');assert.equal(await book(id,start),'approved');assert.equal(await book(id,start),'approved');}
 const other=randomUUID();assert.equal(await submit(other),'pending');assert.equal(await book(other,day+'T07:00:00Z'),'slot_taken');
 for(const start of [day+'T06:00:00Z',day+'T11:00:00Z',day+'T07:30:00Z','2099-01-07T07:00:00Z'])assert.equal(await book(other,start),'invalid_slot');
 assert.equal(await book(other,'2099-01-08T07:00:00Z',30),'invalid_slot');assert.equal(await book(other,'2099-01-08T07:00:00Z'),'approved');
 assert.equal(await submit(randomUUID(),null,'2099-01-07'),'invalid_date');assert.equal(await submit(randomUUID(),day+'T11:00:00Z',day),'invalid_slot');
 assert.equal((await db.query("select has_function_privilege('anon','submit_moxo_preference(uuid,text,text,text,text,date,timestamptz)','EXECUTE') as access")).rows[0].access,false);
 console.log('PASS MOXO Tuesday/Thursday hourly starts, 60-minute duration, preference validation, retries, overlap and permissions');
}finally{await db.close();}
