import { readFileSync } from 'node:fs';
import { operationsDatabase } from './operations-fixture';
import { asUser,personId } from './domain-fixture';
import { colleagueId,outsideId,leaderId } from './project-fixture';
export const leaveId='b0000000-0000-4000-8000-000000000001',peerLeaveId='b0000000-0000-4000-8000-000000000002',outsideLeaveId='b0000000-0000-4000-8000-000000000003',approvedLeaveId='b0000000-0000-4000-8000-000000000004';
export async function leaveDatabase(){
 const db=await operationsDatabase();await db.exec(readFileSync('supabase/migrations/202610060012_basic_leave.sql','utf8'));
 await db.exec("create or replace function public.leave_today() returns date language sql stable as $$select date '2026-10-06'$$");
 for(const id of [personId,colleagueId,outsideId,leaderId])await asUser(db,'admin',tx=>tx.query("select adjust_leave($1,2026,15,'Initial imported entitlement',0)",[id]));
 for(const [id,role,date,unit,reason] of [[leaveId,'employee','2026-10-20','FULL_DAY','OWN-LEAVE-REASON'],[peerLeaveId,'expense','2026-10-21','AM_HALF','PEER-LEAVE-SECRET'],[outsideLeaveId,'it','2026-10-22','FULL_DAY','OUTSIDE-LEAVE-SECRET'],[approvedLeaveId,'expense','2026-10-14','PM_HALF','CALENDAR-PRIVATE-REASON']]){
  await asUser(db,role,tx=>tx.query('select submit_leave($1,$2,$2,$3,$4,$5)',[id,date,unit,reason,'']));
 }
 await asUser(db,'leader',tx=>tx.query("select review_leave($1,'APPROVED','')",[JSON.stringify([{id:approvedLeaveId,version:1}])]));
 return db;
}
