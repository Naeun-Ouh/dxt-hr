import test from 'node:test';
import assert from 'node:assert/strict';
import { contractsDatabase,contractId,otherContractId,contractHash,contractItem,contractBody } from './contracts-fixture';
import { asUser,personId } from './domain-fixture';
import { asService } from './operations-fixture';
import { colleagueId } from './project-fixture';
import { idFor } from './e2e/fixtures';
import { contractPdf } from '../src/lib/contracts/pdf';
import type { Contract,Signature } from '../src/lib/contracts/types';
const denied=async(fn:()=>Promise<unknown>)=>{await assert.rejects(fn);};
test('contract RLS isolates UUID, history, signatures, templates and team scope',async()=>{const db=await contractsDatabase();try{
 for(const role of ['employee','leader','it','expense']){
 const rows=await asUser(db,role,tx=>tx.query('select id from employment_contract where id=$1',[role==='expense'?contractId:otherContractId]));assert.equal(rows.rows.length,0);
 for(const table of ['employment_contract_version','employment_contract_event','employment_contract_signature'])assert.equal((await asUser(db,role,tx=>tx.query(`select * from ${table} where contract_id=$1`,[role==='expense'?contractId:otherContractId]))).rows.length,0);
 }
 assert.equal((await asUser(db,'admin',tx=>tx.query('select * from employment_contract'))).rows.length,2);
 assert.equal((await asUser(db,'admin',tx=>tx.query('select * from employment_contract_version'))).rows.length,0);
 assert.equal((await asUser(db,'employee',tx=>tx.query('select * from employment_contract_version'))).rows.length,1);
 await denied(()=>asUser(db,'employee',tx=>tx.query('update employment_contract set employee_id=$1 where id=$2',[colleagueId,contractId])));
 await denied(()=>asUser(db,'employee',tx=>tx.query('select create_employment_contracts($1,null)',[JSON.stringify([contractItem('c0000000-0000-4000-8000-000000000099',colleagueId)])])));
}finally{await db.close();}});
test('only the actual Google-linked employee signs; role and UUID forgery fail',async()=>{const db=await contractsDatabase();try{
 for(const role of ['employee','leader','admin','ceo','designated'])await denied(()=>asUser(db,role,tx=>tx.query('select sign_employee_contract($1,1,$2,true)',[otherContractId,contractHash])));
 await denied(()=>asUser(db,'employee',tx=>tx.query('select sign_company_contract($1,1,$2,true)',[contractId,contractHash])));
 await denied(()=>asUser(db,'employee',tx=>tx.query('select sign_employee_contract($1,0,$2,true)',[contractId,contractHash])));
 await denied(()=>asUser(db,'employee',tx=>tx.query('select sign_employee_contract($1,1,$2,false)',[contractId,contractHash])));
 await denied(()=>asUser(db,'employee',tx=>tx.query('select sign_employee_contract($1,1,$2,true)',[contractId,'a'.repeat(64)])));
 await db.query('delete from auth.identities where user_id=$1',[idFor('employee')]);
 await denied(()=>asUser(db,'employee',tx=>tx.query('select sign_employee_contract($1,1,$2,true)',[contractId,contractHash])));
}finally{await db.close();}});
test('version history, immutable snapshot, atomic bulk rollback and terminal cancellation',async()=>{const db=await contractsDatabase();try{
 const id='c0000000-0000-4000-8000-000000000003';
 await asUser(db,'designated',tx=>tx.query('select create_employment_contracts($1,null)',[JSON.stringify([contractItem(id)])]));
 await db.query("update employee set name='새 이름' where id=$1",[personId]);
 const snap=await db.query<{employee_snapshot:{name:string}}>('select employee_snapshot from employment_contract where id=$1',[id]);assert.equal(snap.rows[0].employee_snapshot.name,'김테스트');
 await asUser(db,'designated',tx=>tx.query('select revise_employment_contract($1,1,$2,$3)',[id,contractItem(id,personId,2).body,contractHash]));
 assert.equal((await db.query('select * from employment_contract_version where contract_id=$1',[id])).rows.length,2);
 for(const action of ['READY_TO_SEND','SENT'])await asUser(db,'designated',tx=>tx.query('select transition_employment_contract($1,2,$2)',[id,action]));
 await denied(()=>asUser(db,'employee',tx=>tx.query('select sign_employee_contract($1,1,$2,true)',[id,contractHash])));
 await asUser(db,'admin',tx=>tx.query("select transition_employment_contract($1,2,'CANCELLED')",[id]));
 await denied(()=>asUser(db,'employee',tx=>tx.query('select sign_employee_contract($1,2,$2,true)',[id,contractHash])));
 const batchId='c0000000-0000-4000-8000-000000000004';await denied(()=>asUser(db,'designated',tx=>tx.query('select create_employment_contracts($1,null)',[JSON.stringify([contractItem(batchId),contractItem(batchId)])])));assert.equal((await db.query('select * from employment_contract where id=$1',[batchId])).rows.length,0);
}finally{await db.close();}});
test('signatures replay safely, server timestamps, PDF finalization and immutable completed records',async()=>{const db=await contractsDatabase();try{
 await denied(()=>asUser(db,'ceo',tx=>tx.query('select sign_company_contract($1,1,$2,true)',[contractId,contractHash])));
 for(let i=0;i<3;i++)await asUser(db,'employee',tx=>tx.query('select sign_employee_contract($1,1,$2,true)',[contractId,contractHash]));
 for(let i=0;i<3;i++)await asUser(db,'ceo',tx=>tx.query('select sign_company_contract($1,1,$2,true)',[contractId,contractHash]));
 assert.equal((await db.query('select * from employment_contract_signature where contract_id=$1',[contractId])).rows.length,2);
 assert.equal((await db.query("select * from employment_contract_event where contract_id=$1 and action='EMPLOYEE_SIGNED'",[contractId])).rows.length,1);
 const path=contractId+'/final.pdf';await db.query("insert into storage.objects(bucket_id,name) values('employment-contracts',$1)",[path]);
 for(const role of ['employee','expense','leader','admin','ceo']){
 await denied(()=>asUser(db,role,tx=>tx.query("insert into storage.objects(bucket_id,name) values('employment-contracts',$1)",[contractId+'/forged.pdf'])));
 assert.equal((await asUser(db,role,tx=>tx.query("select * from storage.objects where bucket_id='employment-contracts'"))).rows.length,0);
 await denied(()=>asUser(db,role,tx=>tx.query('select complete_employment_contract($1,1,$2,$3)',[contractId,path,contractHash])));
 }
 await asService(db,tx=>tx.query('select complete_employment_contract($1,1,$2,$3)',[contractId,path,contractHash]));
 const c=(await db.query<Contract>('select * from employment_contract where id=$1',[contractId])).rows[0];assert.equal(c.status,'COMPLETED');for(const key of ['sent_at','employee_signed_at','company_signed_at','completed_at'] as const)assert.ok(c[key]);
 await denied(()=>db.query("update employment_contract set pdf_path='replaced.pdf' where id=$1",[contractId]));
 for(const table of ['employment_contract_version','employment_contract_signature','employment_contract_event'])await denied(()=>db.query(`delete from ${table} where contract_id=$1`,[contractId]));
 await denied(()=>asUser(db,'designated',tx=>tx.query('select revise_employment_contract($1,1,$2,$3)',[contractId,contractItem(contractId).body,contractHash])));
 await asUser(db,'employee',tx=>tx.query('select sign_employee_contract($1,1,$2,true)',[contractId,contractHash]));
 assert.equal((await db.query('select * from employment_contract_signature where contract_id=$1',[contractId])).rows.length,2);
 const signatures=(await db.query<Signature>('select * from employment_contract_signature where contract_id=$1',[contractId])).rows;
 const bytes=await contractPdf(c,contractBody.repeat(20),contractHash,signatures);assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.ok(bytes.length>1000);
}finally{await db.close();}});

test('unpublished cancelled drafts remain private and inactive identity loses signature access',async()=>{const db=await contractsDatabase();try{
 const id='c0000000-0000-4000-8000-000000000050';await asUser(db,'designated',tx=>tx.query('select create_employment_contracts($1,null)',[JSON.stringify([contractItem(id)])]));
 await asUser(db,'admin',tx=>tx.query("select transition_employment_contract($1,1,'CANCELLED')",[id]));
 assert.equal((await asUser(db,'employee',tx=>tx.query('select * from employment_contract where id=$1',[id]))).rows.length,0);
 await db.query("update employee set employment_status='INACTIVE' where id=$1",[personId]);
 await denied(()=>asUser(db,'employee',tx=>tx.query('select sign_employee_contract($1,1,$2,true)',[contractId,contractHash])));
}finally{await db.close();}});

test('decline is own-only and terminal; managers cannot counterfeit an employee decision',async()=>{const db=await contractsDatabase();try{
 for(const role of ['admin','ceo','leader','expense'])await denied(()=>asUser(db,role,tx=>tx.query("select transition_employment_contract($1,1,'DECLINED')",[contractId])));
 await asUser(db,'employee',tx=>tx.query("select transition_employment_contract($1,1,'DECLINED')",[contractId]));
 await denied(()=>asUser(db,'employee',tx=>tx.query('select sign_employee_contract($1,1,$2,true)',[contractId,contractHash])));
 await denied(()=>asUser(db,'admin',tx=>tx.query("select transition_employment_contract($1,1,'SENT')",[contractId])));
}finally{await db.close();}});

test('password/magic-link/non-Google sessions cannot sign despite a linked Google identity',async()=>{const db=await contractsDatabase();try{
 for(const claims of [{amr:[{method:'password'}],app_metadata:{provider:'google'}},{amr:[{method:'magiclink'}],app_metadata:{provider:'google'}},{amr:[{method:'oauth'}],app_metadata:{provider:'github'}},{}]){
 await denied(()=>asUser(db,'employee',async tx=>{await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({session_id:idFor('employee'),...claims})]);return tx.query('select sign_employee_contract($1,1,$2,true)',[contractId,contractHash]);}));
 await denied(()=>asUser(db,'ceo',async tx=>{await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({session_id:idFor('ceo'),...claims})]);return tx.query('select sign_company_contract($1,1,$2,true)',[contractId,contractHash]);}));
 }
}finally{await db.close();}});

test('both signers require a valid, owned, unexpired session and confirmed DB email',async()=>{const db=await contractsDatabase();try{
 const oauth={amr:[{method:'oauth'}],app_metadata:{provider:'google'}};
 for(const [role,rpc] of [['employee','sign_employee_contract'],['ceo','sign_company_contract']]){
  for(const session of [undefined,null,'',123,{},'not-a-uuid','00000000-0000-0000-0000-000000000000',idFor('expense')]){
   await denied(()=>asUser(db,role,async tx=>{await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({...oauth,session_id:session})]);return tx.query(`select ${rpc}($1,1,$2,true)`,[contractId,contractHash]);}));
  }
  await db.query("update auth.sessions set not_after=now()-interval '1 second' where user_id=$1",[idFor(role)]);
  await denied(()=>asUser(db,role,tx=>tx.query(`select ${rpc}($1,1,$2,true)`,[contractId,contractHash])));
  await db.query('update auth.sessions set not_after=null where user_id=$1',[idFor(role)]);
  await db.query('update auth.users set email_confirmed_at=null where id=$1',[idFor(role)]);
  await denied(()=>asUser(db,role,tx=>tx.query(`select ${rpc}($1,1,$2,true)`,[contractId,contractHash])));
  await db.query('update auth.users set email_confirmed_at=now() where id=$1',[idFor(role)]);
  if(role==='employee')await asUser(db,role,tx=>tx.query(`select ${rpc}($1,1,$2,true)`,[contractId,contractHash]));
 }
 assert.equal((await db.query("select * from employment_contract_signature where party='COMPANY'")).rows.length,0);
}finally{await db.close();}});

test('evidence is DB-sourced, has no caller inputs, survives replay, email changes and session deletion',async()=>{const db=await contractsDatabase();try{
 for(const [role,rpc,email] of [['employee','sign_employee_contract','verified-employee@example.test'],['ceo','sign_company_contract','verified-ceo@example.test']]){
  const args=(await db.query<{proargnames:string[]}>('select proargnames from pg_proc where proname=$1',[rpc])).rows;
  assert.deepEqual(args,[{proargnames:['p_id','p_version','p_hash','p_consent']}]);
  await denied(()=>asUser(db,role,tx=>tx.query(`select ${rpc}($1,1,$2,true,p_email=>'forged@example.test')`,[contractId,contractHash])));
  await asUser(db,role,async tx=>{await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({session_id:idFor(role),email:'forged@example.test',amr:[{method:'oauth'}],app_metadata:{provider:'google'},user_metadata:{email:'forged@example.test',provider:'github',session_id:idFor('expense')}})]);await tx.query(`select ${rpc}($1,1,$2,true)`,[contractId,contractHash]);});
  const read=()=>db.query<Signature>('select * from employment_contract_signature where contract_id=$1 and actor_id=$2',[contractId,idFor(role)]);
  const before=(await read()).rows[0];assert.equal(before.auth_session_id,idFor(role));assert.equal(before.authenticated_email,email);assert.equal(before.auth_provider,'google');assert.equal(before.evidence,'authenticated-google-consent-v2');assert.equal(before.body_sha256,contractHash);
  const replacement=role==='employee'?'d0000000-0000-4000-8000-000000000001':'d0000000-0000-4000-8000-000000000002';
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[replacement,idFor(role)]);
  await db.query("update auth.users set email='changed@example.test' where id=$1",[idFor(role)]);
  await asUser(db,role,async tx=>{await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({session_id:replacement,amr:[{method:'oauth'}],app_metadata:{provider:'google'}})]);await tx.query(`select ${rpc}($1,1,$2,true)`,[contractId,contractHash]);});
  assert.deepEqual((await read()).rows[0],before);
  await db.query('delete from auth.sessions where user_id=$1',[idFor(role)]);
  await denied(()=>asUser(db,role,tx=>tx.query(`select ${rpc}($1,1,$2,true)`,[contractId,contractHash])));
  assert.deepEqual((await read()).rows[0],before);
  await denied(()=>db.query("update employment_contract_signature set authenticated_email='forged@example.test' where actor_id=$1",[idFor(role)]));
 }
 assert.equal((await db.query("select * from employment_contract_event where action in ('EMPLOYEE_SIGNED','COMPANY_SIGNED')")).rows.length,2);
}finally{await db.close();}});

test('evidence migration preserves old signatures without fabricating a historical session',async()=>{const db=await contractsDatabase({legacyEvidence:true});try{
 await asUser(db,'employee',tx=>tx.query('select sign_employee_contract($1,1,$2,true)',[contractId,contractHash]));
 const before=(await db.query<Signature>('select * from employment_contract_signature')).rows[0];
 await db.exec((await import('node:fs')).readFileSync('supabase/migrations/20261119104141_contract_signature_evidence.sql','utf8'));
 const after=(await db.query('select * from employment_contract_signature')).rows[0];assert.deepEqual(after,{...before,auth_session_id:null,authenticated_email:null,auth_provider:null});
 await asUser(db,'employee',tx=>tx.query('select sign_employee_contract($1,1,$2,true)',[contractId,contractHash]));
 assert.deepEqual((await db.query('select * from employment_contract_signature')).rows[0],after);
 await asUser(db,'ceo',tx=>tx.query('select sign_company_contract($1,1,$2,true)',[contractId,contractHash]));
 assert.equal((await db.query<{auth_provider:string}>("select auth_provider from employment_contract_signature where party='COMPANY'")).rows[0].auth_provider,'google');
}finally{await db.close();}});
