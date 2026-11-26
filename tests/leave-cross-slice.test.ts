import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {leaveDatabase} from './leave-fixture';
import {asUser,personId} from './domain-fixture';
import {colleagueId} from './project-fixture';

test('combined source ledger, carryover and weekend reviews preserve grant authority and exact deductions',async()=>{
 const db=await leaveDatabase();try{
 for(const file of ['20261124221310_leave_holiday_calendar.sql','20261125132957_leave_sources_and_birthday.sql','20261125133312_carryover_review.sql','20261125133519_weekend_work_evidence.sql','20261125235641_leave_validity_review.sql'])await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'));
 await db.exec("create or replace function public.leave_today() returns date language sql stable as $$select date '2026-11-30'$$");
 const version=(await asUser(db,'admin',tx=>tx.query<{s:{version:number}}>('select leave_summary($1,2026) s',[personId]))).rows[0].s.version;
 const source=randomUUID();await asUser(db,'admin',tx=>tx.query("select grant_leave_source($1,$2,2026,'SUBSTITUTE',1,'Verified synthetic source',$3)",[source,personId,version]));
 const beforeLedger=(await db.query('select * from leave_ledger order by id')).rows;
 const beforeValidity=(await db.query('select * from leave_source_validity order by source_id')).rows;
 const beforeSources=(await db.query('select * from leave_source order by id')).rows;
 const candidate=(await asUser(db,'admin',tx=>tx.query<{id:string}>("select capture_carryover_evidence($1,2026,'NOV30_SNAPSHOT',null,null,0,false) id",[personId]))).rows[0].id;
 await asUser(db,'admin',tx=>tx.query("select review_carryover_candidate($1,1,'CONFIRMED','Candidate evidence only')",[candidate]));
 const work=randomUUID();await asUser(db,'employee',tx=>tx.query("select submit_weekend_work($1,'2026-11-29',540,1080,60,null,'Synthetic Sunday evidence')",[work]));
 await asUser(db,'leader',tx=>tx.query("select decide_weekend_work($1,1,'APPROVED')",[work]));
 await asUser(db,'leader',tx=>tx.query("select decide_weekend_work($1,1,'APPROVED')",[work]));
 // Reviewer authority is not grant authority, even after successful evidence review.
 await assert.rejects(()=>asUser(db,'leader',tx=>tx.query("select grant_leave_source($1,$2,2026,'SUBSTITUTE',1,'Forged automatic grant',$3)",[randomUUID(),personId,version+1])),/Denied/);
 await assert.rejects(()=>asUser(db,'leader',tx=>tx.query("select review_carryover_candidate($1,2,'CONFIRMED','Forged cross-scope review')",[candidate])),/FORBIDDEN/);
 assert.deepEqual((await db.query('select * from leave_ledger order by id')).rows,beforeLedger);
 assert.deepEqual((await db.query('select * from leave_source order by id')).rows,beforeSources);
 assert.deepEqual((await db.query('select * from leave_source_validity order by source_id')).rows,beforeValidity);
 for(const table of ['leave_source','leave_carryover_case','weekend_work'])assert.equal((await asUser(db,'expense',tx=>tx.query(`select id from ${table} where employee_id=$1`,[personId]))).rows.length,0);
 assert.equal((await asUser(db,'employee',tx=>tx.query('select * from leave_carryover_evidence where case_id=$1',[candidate]))).rows.length,0);
 await assert.rejects(()=>asUser(db,'employee',tx=>tx.query('select leave_sources($1,2026)',[colleagueId])),/Denied/);
 // Only a separately requested and approved leave consumes the real source.
 const request=randomUUID();await asUser(db,'employee',tx=>tx.query("select submit_leave_benefit($1,'2026-11-30','2026-11-30','FULL_DAY','Synthetic annual request','',1,'ANNUAL','')",[request]));
 await asUser(db,'leader',tx=>tx.query("select review_leave($1,'APPROVED','Approved actual leave')",[JSON.stringify([{id:request,version:1}])]));
 const deductions=(await db.query<{source_id:string;amount_delta:string}>("select source_id,amount_delta from leave_ledger where request_id=$1 and event_type='DEDUCTION'",[request])).rows;
 assert.deepEqual(deductions,[{source_id:source,amount_delta:'-1.0'}]);
 await asUser(db,'leader',tx=>tx.query("select review_leave($1,'CANCELLED','Exact source reversal')",[JSON.stringify([{id:request,version:2}])]));
 assert.equal((await db.query<{balance:string}>('select leave_source_balance($1) balance',[source])).rows[0].balance,'1.0');
 assert.equal((await db.query<{status:string}>('select status from weekend_work where id=$1',[work])).rows[0].status,'APPROVED');
 assert.equal((await db.query<{state:string}>('select state from leave_carryover_case where id=$1',[candidate])).rows[0].state,'CONFIRMED');
 }finally{await db.close();}
});
