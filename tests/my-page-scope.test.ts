import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {assetTransferDatabase} from './asset-transfer-fixture';
import {asUser,personId} from './domain-fixture';
import {colleagueId} from './project-fixture';
import {idFor} from './e2e/fixtures';
import {assetValues} from './asset-fixture';
test('self identity and asset/contract scopes remain narrow for personal views and explicit for managers',async()=>{
 const db=await assetTransferDatabase();try{
 for(const role of ['employee','leader']){
  assert.equal((await asUser(db,role,tx=>tx.query('select id from asset where current_holder_id=$1',[colleagueId]))).rows.length,0);
  assert.equal((await asUser(db,role,tx=>tx.query('select id from employment_contract where employee_id=$1',[colleagueId]))).rows.length,0);
  assert.equal((await asUser(db,role,tx=>tx.query('select id from expense_claim where employee_id=$1',[colleagueId]))).rows.length,0);
 }
 const published=randomUUID(),draft=randomUUID(),future=randomUUID();
 for(const [id,title,date] of [[published,'Home published','2020-01-01'],[draft,'Home draft',null],[future,'Home future','2099-01-01']])await db.query('insert into announcement(id,title,body,author_id,author_name,published_at) values($1,$2,$3,$4,$5,$6)',[id,title,'Body must not be selected',idFor('admin'),'Admin',date]);
 for(const role of ['employee','leader','admin','ceo']){
  const visible=await asUser(db,role,tx=>tx.query<{id:string}>('select id,title,published_at from announcement where published_at<=now() order by published_at desc,id desc limit 3'));
  assert(visible.rows.some(r=>r.id===published));assert(!visible.rows.some(r=>r.id===draft||r.id===future));assert(visible.rows.every(r=>!('body' in r)));
 }
 const own=randomUUID(),asset=randomUUID();await db.transaction(async tx=>{await tx.query("insert into employee(id,name,company_email,title,hire_date,auth_user_id) values($1,'Synthetic admin','own-admin@example.test','관리자','2025-01-01',$2)",[own,idFor('admin')]);await tx.query("insert into employee_role(employee_id,role) values($1,'EMPLOYEE')",[own]);});
 await asUser(db,'admin',tx=>tx.query('select save_asset($1,$2,0)',[asset,{...assetValues,current_holder_id:own,serial_number:'ADMIN-OWN-SYNTHETIC'}]));
 const rows=await asUser(db,'admin',tx=>tx.query<{id:string}>('select id from asset where current_holder_id=current_employee_id()'));assert.deepEqual(rows.rows,[{id:asset}]);
 assert.equal((await asUser(db,'admin',tx=>tx.query('select id from asset where current_holder_id=$1',[personId]))).rows.length,1);
 assert.equal((await asUser(db,'admin',tx=>tx.query('select id from employment_contract where employee_id=current_employee_id()'))).rows.length,0);
 assert.equal((await asUser(db,'admin',tx=>tx.query('select id from employment_contract'))).rows.length,2);
 assert.equal((await asUser(db,'admin',tx=>tx.query<{id:string}>('select current_employee_id() id'))).rows[0].id,own);
 assert.equal((await asUser(db,'admin',tx=>tx.query('select id from expense_claim where employee_id=current_employee_id()'))).rows.length,0);
 assert((await asUser(db,'admin',tx=>tx.query('select id from expense_claim'))).rows.length>=2);
 }finally{await db.close();}
});
