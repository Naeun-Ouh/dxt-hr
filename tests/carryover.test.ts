import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {leaveDatabase} from './leave-fixture';
import {asUser,personId} from './domain-fixture';
import {colleagueId,secondProjectId} from './project-fixture';
import {carryoverGuidance,type CarryoverCase} from '../src/lib/carryover/types';
async function setup(date='2026-11-30'){const db=await leaveDatabase();await db.exec(readFileSync('supabase/migrations/20261125133312_carryover_review.sql','utf8'));await db.exec(`create or replace function public.leave_today() returns date language sql stable as $$select date '${date}'$$`);return db;}
const capture=(db:Awaited<ReturnType<typeof setup>>,employee=personId,mode='NOV30_SNAPSHOT',version=0,role='admin',year=2026)=>asUser(db,role,tx=>tx.query<{id:string}>('select capture_carryover_evidence($1,$2,$3,$4,$5,$6,$7) as id',[employee,year,mode,'검증 원본: 11월 30일 투입대장 17행',`${year}-12-20`,version,true]));
test('Nov30 captures actual active paid-project evidence; snapshots and review never change leave balances',async()=>{const db=await setup();try{
 const ledger=(await db.query('select * from leave_ledger order by id')).rows;
 await db.query("update employee set employment_status='INACTIVE' where id=$1",[personId]);await assert.rejects(()=>capture(db),/INACTIVE_EMPLOYEE/);await db.query("update employee set employment_status='ACTIVE' where id=$1",[personId]);
 const employeeBefore=(await db.query<{hire_date:string;version:number}>("select hire_date::text,version from employee where id=$1",[personId])).rows[0];
 await db.query("update employee set hire_date='2026-12-01' where id=$1",[personId]);await assert.rejects(()=>capture(db),/EMPLOYEE_NOT_HIRED_AT_CUTOFF/);assert.equal((await db.query('select * from leave_carryover_case')).rows.length,0);
 await db.query('update employee set hire_date=$1 where id=$2',[employeeBefore.hire_date,personId]);
 const id=(await capture(db)).rows[0].id;
 const first=(await db.query<{snapshot:{employee:{id:string;hire_date:string;employment_status:string;version:number};assignments:{project_id:string}[]}}>('select snapshot from leave_carryover_evidence')).rows[0];assert.equal(first.snapshot.assignments.length,1);assert.equal(first.snapshot.assignments[0].project_id,secondProjectId);assert.deepEqual(first.snapshot.employee,{id:personId,hire_date:employeeBefore.hire_date,employment_status:'ACTIVE',version:employeeBefore.version});
 await db.query("update employee set hire_date='2025-02-01',version=version+1 where id=$1",[personId]);
 await db.query("update project set name='변경된 프로젝트',current_end_date='2027-02-28' where id=$1",[secondProjectId]);
 assert.deepEqual((await db.query('select snapshot from leave_carryover_evidence')).rows[0],first);
 await asUser(db,'admin',tx=>tx.query("select review_carryover_candidate($1,1,'CONFIRMED','기준일 근거 확인, 잔액은 연말 대조')",[id]));
 await assert.rejects(()=>asUser(db,'admin',tx=>tx.query("select review_carryover_candidate($1,1,'CONFIRMED','중복')",[id])));
 await capture(db,personId,'NOV30_SNAPSHOT',2);
 const c=(await db.query<CarryoverCase>('select *, project_end::text from leave_carryover_case')).rows[0];assert.equal(c.state,'NEEDS_REVIEW');assert.equal(c.version,3);assert.equal(c.project_end,'2027-02-28');assert.equal((await db.query('select * from leave_carryover_evidence')).rows.length,2);
 await assert.rejects(()=>db.query('delete from leave_carryover_evidence'));await assert.rejects(()=>db.query("update leave_carryover_review_event set note='changed'"));
 assert.deepEqual((await db.query('select * from leave_ledger order by id')).rows,ledger);
}finally{await db.close();}});
test('historical current ACTIVE is not proof; dated manual attestation required and no future candidate',async()=>{const db=await setup('2026-12-01');try{
 await assert.rejects(()=>capture(db),/HISTORICAL_SOURCE_REQUIRED/);
 await assert.rejects(()=>asUser(db,'admin',tx=>tx.query("select capture_carryover_evidence($1,2026,'MANUAL_RECONCILIATION','원본을 확인하지 않음','2026-12-20',0,false)",[personId])),/DATED_SOURCE_REQUIRED/);
 await assert.rejects(()=>capture(db,personId,'MANUAL_RECONCILIATION',0,'admin',2027),/NOV30_NOT_REACHED/);
 const id=(await capture(db,personId,'MANUAL_RECONCILIATION')).rows[0].id;
 const evidence=(await db.query<{snapshot:Record<string,unknown>}>('select snapshot from leave_carryover_evidence')).rows[0].snapshot;assert.equal(evidence.assignments,undefined);assert.equal(evidence.source_reference,'검증 원본: 11월 30일 투입대장 17행');
 await asUser(db,'admin',tx=>tx.query("select review_carryover_candidate($1,1,'NOT_ELIGIBLE','원본 재검토 결과 비대상')",[id]));
 await assert.rejects(()=>capture(db,personId,'MANUAL_RECONCILIATION'),/STALE_CARRYOVER/);
}finally{await db.close();}});
test('cross-user and Team Leader cannot read evidence/review or create/review candidates, own status only',async()=>{const db=await setup();try{
 const id=(await capture(db)).rows[0].id;await capture(db,colleagueId);
 for(const role of ['employee','leader','expense','it','division']){
 await assert.rejects(()=>capture(db,personId,'MANUAL_RECONCILIATION',1,role));
 await assert.rejects(()=>asUser(db,role,tx=>tx.query("select review_carryover_candidate($1,1,'CONFIRMED','forged')",[id])));
 assert.equal((await asUser(db,role,tx=>tx.query('select * from leave_carryover_evidence'))).rows.length,0);
 assert.equal((await asUser(db,role,tx=>tx.query('select * from leave_carryover_review_event'))).rows.length,0);
 await assert.rejects(()=>asUser(db,role,tx=>tx.query("update leave_carryover_case set state='CONFIRMED' where id=$1",[id])));
 }
 assert.equal((await asUser(db,'employee',tx=>tx.query('select * from leave_carryover_case'))).rows.length,1);
 assert.equal((await asUser(db,'leader',tx=>tx.query('select * from leave_carryover_case'))).rows.length,0);
 assert.equal((await asUser(db,'expense',tx=>tx.query('select * from leave_carryover_case where id=$1',[id]))).rows.length,0);
 await assert.rejects(()=>db.transaction(async tx=>{await tx.exec('set local role anon');await tx.query('select * from leave_carryover_case');}));
}finally{await db.close();}});
test('plain guidance separates December completion and continuation without limits or entitlement claims',()=>{const base={year:2026,state:'CONFIRMED'} as CarryoverCase;assert.match(carryoverGuidance({...base,project_end:'2026-12-20'}),/종료 후/);assert.match(carryoverGuidance({...base,project_end:'2027-02-20'}),/연말까지/);assert.match(carryoverGuidance({...base,state:'NOT_ELIGIBLE',project_end:'2026-12-20'}),/비대상/);});
