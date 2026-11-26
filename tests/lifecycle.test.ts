import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assetTransferDatabase} from './asset-transfer-fixture';
import {asUser,personId} from './domain-fixture';
import {colleagueId} from './project-fixture';
import {onboardingId,offboardingId,asService} from './operations-fixture';
import {lifecycleReadiness,loadLifecycleTasks,type LifecycleTask} from '../src/lib/operations/lifecycle';
import type {OperationCase} from '../src/lib/operations/types';
test('lifecycle readiness matches existing checklist/date/letter/leave gates without asset or contract prerequisites',()=>{
 const record={id:'case',kind:'offboarding',completed_at:null,resignation_date:'2026-10-06',document_received:true,unused_leave_checked:true} as OperationCase;
 const task={id:'task',case_id:'case',type:'DEVICE',status:'TODO'} as LifecycleTask;
 assert.deepEqual(lifecycleReadiness(record,[task],'2026-10-06').checks,['체크리스트 1건']);
 assert.equal(lifecycleReadiness(record,[{...task,status:'NOT_APPLICABLE'}],'2026-10-06').label,'완료 검토 가능');
 assert.deepEqual(lifecycleReadiness({...record,resignation_date:'2026-10-07',document_received:false,unused_leave_checked:false},[],'2026-10-06').checks,['퇴사일 도래 전','사직서 수령','미사용 휴가 확인']);
 assert.equal(lifecycleReadiness({...record,kind:'onboarding',document_received:false,unused_leave_checked:false},[],'2026-10-06').label,'완료 검토 가능');
 assert.equal(lifecycleReadiness({...record,completed_at:'2026-10-06'},[task],'2026-10-06').label,'처리 완료');
});
test('lifecycle projections preserve existing RLS and private HR boundaries; completion stays manual',async()=>{
 const db=await assetTransferDatabase();try{
 await db.exec(readFileSync('supabase/migrations/20261124134708_employee_hr_documents.sql','utf8'));
 const document=(await asUser(db,'designated',tx=>tx.query<{id:string}>("select reserve_hr_document($1,'OTHER_HR','private.pdf','application/pdf',20,repeat('a',64),null,null) id",[personId]))).rows[0].id;
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('employee-hr-documents',$1,'{\"size\":20,\"mimetype\":\"application/pdf\"}')",[personId+'/'+document]);
 await asService(db,tx=>tx.query('select finish_hr_document($1)',[document]));
 for(const role of ['admin','employee','leader','it','expense','division'])assert.equal((await asUser(db,role,tx=>tx.query('select id,document_type,archived_at from employee_hr_document where employee_id=$1',[personId]))).rows.length,0);
 assert.equal((await asUser(db,'designated',tx=>tx.query('select id,document_type,archived_at from employee_hr_document where employee_id=$1',[personId]))).rows.length,1);
 const before=(await db.query('select id,employment_status,version from employee order by id')).rows;
 for(const role of ['employee','leader','expense','it','division','combined']){
  for(const [table,columns] of [['operation_case','id,kind,employee_id'],['operation_task','id,case_id,type,status']])assert.equal((await asUser(db,role,tx=>tx.query(`select ${columns} from ${table}`))).rows.length,0);
  await assert.rejects(()=>asUser(db,role,tx=>tx.query('select save_operation_case($1,null,true,true,1)',[onboardingId])));
  assert.equal((await asUser(db,role,tx=>tx.query('select id,status from employment_contract where employee_id=$1',[role==='employee'?colleagueId:personId]))).rows.length,0);
 }
 for(const role of ['admin','designated']){
  assert.equal((await asUser(db,role,tx=>tx.query('select id,kind,employee_id from operation_case'))).rows.length,2);
  assert.equal((await asUser(db,role,tx=>tx.query('select id,filename from resignation_document where case_id=$1',[offboardingId]))).rows.length,0);
  assert.equal((await asUser(db,role,tx=>tx.query('select case_id from resignation_private where case_id=$1',[offboardingId]))).rows.length,0);
 }
 assert.equal((await asUser(db,'admin',tx=>tx.query('select id,status from employment_contract where employee_id=$1',[personId]))).rows.length,1);
 assert.equal((await asUser(db,'admin',tx=>tx.query('select contract_id from employment_contract_version'))).rows.length,0);
 assert.deepEqual((await db.query('select id,employment_status,version from employee order by id')).rows,before);
 await db.exec('set role anon');await assert.rejects(()=>db.query('select id from operation_case'));await db.exec('reset role');
 }finally{await db.close();}
});

test('lifecycle task aggregation survives 500-row pages and many cases without duplicate or unrelated data',async()=>{
 const ids=Array.from({length:130},(_,i)=>String(i).padStart(3,'0'));
 const records=ids.flatMap(case_id=>Array.from({length:8},(_,n)=>({id:case_id+':'+n,case_id,type:'GMAIL' as const,status:'TODO' as const})));
 let calls=0;
 const tasks=await loadLifecycleTasks([...ids,ids[0]],async(batch,from,to)=>{calls++;assert.ok(batch.length<=64);assert.equal(to-from,499);return records.filter(r=>batch.includes(r.case_id)).slice(from,to+1);});
 assert.deepEqual(tasks,records);assert.equal(calls,5);
 assert.deepEqual(await loadLifecycleTasks([],async()=>{throw Error('empty must not query');}),[]);
 await assert.rejects(()=>loadLifecycleTasks(ids,async()=>{throw Error('RLS/service error');}),/RLS\/service error/);
});
