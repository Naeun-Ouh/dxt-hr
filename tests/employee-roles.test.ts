import { test } from 'node:test';
import assert from 'node:assert/strict';
import { domainDatabase, asUser, personId } from './domain-fixture';
import { idFor } from './e2e/fixtures';
import { employeeInput } from '../src/lib/employees/validation';
import { ROLES, can, parseMembership } from '../src/lib/permissions';
const profile = { name: '역할 테스트', company_email: 'roles@example.test', title: '개발자', hire_date: '2026-09-01', employment_status: 'ACTIVE', roles: ['EMPLOYEE','TEAM_LEADER','IT_ADMIN'] };
test('role validation requires approved values and deduplicates multi-select submissions', () => {
 const form = new FormData();
 for (const [key,value] of Object.entries(profile)) if (key !== 'roles') form.set(key,String(value));
 assert.throws(()=>employeeInput(form));
 form.append('roles','EMPLOYEE'); form.append('roles','TEAM_LEADER'); form.append('roles','TEAM_LEADER');
 assert.deepEqual(employeeInput(form).roles,['EMPLOYEE','TEAM_LEADER']);
 form.append('roles','PRIVATE_HR_ACCESS');assert.throws(()=>employeeInput(form));
});
test('domain roles migrate, persist atomically and never grant auth privileges', async () => {
 const db = await domainDatabase();
 const roles = async (id: string) => (await db.query<{role:string}>('select role from employee_role where employee_id=$1 order by role',[id])).rows.map(row=>row.role);
 const readProfile = async (id: string) => (await db.query<{name:string;version:number}>('select name,version from employee where id=$1',[id])).rows[0];
 try {
  // Upgrade of a pre-existing profile gets an ordinary domain role only.
  assert.deepEqual(await roles(personId),['EMPLOYEE']);
  const newId = crypto.randomUUID();
  const beforeMembers = (await db.query('select * from app_memberships order by user_id')).rows;
  const beforeUsers = (await db.query('select * from auth.users order by id')).rows;
  await asUser(db,'admin',tx=>tx.query('select save_employee_profile($1,$2,0)',[newId,profile]));
  assert.deepEqual(await roles(newId),['EMPLOYEE','IT_ADMIN','TEAM_LEADER']);
  assert.equal((await db.query<{auth_user_id:string|null}>('select auth_user_id from employee where id=$1',[newId])).rows[0].auth_user_id,null);
  await asUser(db,'employee',async tx=>assert.equal((await tx.query('select * from employee_role where employee_id=$1',[newId])).rows.length,3));
  for (const name of ['employee','leader','division','expense','it','combined','inactive','unprovisioned']) {
   await assert.rejects(asUser(db,name,tx=>tx.query("insert into employee_role values($1,'CEO')",[newId])));
   await asUser(db,name,async tx=>{
    assert.equal((await tx.query("update employee_role set role='CEO' where employee_id=$1 returning role",[newId])).rows.length,0);
    assert.equal((await tx.query('delete from employee_role where employee_id=$1 returning role',[newId])).rows.length,0);
   });
   await assert.rejects(asUser(db,name,tx=>tx.query('select save_employee_profile($1,$2,1)',[newId,{...profile,roles:['CEO']}])));
  }
  for (const invalid of [[],['UNKNOWN'],['HR_ADMIN'],['PRIVATE_HR_ACCESS'],[null],'CEO',null]) {
   await assert.rejects(asUser(db,'admin',tx=>tx.query('select save_employee_profile($1,$2,1)',[newId,{...profile,name:'must roll back',roles:invalid}])));
  }
  await assert.rejects(asUser(db,'admin',tx=>tx.query("insert into employee_role values($1,'INVALID')",[newId])));
  await assert.rejects(asUser(db,'admin',tx=>tx.query('delete from employee_role where employee_id=$1',[newId])));
  assert.deepEqual(await roles(newId),['EMPLOYEE','IT_ADMIN','TEAM_LEADER']);
  assert.deepEqual(await readProfile(newId),{name:profile.name,version:1});
  await asUser(db,'admin',tx=>tx.query('select save_employee_profile($1,$2,1)',[newId,{...profile,name:'Updated',roles:['EMPLOYEE','CEO']} ]));
  await assert.rejects(asUser(db,'admin',tx=>tx.query('select save_employee_profile($1,$2,1)',[newId,{...profile,roles:['ADMIN']}])));
  assert.deepEqual(await roles(newId),['CEO','EMPLOYEE']);assert.deepEqual(await readProfile(newId),{name:'Updated',version:2});
  // A later ciphertext constraint failure rolls profile AND role replacement back.
  await assert.rejects(asUser(db,'admin',tx=>tx.query('select save_employee_profile($1,$2,2,$3)',[newId,{...profile,roles:['ADMIN']},'plaintext-invalid'])));
  assert.deepEqual(await roles(newId),['CEO','EMPLOYEE']);assert.equal((await readProfile(newId)).version,2);
  const failedId=crypto.randomUUID();
  await assert.rejects(asUser(db,'admin',tx=>tx.query('select save_employee_profile($1,$2,0,$3)',[failedId,{...profile,company_email:'failed@example.test'},'plaintext-invalid'])));
  assert.equal(await readProfile(failedId),undefined);assert.deepEqual(await roles(failedId),[]);
  // Linked ordinary ADMIN assigns CEO in their HR profile: PRIVATE_HR_ACCESS stays denied.
  await db.query('update employee set auth_user_id=$1 where id=$2',[idFor('admin'),newId]);
  await asUser(db,'admin',async tx=>{
   const capability = await tx.query<{allowed:boolean}>("select has_app_capability('PRIVATE_HR_ACCESS') as allowed");assert.equal(capability.rows[0].allowed,false);
   assert.equal((await tx.query('select * from employee_private_hr')).rows.length,0);
   const membership = (await tx.query('select * from app_memberships')).rows[0];
   assert.equal(can(parseMembership(idFor('admin'),membership)!, 'PRIVATE_HR_ACCESS'),false);
  });
  // All seven domain roles may coexist, with no automatic membership changes.
  await asUser(db,'ceo',tx=>tx.query('select save_employee_profile($1,$2,2)',[newId,{...profile,roles:[...ROLES]}]));
  assert.equal((await roles(newId)).length,7);
  assert.deepEqual((await db.query('select * from app_memberships order by user_id')).rows,beforeMembers);
  assert.deepEqual((await db.query('select * from auth.users order by id')).rows,beforeUsers);
  await asUser(db,'inactive',async tx=>assert.equal((await tx.query('select * from employee_role')).rows.length,0));
 } finally { await db.close(); }
});
