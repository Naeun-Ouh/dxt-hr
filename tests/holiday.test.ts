import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {leaveDatabase,approvedLeaveId} from './leave-fixture';
import {asUser,personId} from './domain-fixture';
import {workingDays} from '../src/lib/leave/validation';
async function database(){const db=await leaveDatabase();await db.exec(readFileSync('supabase/migrations/20261124221310_leave_holiday_calendar.sql','utf8'));return db;}
test('verified 2026 holidays and coverage enforce same SQL/client workdays, halves and amendments',async()=>{const db=await database();try{
 for(const date of ['2026-05-01','2026-07-17','2026-10-05','2026-10-09','2026-10-10'])for(const unit of ['FULL_DAY','AM_HALF'])await assert.rejects(asUser(db,'employee',tx=>tx.query('select leave_days($1,$1,$2)',[date,unit])),/NO_WORKDAY/);
 await assert.rejects(asUser(db,'employee',tx=>tx.query<{days:string}>("select leave_days('2028-01-04','2028-01-04','FULL_DAY')")),/UNVERIFIED/);
 for(const day of ['2027-02-09','2027-05-03','2027-07-19','2027-12-27'])await assert.rejects(asUser(db,'employee',tx=>tx.query("select leave_days($1,$1,'FULL_DAY')",[day])),/NO_WORKDAY/);
 await asUser(db,'admin',tx=>tx.query("select adjust_leave($1,2027,1,'Confirmed synthetic opening balance',0)",[personId]));
 await asUser(db,'employee',tx=>tx.query("select submit_leave_checked($1,'2027-01-04','2027-01-04','FULL_DAY','','',1)",[randomUUID()]));
 const rows=(await db.query<{day:Date}>('select day from holiday_calendar')).rows.map(r=>r.day.toISOString().slice(0,10));
 assert.equal(workingDays('2026-10-01','2026-10-12','FULL_DAY',rows),6);
 assert.equal((await asUser(db,'employee',tx=>tx.query<{days:string}>("select leave_days('2026-10-01','2026-10-12','FULL_DAY') days"))).rows[0].days,'6');
 assert.equal((await asUser(db,'employee',tx=>tx.query<{days:string}>("select leave_days('2026-10-08','2026-10-08','PM_HALF') days"))).rows[0].days,'0.5');
 }finally{await db.close();}});
test('company holidays require trusted Admin/CEO, retain audit, reject stale and official edits',async()=>{const db=await database();try{
 const id=randomUUID(),save=(role:string,version=0,active=true)=>asUser(db,role,tx=>tx.query("select save_company_holiday($1,'2026-10-07','회사 휴일',$2,$3)",[id,version,active]));
 for(const role of ['employee','leader','expense','it','division'])await assert.rejects(save(role),/Denied/);
 await save('admin');await assert.rejects(save('admin'),/STALE/);
 const statutory=(await db.query<{id:string}>("select id from holiday_calendar where day='2026-10-09'")).rows[0].id;
 await assert.rejects(asUser(db,'admin',tx=>tx.query("select save_company_holiday($1,'2026-10-09','forged',1,false)",[statutory])),/Denied/);
 await save('admin',1,false);assert.equal((await db.query('select * from holiday_event where holiday_id=$1',[id])).rows.length,2);
 assert.equal((await asUser(db,'employee',tx=>tx.query('select * from holiday_event'))).rows.length,0);
 for(const table of ['holiday_calendar','holiday_year','holiday_event'])await assert.rejects(asUser(db,'admin',tx=>tx.query('delete from '+table)));
 await db.exec('set role anon');await assert.rejects(db.query("select save_company_holiday($1,'2026-10-08','anon',0,true)",[randomUUID()]));await db.exec('reset role');
 }finally{await db.close();}});
test('calendar edits reject stale previews and changed pending approvals; approved ledger remains exact',async()=>{const db=await database();try{
 const id=randomUUID(),submit=(version:number)=>asUser(db,'employee',tx=>tx.query("select submit_leave_checked($1,'2026-10-26','2026-10-27','FULL_DAY','','',$2)",[id,version]));
 await submit(1);
 await asUser(db,'admin',tx=>tx.query("select save_company_holiday($1,'2026-10-27','New company holiday',0,true)",[randomUUID()]));
 await assert.rejects(asUser(db,'employee',tx=>tx.query("select submit_leave_checked($1,'2026-10-28','2026-10-28','FULL_DAY','','',1)",[randomUUID()])),/STALE/);
 await assert.rejects(asUser(db,'employee',tx=>tx.query("select submit_leave($1,'2026-10-28','2026-10-28','FULL_DAY','','')",[randomUUID()])),/permission/);
 await assert.rejects(asUser(db,'leader',tx=>tx.query("select review_leave($1,'APPROVED','')",[JSON.stringify([{id,version:1}])])),/CALENDAR_CHANGED/);
 assert.equal((await db.query('select * from leave_ledger where request_id=$1',[id])).rows.length,0);
 await asUser(db,'leader',tx=>tx.query("select review_leave($1,'REJECTED','Calendar changed; resubmit')",[JSON.stringify([{id,version:1}])]));
 const next=randomUUID();await asUser(db,'employee',tx=>tx.query("select submit_leave_checked($1,'2026-10-26','2026-10-27','FULL_DAY','','',2)",[next]));
 assert.equal((await db.query<{days:string}>('select days from leave_request where id=$1',[next])).rows[0].days,'1.0');
 const before=JSON.stringify((await db.query('select * from leave_ledger where request_id=$1',[approvedLeaveId])).rows);
 await asUser(db,'admin',tx=>tx.query("select save_company_holiday($1,'2026-10-14','Historical correction',0,true)",[randomUUID()]));
 assert.equal(JSON.stringify((await db.query('select * from leave_ledger where request_id=$1',[approvedLeaveId])).rows),before);
 await asUser(db,'leader',tx=>tx.query("select review_leave($1,'CANCELLED','')",[JSON.stringify([{id:approvedLeaveId,version:2}])]));
 assert.equal((await db.query<{amount_delta:string}>("select amount_delta from leave_ledger where request_id=$1 and event_type='REVERSAL'",[approvedLeaveId])).rows[0].amount_delta,'0.5');
 await assert.rejects(asUser(db,'employee',tx=>tx.query("select leave_summary($1,2026)",[randomUUID()])),/Denied/);
 assert.equal((await asUser(db,'employee',tx=>tx.query("select employee_id from leave_request where employee_id<>$1",[personId]))).rows.length,0);
 }finally{await db.close();}});
test('capability extension preserves independent domains and fails closed on an unknown switch',async()=>{
 const sql=readFileSync('supabase/migrations/20261124221310_leave_holiday_calendar.sql','utf8');
 for(const anchored of [true,false]){const db=await leaveDatabase();try{
  const definition=(await db.query<{definition:string}>("select pg_get_functiondef('public.has_app_capability(text)'::regprocedure) definition")).rows[0].definition;
  await db.exec(definition.replace("when 'LEAVE_MANAGE'",anchored?"when 'HR_CERTIFICATE_MANAGE' then m.roles && array['ADMIN','CEO']::text[] when 'LEAVE_MANAGE'":"when 'UNRECOGNIZED_LEAVE_SWITCH'"));
  if(!anchored){await assert.rejects(db.exec(sql),/Capability switch requires review/);await db.exec('rollback');continue;}
  await db.exec(sql);
  for(const capability of ['HR_CERTIFICATE_MANAGE','HOLIDAY_MANAGE','LEAVE_MANAGE']){
   assert.equal((await asUser(db,'admin',tx=>tx.query<{allowed:boolean}>('select has_app_capability($1) allowed',[capability]))).rows[0].allowed,true);
   assert.equal((await asUser(db,'employee',tx=>tx.query<{allowed:boolean}>('select has_app_capability($1) allowed',[capability]))).rows[0].allowed,false);
  }
 }finally{await db.close();}}
});
