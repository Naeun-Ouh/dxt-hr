import test from 'node:test';
import {readContractReason} from '../src/lib/contracts/reason';
import assert from 'node:assert/strict';
import {contractsDatabase,contractId,otherContractId,contractHash} from './contracts-fixture';
import {asUser,ring} from './domain-fixture';
import {asService} from './operations-fixture';
import {encryptValue,decryptValue} from '../src/lib/employees/encryption';
import {matchesContract,overdue,seoulDate,type ContractEntry} from '../src/lib/contracts/register';

test('informational deadline is audited/version checked and never changes signing hash or immutable completion',async()=>{const db=await contractsDatabase();try{
 const before=(await db.query('select employee_snapshot,current_version,pdf_path,pdf_sha256 from employment_contract where id=$1',[contractId])).rows[0];
 assert.equal((await db.query<{signing_due_date:null}>('select signing_due_date from employment_contract where id=$1',[contractId])).rows[0].signing_due_date,null);
 for(const role of ['employee','leader','expense','it','division'])await assert.rejects(()=>asUser(db,role,tx=>tx.query("select set_contract_due_date($1,1,0,'2020-01-01')",[contractId])));
 await asUser(db,'admin',tx=>tx.query("select set_contract_due_date($1,1,0,'2020-01-01')",[contractId]));
 await assert.rejects(()=>asUser(db,'admin',tx=>tx.query("select set_contract_due_date($1,1,0,'2021-01-01')",[contractId])),/STALE/);
 await assert.rejects(()=>asUser(db,'admin',tx=>tx.query("select set_contract_due_date($1,99,1,'2021-01-01')",[contractId])),/STALE/);
 await asUser(db,'admin',tx=>tx.query('select set_contract_due_date($1,1,1,null)',[contractId]));
 await asUser(db,'admin',tx=>tx.query("select set_contract_due_date($1,1,2,'2020-01-01')",[contractId]));
 assert.deepEqual((await db.query('select employee_snapshot,current_version,pdf_path,pdf_sha256 from employment_contract where id=$1',[contractId])).rows[0],before);
 assert.equal((await db.query("select id from employment_contract_event where contract_id=$1 and action='DUE_DATE_UPDATED'",[contractId])).rows.length,3);
 await asUser(db,'employee',tx=>tx.query('select sign_employee_contract($1,1,$2,true)',[contractId,contractHash]));
 await asUser(db,'ceo',tx=>tx.query('select sign_company_contract($1,1,$2,true)',[contractId,contractHash]));
 await assert.rejects(()=>asUser(db,'admin',tx=>tx.query('select set_contract_due_date($1,1,3,null)',[contractId])),/IMMUTABLE/);
 await asService(db,tx=>tx.query("insert into storage.objects(bucket_id,name) values ('employment-contracts',$1)",[contractId+'/1.pdf']));
 await asService(db,tx=>tx.query('select complete_employment_contract($1,1,$2,$3)',[contractId,contractId+'/1.pdf','a'.repeat(64)]));
 await assert.rejects(()=>asUser(db,'ceo',tx=>tx.query('select set_contract_due_date($1,1,3,null)',[contractId])),/IMMUTABLE/);
 await assert.rejects(()=>db.query('update employment_contract set signing_due_date=null where id=$1',[contractId]),/IMMUTABLE/);
 await assert.rejects(()=>asUser(db,'admin',tx=>tx.query('update employment_contract set due_version=99 where id=$1',[otherContractId])));
 assert.equal((await db.query<{body_sha256:string}>('select body_sha256 from employment_contract_signature where contract_id=$1',[contractId])).rows.every(r=>r.body_sha256===contractHash),true);
 }finally{await db.close();}});

test('decline/cancel reasons are encrypted, private, immutable and cannot be forged across users or appended on replay',async()=>{const db=await contractsDatabase();try{
 const reason='PRIVATE-REASON confidential requested changes';const encrypted=encryptValue(reason,`contract:${contractId}:reason:DECLINED`,ring);
 for(const role of ['expense','leader','admin','ceo'])await assert.rejects(()=>asUser(db,role,tx=>tx.query("select transition_contract_with_reason($1,1,'DECLINED',$2)",[contractId,encrypted])));
 await asUser(db,'employee',tx=>tx.query("select transition_contract_with_reason($1,1,'DECLINED',$2)",[contractId,encrypted]));
 await asUser(db,'employee',tx=>tx.query("select transition_contract_with_reason($1,1,'DECLINED',$2)",[contractId,'v1.replay']));
 const rows=(await asUser(db,'employee',tx=>tx.query<{encrypted_reason:string}>('select encrypted_reason from employment_contract_reason where contract_id=$1',[contractId]))).rows;
 assert.equal(rows.length,1);assert.equal(decryptValue(rows[0].encrypted_reason,`contract:${contractId}:reason:DECLINED`,ring),reason);
 for(const role of ['admin','leader','expense','it','division'])assert.equal((await asUser(db,role,tx=>tx.query('select contract_id from employment_contract_reason where contract_id=$1',[contractId]))).rows.length,0);
 assert.equal((await asUser(db,'designated',tx=>tx.query('select contract_id from employment_contract_reason where contract_id=$1',[contractId]))).rows.length,1);
 assert.equal((await db.query("select id from employment_contract_event where contract_id=$1 and action='DECLINED'",[contractId])).rows.length,1);
 assert.ok(!JSON.stringify((await db.query('select * from employment_contract_event')).rows).includes(reason));
 await assert.rejects(()=>db.query('delete from employment_contract_reason where contract_id=$1',[contractId]),/IMMUTABLE/);
 await assert.rejects(()=>asUser(db,'admin',tx=>tx.query('select set_contract_due_date($1,1,0,null)',[contractId])),/IMMUTABLE/);
 await assert.rejects(()=>asUser(db,'admin',tx=>tx.query("select transition_contract_with_reason($1,1,'CANCELLED','plaintext')",[otherContractId])),/INVALID_REASON/);
 assert.equal((await db.query<{status:string}>('select status from employment_contract where id=$1',[otherContractId])).rows[0].status,'SENT');
 await assert.rejects(()=>asUser(db,'admin',tx=>tx.query("select transition_contract_with_reason($1,1,'CANCELLED','v1.invalid')",[otherContractId])),/INVALID_REASON/);
 await asUser(db,'admin',tx=>tx.query("select transition_contract_with_reason($1,1,'CANCELLED',null)",[otherContractId]));
 await assert.rejects(()=>asUser(db,'admin',tx=>tx.query('select set_contract_due_date($1,1,0,null)',[otherContractId])),/IMMUTABLE/);
 await db.exec('set role anon');await assert.rejects(()=>db.query('select * from employment_contract_reason'));await assert.rejects(()=>db.query('select set_contract_due_date($1,1,0,null)',[contractId]));await db.exec('reset role');
 }finally{await db.close();}});

test('Seoul midnight, inclusive deadline and actionable status groups are stable',()=>{
 assert.equal(seoulDate('2026-11-26T14:59:59Z'),'2026-11-26');assert.equal(seoulDate('2026-11-26T15:00:00Z'),'2026-11-27');
 const row={status:'SENT',dueDate:'2026-11-26',companySignedAt:null} as ContractEntry;
 assert.equal(overdue(row,'2026-11-26'),false);assert.equal(overdue(row,'2026-11-27'),true);
 for(const status of ['DRAFT','READY_TO_SEND','COMPLETED','CANCELLED','DECLINED'] as const)assert.equal(overdue({...row,status},'2026-11-27'),false);
 assert.equal(overdue({...row,status:'EMPLOYEE_SIGNED',companySignedAt:'2026-11-26'},'2026-11-27'),false);
 assert.equal(matchesContract(row,'SIGNING','2026-11-27',true),true);assert.equal(matchesContract(row,'REVIEW','2026-11-27',true),false);assert.equal(matchesContract(row,'REVIEW','2026-11-27',false),true);assert.equal(matchesContract(row,'OVERDUE','2026-11-27',true),true);
});

test('untrusted reason authentication failure cannot break the contract detail',()=>{assert.equal(readContractReason('v1.invalid','context',(v,c)=>decryptValue(v,c,ring)),'사유를 확인할 수 없습니다. 담당자 확인이 필요합니다.');});

test('competing managers cannot overwrite a deadline from the same observed version',async()=>{const db=await contractsDatabase();try{
 const results=await Promise.allSettled(['admin','ceo'].map((role,i)=>asUser(db,role,tx=>tx.query('select set_contract_due_date($1,1,0,$2)',[contractId,`2026-12-0${i+1}`]))));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const loser=results.find(r=>r.status==='rejected');assert.ok(loser?.status==='rejected'&&String(loser.reason).includes('STALE'));
 assert.equal((await db.query("select id from employment_contract_event where contract_id=$1 and action='DUE_DATE_UPDATED'",[contractId])).rows.length,1);
 const winner=results.findIndex(r=>r.status==='fulfilled');const row=(await db.query<{due:string;due_version:number}>('select signing_due_date::text due,due_version from employment_contract where id=$1',[contractId])).rows[0];assert.equal(row.due,`2026-12-0${winner+1}`);assert.equal(row.due_version,1);
 await asUser(db,'admin',tx=>tx.query('select set_contract_due_date($1,1,1,$2)',[contractId,row.due]));assert.equal((await db.query("select id from employment_contract_event where contract_id=$1 and action='DUE_DATE_UPDATED'",[contractId])).rows.length,1);
 }finally{await db.close();}});
