import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {leaveDatabase} from './leave-fixture';
import {asUser,personId} from './domain-fixture';
export const validityMigration='supabase/migrations/20261125235641_leave_validity_review.sql';
test('validity migration separates unknown historical balances and bounded usable grants',async()=>{const db=await leaveDatabase();try{
 await db.exec(readFileSync('supabase/migrations/20261124221310_leave_holiday_calendar.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20261125132957_leave_sources_and_birthday.sql','utf8'));
 await db.exec(readFileSync(validityMigration,'utf8'));
 const summary=async()=> (await asUser(db,'admin',tx=>tx.query<{s:{balance:number;historical_balance:number;version:number}}>('select leave_summary($1,2026) s',[personId]))).rows[0].s;
 assert.equal((await summary()).balance,0);assert.equal((await summary()).historical_balance,15);
 const id=randomUUID(),version=(await summary()).version;await asUser(db,'admin',tx=>tx.query("select grant_leave_source($1,$2,2026,'CARRYOVER',1,'Verified synthetic receiving year',$3)",[id,personId,version]));
 assert.equal((await summary()).balance,1);
 await db.exec("create or replace function public.leave_today() returns date language sql stable as $$select date '2026-12-31'$$");assert.equal((await summary()).balance,1);
 await db.exec("create or replace function public.leave_today() returns date language sql stable as $$select date '2027-01-01'$$");assert.equal((await summary()).balance,0);assert.equal((await summary()).historical_balance,16);
 for(const role of ['anon','authenticated'])for(const fn of ['record_new_leave_validity()','leave_check_period(uuid,date,date,text)','birthday_outside_window(uuid,date)','submit_leave_kind_v2(uuid,date,date,text,text,text,text,text,uuid)'])assert.equal((await db.query<{allowed:boolean}>('select has_function_privilege($1,$2,$3) allowed',[role,'public.'+fn,'EXECUTE'])).rows[0].allowed,false);
 }finally{await db.close();}});

test('read-only preflight detects deployed constraint drift before source migration',async()=>{const db=await leaveDatabase();try{
 const sql=readFileSync('scripts/preflight-leave-sources.sql','utf8');await db.exec(sql);
 await db.exec('alter table leave_ledger rename constraint leave_ledger_request_id_event_type_key to unexpected_constraint');
 await assert.rejects(db.exec(sql),/LEAVE_SOURCE_PREFLIGHT_FAILED/);await db.exec('rollback');
 }finally{await db.close();}});

test('verified legacy carryover consumes and reverses exact prior-year source with stale protection',async()=>{const db=await leaveDatabase();try{
 await db.exec(readFileSync('supabase/migrations/20261124221310_leave_holiday_calendar.sql','utf8'));await db.exec(readFileSync('supabase/migrations/20261125132957_leave_sources_and_birthday.sql','utf8'));
 const id=randomUUID();await asUser(db,'admin',tx=>tx.query("select grant_leave_source($1,$2,2025,'CARRYOVER',2,'Synthetic old carryover',0)",[id,personId]));
 await db.exec(readFileSync(validityMigration,'utf8'));
 await asUser(db,'admin',tx=>tx.query("select confirm_leave_validity($1,2026,'2026-01-01','2026-12-31','Verified synthetic receiving year',1)",[id]));
 const req=randomUUID();await asUser(db,'employee',tx=>tx.query("select submit_leave_benefit($1,'2026-11-16','2026-11-16','FULL_DAY','','',1,'ANNUAL','')",[req]));
 await asUser(db,'leader',tx=>tx.query("select review_leave($1,'APPROVED','')",[JSON.stringify([{id:req,version:1}])]));
 await assert.rejects(asUser(db,'admin',tx=>tx.query("select correct_leave_source($1,0.5,'Stale',2)",[id])),/STALE/);
 await db.exec("create or replace function public.leave_today() returns date language sql stable as $$select date '2027-01-04'$$");
 await asUser(db,'leader',tx=>tx.query("select review_leave($1,'CANCELLED','')",[JSON.stringify([{id:req,version:2}])]));
 const rows=(await asUser(db,'employee',tx=>tx.query<{s:{id:string;balance:number;usable_balance:number}[]}>('select leave_sources($1,2026) s',[personId]))).rows[0].s;assert.equal(rows.find(s=>s.id===id)?.balance,2);assert.equal(rows.find(s=>s.id===id)?.usable_balance,0);
 await assert.rejects(asUser(db,'admin',tx=>tx.query("select correct_leave_source($1,0.5,'Stale reversal',3)",[id])),/STALE/);
 }finally{await db.close();}});

test('partially valid multi-workday requests fail closed instead of charging annual',async()=>{const db=await leaveDatabase();try{
 await db.exec(readFileSync('supabase/migrations/20261124221310_leave_holiday_calendar.sql','utf8'));await db.exec(readFileSync('supabase/migrations/20261125132957_leave_sources_and_birthday.sql','utf8'));await db.exec(readFileSync(validityMigration,'utf8'));
 const source=(await db.query<{id:string}>('select id from leave_source where employee_id=$1',[personId])).rows[0].id;
 await asUser(db,'admin',tx=>tx.query("select confirm_leave_validity($1,2026,'2026-01-01','2026-11-16','Synthetic partial validity',1)",[source]));
 await assert.rejects(asUser(db,'employee',tx=>tx.query("select submit_leave_benefit($1,'2026-11-16','2026-11-17','FULL_DAY','','',1,'ANNUAL','')",[randomUUID()])),/LEAVE_PERIOD_SPLIT_REQUIRED/);
 await assert.rejects(asUser(db,'employee',tx=>tx.query("select confirm_leave_validity($1,2026,'2026-01-01','2026-12-31','Forged',1)",[source])),/Denied/);
 }finally{await db.close();}});

test('birthday project exception requires actual participation and separate review even for a leader',async()=>{const db=await leaveDatabase();try{
 await db.exec(readFileSync('supabase/migrations/20261124221310_leave_holiday_calendar.sql','utf8'));await db.exec(readFileSync('supabase/migrations/20261125132957_leave_sources_and_birthday.sql','utf8'));await db.exec(readFileSync(validityMigration,'utf8'));
 const project='30000000-0000-4000-8000-000000000001',leader='10000000-0000-4000-8000-000000000004';
 const submit=(role:string,id:string,p:string|null,reason='Project prevented use')=>asUser(db,role,tx=>tx.query("select submit_leave_benefit_v2($1,'2026-02-02','2026-02-02','AM_HALF','','Synthetic past reason',1,'BIRTHDAY',$2,$3)",[id,reason,p]));
 await assert.rejects(submit('employee',randomUUID(),null),/BIRTHDAY_PROJECT_REQUIRED/);
 await assert.rejects(submit('employee',randomUUID(),'30000000-0000-4000-8000-000000000002'),/BIRTHDAY_PROJECT_REQUIRED/);
 await assert.rejects(submit('employee',randomUUID(),project,''),/BIRTHDAY_EXCEPTION_REQUIRED/);
 await db.query('insert into birthday_calendar(employee_id,month,day) values($1,1,2) on conflict(employee_id) do update set month=1,day=2',[leader]);
 await db.query("insert into project_assignment(id,project_id,employee_id,start_date,end_date,role,status) values($1,$2,$3,'2026-01-01','2026-02-28','Synthetic reviewer','ACTIVE')",[randomUUID(),project,leader]);
 const id=randomUUID();await submit('leader',id,project);assert.equal((await db.query<{status:string}>('select status from leave_request where id=$1',[id])).rows[0].status,'PENDING');
 await assert.rejects(asUser(db,'leader',tx=>tx.query("select review_leave($1,'APPROVED','')",[JSON.stringify([{id,version:1}])])),/SELF_REVIEW_DENIED/);
 await asUser(db,'admin',tx=>tx.query("select review_leave($1,'APPROVED','Verified exception')",[JSON.stringify([{id,version:1}])]));
 assert.equal((await db.query<{status:string}>('select status from leave_request where id=$1',[id])).rows[0].status,'APPROVED');
 }finally{await db.close();}});

test('leader auto-approval advances the prior source year version and keeps validity private',async()=>{const db=await leaveDatabase();try{
 const leader='10000000-0000-4000-8000-000000000004';await db.exec(readFileSync('supabase/migrations/20261124221310_leave_holiday_calendar.sql','utf8'));await db.exec(readFileSync('supabase/migrations/20261125132957_leave_sources_and_birthday.sql','utf8'));
 const source=randomUUID();await asUser(db,'admin',tx=>tx.query("select grant_leave_source($1,$2,2025,'CARRYOVER',2,'Synthetic old leader carryover',0)",[source,leader]));await db.exec(readFileSync(validityMigration,'utf8'));
 await asUser(db,'admin',tx=>tx.query("select confirm_leave_validity($1,2026,'2026-01-01','2026-12-31','Verified synthetic',1)",[source]));
 assert.equal((await asUser(db,'employee',tx=>tx.query('select * from leave_source_validity where source_id=$1',[source]))).rows.length,0);
 const request=randomUUID();await asUser(db,'leader',tx=>tx.query("select submit_leave_benefit($1,'2026-11-16','2026-11-16','FULL_DAY','','',1,'ANNUAL','')",[request]));
 assert.equal((await db.query<{status:string}>('select status from leave_request where id=$1',[request])).rows[0].status,'APPROVED');
 await assert.rejects(asUser(db,'admin',tx=>tx.query("select correct_leave_source($1,0.5,'Old version',2)",[source])),/STALE/);
 await assert.rejects(asUser(db,'leader',tx=>tx.query('delete from leave_source_validity where source_id=$1',[source])),/permission denied/);
 await assert.rejects(db.query("update leave_source_validity set reason='rewrite' where source_id=$1",[source]),/IMMUTABLE/);
 }finally{await db.close();}});
