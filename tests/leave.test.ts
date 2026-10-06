import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {leaveDatabase,leaveId,peerLeaveId,outsideLeaveId,approvedLeaveId} from './leave-fixture';
import {asUser,personId} from './domain-fixture';
import {colleagueId,outsideId,leaderId} from './project-fixture';
const review=(db:Awaited<ReturnType<typeof leaveDatabase>>,role:string,ids:{id:string;version:number}[],action='APPROVED')=>asUser(db,role,tx=>tx.query('select review_leave($1,$2,$3)',[JSON.stringify(ids),action,'decision note']));
test('leave RLS isolates details, balances, ledger and reasons; calendar is a minimal projection',async()=>{const db=await leaveDatabase();try{
 for(const role of ['employee','expense','it','division']){
  const rows=await asUser(db,role,tx=>tx.query('select * from leave_request'));const payload=JSON.stringify(rows.rows);
  if(role==='employee'){assert.ok(payload.includes('OWN-LEAVE-REASON'));assert.ok(!payload.includes('PEER-LEAVE-SECRET'));assert.ok(!payload.includes('OUTSIDE-LEAVE-SECRET'));}
  if(role!=='expense')await assert.rejects(asUser(db,role,tx=>tx.query('select leave_summary($1,2026)',[colleagueId])));
  assert.equal((await asUser(db,role,tx=>tx.query('select * from leave_ledger where employee_id=$1',[role==='employee'?colleagueId:personId]))).rows.length,0);
  await assert.rejects(review(db,role,[{id:leaveId,version:1}]));
 }
 const calendar=(await asUser(db,'employee',tx=>tx.query<{data:unknown}>("select leave_calendar('2026-10-01') data"))).rows[0].data;
 assert.deepEqual(calendar,[{name:'이동료',start_date:'2026-10-14',end_date:'2026-10-14',unit:'PM_HALF'}]);
 assert.ok(!JSON.stringify(calendar).includes('REASON'));
 const leader=JSON.stringify((await asUser(db,'leader',tx=>tx.query('select * from leave_request'))).rows);
 assert.ok(leader.includes('PEER-LEAVE-SECRET'));assert.ok(!leader.includes('OUTSIDE-LEAVE-SECRET'));
 await assert.rejects(asUser(db,'leader',tx=>tx.query('select leave_summary($1,2026)',[colleagueId])));
 for(const table of ['leave_request','leave_ledger','leave_account','leave_history'])await assert.rejects(asUser(db,'admin',tx=>tx.query('delete from '+table)));
 }finally{await db.close();}});
test('scope-safe bulk decisions are atomic, versioned and ledger-backed; cancellation reverses once',async()=>{const db=await leaveDatabase();try{
 await assert.rejects(review(db,'leader',[{id:leaveId,version:1},{id:outsideLeaveId,version:1}]),/Denied/);
 assert.equal((await db.query<{status:string}>('select status from leave_request where id=$1',[leaveId])).rows[0].status,'PENDING');
 await assert.rejects(review(db,'leader',[{id:leaveId,version:1},{id:randomUUID(),version:1}]),/Denied/);
 await assert.rejects(review(db,'leader',[{id:leaveId,version:1},{id:leaveId,version:1}]));
 await review(db,'leader',[{id:leaveId,version:1},{id:peerLeaveId,version:1}]);
 await assert.rejects(review(db,'leader',[{id:leaveId,version:1}]),/STALE/);
 await assert.rejects(review(db,'employee',[{id:leaveId,version:2}],'CANCELLED'));
 await review(db,'leader',[{id:leaveId,version:2}],'CANCELLED');
 await assert.rejects(review(db,'leader',[{id:leaveId,version:3}],'CANCELLED'));
 assert.deepEqual((await db.query('select amount_delta,event_type from leave_ledger where request_id=$1 order by occurred_at',[leaveId])).rows,[{amount_delta:'-1.0',event_type:'DEDUCTION'},{amount_delta:'1.0',event_type:'REVERSAL'}]);
 const summary=(await asUser(db,'employee',tx=>tx.query<{data:{balance:number}}>('select leave_summary($1,2026) data',[personId]))).rows[0].data;assert.equal(summary.balance,15);
 await review(db,'admin',[{id:outsideLeaveId,version:1}],'REJECTED');
 await assert.rejects(review(db,'admin',[{id:outsideLeaveId,version:2}]));
 }finally{await db.close();}});
test('same-day, past explanation, half-days, weekends, overlap and leader auto-approval',async()=>{const db=await leaveDatabase();try{
 const submit=(role:string,date:string,unit:string,past='',end=date)=>asUser(db,role,tx=>tx.query('select submit_leave($1,$2,$3,$4,$5,$6)',[randomUUID(),date,end,unit,'test',past]));
 await submit('employee','2026-10-06','AM_HALF');await submit('employee','2026-10-06','PM_HALF');
 await assert.rejects(submit('employee','2026-10-06','FULL_DAY'),/OVERLAPPING/);
 await assert.rejects(submit('employee','2026-10-05','FULL_DAY'),/PAST_REASON/);
 await submit('employee','2026-10-05','FULL_DAY','late explanation');
 await assert.rejects(submit('employee','2026-10-10','FULL_DAY'),/NO_WORKDAY/);
 await assert.rejects(submit('employee','2026-12-31','FULL_DAY','','2027-01-01'));
 await assert.rejects(submit('employee','2026-10-07','AM_HALF','','2026-10-08'));
 await submit('leader','2026-10-06','FULL_DAY');
 const r=(await db.query<{id:string;status:string}>('select id,status from leave_request where employee_id=$1',[leaderId])).rows[0];assert.equal(r.status,'APPROVED');
 assert.equal((await db.query('select * from leave_ledger where request_id=$1',[r.id])).rows.length,1);
 assert.deepEqual((await db.query<{action:string}>('select action from leave_history where request_id=$1 order by occurred_at,action',[r.id])).rows.map(r=>r.action).sort(),['AUTO_APPROVED','SUBMITTED']);
 }finally{await db.close();}});
test('manual adjustments require scope/reason/version and insufficient balance fails atomically',async()=>{const db=await leaveDatabase();try{
 const adjust=(role:string,delta:number,reason:string,version:number)=>asUser(db,role,tx=>tx.query('select adjust_leave($1,2026,$2,$3,$4)',[personId,delta,reason,version]));
 for(const role of ['employee','leader','expense','it','division'])await assert.rejects(adjust(role,1,'forged',1));
 await assert.rejects(adjust('admin',1,' ',1));await assert.rejects(adjust('admin',0.1,'invalid',1));
 await adjust('admin',-15,'reconciliation',1);await assert.rejects(adjust('admin',1,'stale',1),/STALE/);
 await assert.rejects(review(db,'leader',[{id:leaveId,version:1}]),/INSUFFICIENT/);
 assert.equal((await db.query<{status:string}>('select status from leave_request where id=$1',[leaveId])).rows[0].status,'PENDING');
 await assert.rejects(asUser(db,'employee',tx=>tx.query("select submit_leave($1,'2026-10-07','2026-10-07','FULL_DAY','','')",[randomUUID()])),/INSUFFICIENT/);
 await adjust('admin',0.5,'restore half day',2);
 await assert.rejects(adjust('admin',-1,'negative',3),/INSUFFICIENT/);
 assert.equal((await db.query('select * from leave_ledger where request_id=$1',[leaveId])).rows.length,0);
 // Loss of role/team membership is checked afresh even with previously obtained request/version.
 await db.query("update employee set department_id=null where id=$1",[leaderId]);
 await assert.rejects(review(db,'leader',[{id:peerLeaveId,version:1}]),/Denied/);
 await db.query("update employee set employment_status='INACTIVE' where id=$1",[outsideId]);
 await assert.rejects(review(db,'admin',[{id:outsideLeaveId,version:1}]),/INACTIVE/);
 assert.equal((await db.query('select * from leave_ledger where request_id=$1',[approvedLeaveId])).rows.length,1);
 }finally{await db.close();}});

test('competing approval attempts deduct once; failed multi-request balance checks roll back the batch',async()=>{const db=await leaveDatabase();try{
 const outcomes=await Promise.allSettled([review(db,'leader',[{id:leaveId,version:1}]),review(db,'leader',[{id:leaveId,version:1}])]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await db.query("select * from leave_ledger where request_id=$1 and event_type='DEDUCTION'",[leaveId])).rows.length,1);
 // Two pending requests can exist, but the serialized approval cannot overdraw.
 const a=randomUUID(),b=randomUUID();
 for(const [id,date] of [[a,'2026-10-26'],[b,'2026-10-27']])await asUser(db,'employee',tx=>tx.query("select submit_leave($1,$2,$2,'FULL_DAY','','')",[id,date]));
 await asUser(db,'admin',tx=>tx.query("select adjust_leave($1,2026,-13,'Reconcile remaining allowance',2)",[personId]));
 await assert.rejects(review(db,'leader',[{id:a,version:1},{id:b,version:1}]),/INSUFFICIENT/);
 assert.equal((await db.query("select * from leave_request where id in ($1,$2) and status='PENDING'",[a,b])).rows.length,2);
 assert.equal((await db.query('select * from leave_ledger where request_id in ($1,$2)',[a,b])).rows.length,0);
 }finally{await db.close();}});
