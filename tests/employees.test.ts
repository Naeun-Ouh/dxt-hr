import { test } from 'node:test';
import assert from 'node:assert/strict';
import { domainDatabase, asUser, personId, departmentId, ring } from './domain-fixture';
import { encryptValue, decryptValue, parseKeyring } from '../src/lib/employees/encryption';
import { employeeInput, privateInput, validDate } from '../src/lib/employees/validation';
import { emptyPrivate } from '../src/lib/employees/types';
import { idFor } from './e2e/fixtures';
test('authenticated encryption binds values to employee and field, detects tampering and supports rotation',()=>{
 const c=encryptValue('private-test',personId+':private',ring);
 assert(!c.includes('private-test')); assert.notEqual(c,encryptValue('private-test',personId+':private',ring));
 assert.equal(decryptValue(c,personId+':private',ring),'private-test');
 assert.throws(()=>decryptValue(c,personId+':birth',ring));
 const parts=c.split('.'); parts[3]=(parts[3][0]==='A'?'B':'A')+parts[3].slice(1);
 assert.throws(()=>decryptValue(parts.join('.'),personId+':private',ring));
 const next={activeId:'next',keys:{...ring.keys,next:Buffer.alloc(32,8)}};
 assert.equal(decryptValue(c,personId+':private',next),'private-test');
 assert.throws(()=>decryptValue(c,personId+':private',{activeId:'next',keys:{next:next.keys.next}}));
 assert.throws(()=>parseKeyring('{}','missing')); assert.throws(()=>parseKeyring('{"test":"abc"}','test'));
});
test('validation rejects malformed dates and private data; employee payload validates domain roles and cannot assign auth identities',()=>{
 assert(!validDate('2026-02-30')); assert(validDate('2024-02-29'));
 const f=new FormData(); for(const [k,v] of Object.entries({name:' Test ',company_email:'TEST@EXAMPLE.TEST',title:'Dev',hire_date:'2026-01-01',employment_status:'ACTIVE',roles:'CEO',auth_user_id:idFor('employee')})) f.set(k,v);
 const input=employeeInput(f); assert.equal(input.company_email,'test@example.test'); assert.deepEqual(input.roles,['CEO']);assert(!('auth_user_id' in input));
 f.set('hire_date','2026-02-30'); assert.throws(()=>employeeInput(f));
 const p=new FormData();p.set('salary','-1'); assert.throws(()=>privateInput(p,emptyPrivate()));
 p.set('salary','');assert.equal(privateInput(p,{...emptyPrivate(),salary:'123'}).salary,'123');p.set('clear_salary','on');assert.equal(privateInput(p,{...emptyPrivate(),salary:'123'}).salary,'');
});
test('domain RLS, atomic changes, private encryption, audit and inactive linked accounts',async()=>{
 const db=await domainDatabase();
 try {
  for(const name of ['employee','leader','division','expense','it','combined','admin','ceo','designated','privateCeo']) await asUser(db,name,async tx=>{
   assert.equal((await tx.query('select * from employee')).rows.length,1);
   const allowed=['ceo','designated','privateCeo'].includes(name);
   assert.equal((await tx.query('select * from employee_private_hr')).rows.length,allowed?1:0);
   assert.equal((await tx.query('select * from employee_birth_detail')).rows.length,allowed||name==='admin'?1:0);
  });
  for(const name of ['employee','leader','division','expense','it','combined','inactive','unprovisioned']) {
   await assert.rejects(asUser(db,name,tx=>tx.query('select save_employee_profile($1,$2,0)',[crypto.randomUUID(),{name:'X',company_email:'x@example.test',title:'T',hire_date:'2026-01-01',employment_status:'ACTIVE',roles:['EMPLOYEE']}])));
   await assert.rejects(asUser(db,name,tx=>tx.query('select record_private_hr_view($1)',[personId])));
   await assert.rejects(asUser(db,name,tx=>tx.query('select record_birth_view($1)',[personId])));
   await assert.rejects(asUser(db,name,tx=>tx.query("insert into organization(name) values ('forbidden')")));
  }
  await assert.rejects(asUser(db,'admin',tx=>tx.query('select save_private_hr($1,$2,1)',[personId,encryptValue('{}',personId+':private',ring)])));
  await assert.rejects(asUser(db,'admin',tx=>tx.query('update employee set auth_user_id=$1 where id=$2',[idFor('admin'),personId])));
  await assert.rejects(asUser(db,'ceo',tx=>tx.exec("update app_memberships set roles=array['CEO']")));
  await assert.rejects(asUser(db,'ceo',tx=>tx.exec("insert into audit_log(action,entity_type,entity_id) values('FORGED','employee',gen_random_uuid())")));
  const profile={name:'수정테스트',company_email:'new@example.test',title:'직책',hire_date:'2026-01-01',employment_status:'ACTIVE',roles:['EMPLOYEE']};
  const newId=crypto.randomUUID();
  await assert.rejects(asUser(db,'ceo',tx=>tx.query('select save_employee_profile($1,$2,0,null,false,$3)',[newId,profile,'plaintext-secret'])));
  assert.equal((await db.query('select id from employee where id=$1',[newId])).rows.length,0);
  await asUser(db,'admin',tx=>tx.query('select save_employee_profile($1,$2,0)',[newId,profile]));
  await assert.rejects(asUser(db,'admin',tx=>tx.query('select save_employee_profile($1,$2,0)',[crypto.randomUUID(),{...profile,company_email:'NEW@example.test'}])));
  await asUser(db,'admin',tx=>tx.query('select save_employee_profile($1,$2,1)',[newId,{...profile,name:'최신'}]));
  await assert.rejects(asUser(db,'admin',tx=>tx.query('select save_employee_profile($1,$2,1)',[newId,profile])));
  await asUser(db,'ceo',tx=>tx.query('select save_private_hr($1,$2,1)',[personId,encryptValue('{"salary":"42"}',personId+':private',ring)]));
  await assert.rejects(asUser(db,'ceo',tx=>tx.query('select save_private_hr($1,$2,1)',[personId,encryptValue('{}',personId+':private',ring)])));
  await asUser(db,'designated',tx=>tx.query('select record_private_hr_view($1)',[personId]));
  await asUser(db,'admin',tx=>tx.query('select record_birth_view($1)',[personId]));
  const logs=await db.query<{action:string;actor_id:string}>('select * from audit_log'); assert(logs.rows.some(r=>r.action==='REVEAL'&&r.actor_id===idFor('designated')));
  assert(!JSON.stringify(logs.rows).includes('salary'));assert(!JSON.stringify(logs.rows).includes('plaintext-secret'));
  const child=crypto.randomUUID();await asUser(db,'admin',tx=>tx.query("insert into organization(id,name,parent_id) values($1,'하위',$2)",[child,departmentId]));
  await assert.rejects(asUser(db,'admin',tx=>tx.query('update organization set parent_id=$1 where id=$2',[child,departmentId])));
  await db.query("update employee set auth_user_id=$1,employment_status='INACTIVE' where id=$2",[idFor('ceo'),personId]);
  await asUser(db,'ceo',async tx=>{assert.equal((await tx.query('select * from employee')).rows.length,0);assert.equal((await tx.query('select * from employee_private_hr')).rows.length,0);});
  await assert.rejects(asUser(db,'ceo',tx=>tx.query('select record_private_hr_view($1)',[personId])));
 } finally { await db.close(); }
});
