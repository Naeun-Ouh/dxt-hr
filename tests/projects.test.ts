import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { asUser, personId } from './domain-fixture';
import { projectDatabase,projectId,assignmentId,otherAssignmentId,careerId,projectValues,assignmentValues,careerValues,outsideId } from './project-fixture';
import { coveredPeriods } from '../src/lib/projects/coverage';
import { projectInput } from '../src/lib/projects/validation';

test('coverage unions overlaps, adjacency, leap days and clips to the selected year',()=>{
 assert.deepEqual(coveredPeriods([{start_date:'2025-10-01',end_date:'2026-06-30'},{start_date:'2026-04-01',end_date:'2026-09-30'},{start_date:'2027-01-01',end_date:'2027-01-02'}],2026),{days:273,periods:[{start_date:'2026-01-01',end_date:'2026-09-30'}]});
 assert.equal(coveredPeriods([{start_date:'2024-02-28',end_date:'2024-02-29'},{start_date:'2024-03-01',end_date:'2024-03-01'},{start_date:'2024-02-29',end_date:'2024-02-29'}],2024).days,3);
 assert.equal(coveredPeriods([],2026).days,0); assert.throws(()=>coveredPeriods([],NaN));
});
test('project validation rejects impossible dates, invalid status and forged selectors',()=>{
 const form=new FormData(); for(const [k,v] of Object.entries(projectValues))form.set(k,v);
 assert.equal(projectInput('project',form).name,'LIMS 고도화');
 form.set('start_date','2026-02-30'); assert.throws(()=>projectInput('project',form));
 form.set('start_date','2026-01-01');form.set('pm_employee_id','forged');assert.throws(()=>projectInput('project',form));
 form.set('pm_employee_id',personId);form.set('status','UNKNOWN');assert.throws(()=>projectInput('project',form));
});
test('project row policies and checked RPCs deny cross-user and specialist escalation',async()=>{
 const db=await projectDatabase();
 try {
  const own=await asUser(db,'employee',tx=>tx.query<{employee_id:string}>('select * from project_assignment'));
  assert.equal(own.rows.length,2); assert.ok(own.rows.every(a=>a.employee_id===personId));
  assert.equal((await asUser(db,'employee',tx=>tx.query('select * from project_assignment where id=$1',[otherAssignmentId]))).rows.length,0);
  const team=await asUser(db,'leader',tx=>tx.query<{employee_id:string}>('select * from project_assignment'));
  assert.equal(team.rows.length,3); assert.ok(team.rows.every(a=>a.employee_id!==outsideId));
  for(const user of ['employee','leader','division','expense','it','inactive','unprovisioned']) {
   await assert.rejects(asUser(db,user,tx=>tx.query('select save_project($1,$2,0)',[randomUUID(),projectValues])));
   await assert.rejects(asUser(db,user,tx=>tx.query('select save_assignment($1,$2,0)',[randomUUID(),assignmentValues])));
   await assert.rejects(asUser(db,user,tx=>tx.query("select delete_project_record('project',$1,1)",[projectId])));
  }
  for(const user of ['expense','admin','ceo']) {
   assert.equal((await asUser(db,user,tx=>tx.query('select * from career where id=$1',[careerId]))).rows.length,0);
   await assert.rejects(asUser(db,user,tx=>tx.query('select save_career($1,$2,1)',[careerId,careerValues])));
  }
  await assert.rejects(asUser(db,'employee',tx=>tx.query('select save_career($1,$2,0)',[randomUUID(),{...careerValues,assignment_id:otherAssignmentId}])));
  await assert.rejects(asUser(db,'expense',tx=>tx.query('select save_career($1,$2,1)',[careerId,{...careerValues,assignment_id:otherAssignmentId}])));
  assert.equal((await db.query<{employee_id:string}>('select employee_id from career where id=$1',[careerId])).rows[0].employee_id,personId);
  await assert.rejects(asUser(db,'employee',tx=>tx.query("update career set role='tampered' where id=$1",[careerId])));
  await assert.rejects(asUser(db,'admin',tx=>tx.query("update project set current_end_date='2027-12-31' where id=$1",[projectId])));
  await db.query('update employee set department_id=null where auth_user_id=(select user_id from app_memberships where roles @> array[\'TEAM_LEADER\'] limit 1)');
  assert.equal((await asUser(db,'leader',tx=>tx.query<{employee_id:string}>('select * from project_assignment'))).rows.length,0);
 } finally {await db.close();}
});
test('project and assignment CRUD is versioned, atomic and retains career/history',async()=>{
 const db=await projectDatabase();
 try {
  const fresh=randomUUID(); await asUser(db,'ceo',tx=>tx.query('select save_project($1,$2,0)',[fresh,projectValues]));
  const freshAssignment=randomUUID();await asUser(db,'admin',tx=>tx.query('select save_assignment($1,$2,0)',[freshAssignment,{...assignmentValues,project_id:fresh}]));
  await asUser(db,'admin',tx=>tx.query('select save_assignment($1,$2,1)',[freshAssignment,{...assignmentValues,project_id:fresh,role:'Updated'}]));
  await assert.rejects(asUser(db,'admin',tx=>tx.query('select save_assignment($1,$2,1)',[freshAssignment,{...assignmentValues,project_id:fresh}])));
  await asUser(db,'admin',tx=>tx.query("select delete_project_record('assignment',$1,2)",[freshAssignment]));
  await asUser(db,'admin',tx=>tx.query("select delete_project_record('project',$1,1)",[fresh]));
  await asUser(db,'admin',tx=>tx.query('select save_project($1,$2,1)',[projectId,{...projectValues,current_end_date:'2027-03-31'}]));
  await asUser(db,'admin',tx=>tx.query('select save_project($1,$2,2)',[projectId,{...projectValues,current_end_date:'2027-06-30',reason:'계약 연장'}]));
  assert.equal((await db.query('select * from project_extension')).rows.length,2);
  await assert.rejects(asUser(db,'admin',tx=>tx.query('select save_project($1,$2,3)',[projectId,{...projectValues,current_end_date:'2026-02-01'}])));
  assert.equal((await db.query<{version:number}>('select version from project where id=$1',[projectId])).rows[0].version,3);
  assert.equal((await db.query('select * from project_extension')).rows.length,2);
  await assert.rejects(asUser(db,'admin',tx=>tx.query('select save_assignment($1,$2,0)',[randomUUID(),{...assignmentValues,end_date:'2028-01-01'}])));
  await assert.rejects(asUser(db,'admin',tx=>tx.query("select delete_project_record('assignment',$1,1)",[assignmentId])));
  await assert.rejects(asUser(db,'admin',tx=>tx.query("select delete_project_record('project',$1,3)",[projectId])));
  const ownNew=randomUUID();await asUser(db,'employee',tx=>tx.query('select save_career($1,$2,0)',[ownNew,{...careerValues,employee_id:outsideId}]));
  assert.equal((await db.query<{employee_id:string}>('select employee_id from career where id=$1',[ownNew])).rows[0].employee_id,personId);
  await asUser(db,'employee',tx=>tx.query('select save_career($1,$2,1)',[ownNew,{...careerValues,responsibilities:'Updated during project'}]));
  await assert.rejects(asUser(db,'employee',tx=>tx.query('select save_career($1,$2,1)',[ownNew,careerValues])));
  await db.query("update employee set employment_status='INACTIVE' where id=$1",[personId]);
  assert.equal((await asUser(db,'employee',tx=>tx.query('select * from career'))).rows.length,0);
  assert.equal((await db.query('select * from career where employee_id=$1',[personId])).rows.length,2);
 } finally {await db.close();}
});

test('career team read is independent of project management and never grants team writes',async()=>{
 const db=await projectDatabase();
 try {
  const outCareer='50000000-0000-4000-8000-000000000003';
  const teamRows=await asUser(db,'leader',tx=>tx.query<{id:string}>('select id from career order by id'));
  assert.deepEqual(teamRows.rows.map(r=>r.id),[careerId,'50000000-0000-4000-8000-000000000002']);
  assert.equal((await asUser(db,'leader',tx=>tx.query('select * from career where id=$1',[outCareer]))).rows.length,0);
  for(const user of ['employee','expense','it','division','admin','ceo','inactive','unprovisioned']) {
   const target=user==='employee'?'50000000-0000-4000-8000-000000000002':careerId;
   assert.equal((await asUser(db,user,tx=>tx.query('select * from career where id=$1',[target]))).rows.length,0);
  }
  await assert.rejects(asUser(db,'leader',tx=>tx.query('select save_career($1,$2,1)',[careerId,careerValues])));
  await assert.rejects(asUser(db,'leader',tx=>tx.query('select save_career($1,$2,0)',[randomUUID(),careerValues])));
  await assert.rejects(asUser(db,'leader',tx=>tx.query("update career set role='tampered' where id=$1",[careerId])));
  // Owning an assignment still does not let the leader retarget someone else's career.
  const leader='10000000-0000-4000-8000-000000000004', ownAssignment=randomUUID();
  await db.query("insert into project_assignment(id,project_id,employee_id,start_date,end_date,role,status) values($1,$2,$3,'2026-01-01','2026-02-01','PM','ACTIVE')",[ownAssignment,projectId,leader]);
  const ownValues={...careerValues,assignment_id:ownAssignment},ownCareer=randomUUID();
  await asUser(db,'leader',tx=>tx.query('select save_career($1,$2,0)',[ownCareer,ownValues]));
  await asUser(db,'leader',tx=>tx.query('select save_career($1,$2,1)',[ownCareer,ownValues]));
  await assert.rejects(asUser(db,'leader',tx=>tx.query('select save_career($1,$2,1)',[careerId,ownValues])));
  await db.query('update employee set department_id=null where id=$1',[leader]);
  assert.deepEqual((await asUser(db,'leader',tx=>tx.query<{id:string}>('select id from career'))).rows.map(r=>r.id),[ownCareer]);
  await db.query("update employee set employment_status='INACTIVE' where id=$1",[leader]);
  assert.equal((await asUser(db,'leader',tx=>tx.query('select * from career'))).rows.length,0);
 } finally {await db.close();}
});
