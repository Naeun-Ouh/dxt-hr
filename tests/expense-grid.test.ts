import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {contractsDatabase} from './contracts-fixture';
import {asUser} from './domain-fixture';
import {claimId,otherClaimId,itemId,otherItemId,receiptId,otherReceiptId,currentMonth,expenseValues} from './expense-fixture';
import {blankRow,duplicateRow,importRows,pasteRows,gridProblems} from '../src/lib/expenses/grid';
import type {ItemInput} from '../src/lib/expenses/types';
const migration=readFileSync('supabase/migrations/20261120124228_expense_grid_workspace.sql','utf8');
async function database(){const db=await contractsDatabase();await db.exec(migration);await db.exec(readFileSync('supabase/migrations/20261120135814_restore_expense_payment_edit_window.sql','utf8'));return db;}
const row=expenseValues as ItemInput;
const save=(db:Awaited<ReturnType<typeof database>>,items:unknown[],deleted:unknown[]=[],version=1,claim=claimId,user='employee')=>asUser(db,user,tx=>tx.query('select save_expense_grid($1,$2,$3,$4,$5,$6)',[claim,currentMonth+'-01',version,JSON.stringify(items),JSON.stringify(deleted),'']));
test('grid paste preserves persisted rows, validates malformed data, duplicates/imports/reset remain local',()=>{
 const rows=pasteRows([row],`${currentMonth}-01\t교육비\t교육훈련비\tOpenAI\t구독료\t271,818`,itemId,0,currentMonth,randomUUID);
 assert.equal(rows.length,2);assert.deepEqual(rows[0],row);assert.equal(rows[1].amount,271818);assert.equal(rows[1].expense_type,'TRAINING');assert.equal(gridProblems(rows[1],rows,currentMonth).length,0);
 const bad=pasteRows([],`invalid\tOTHER\t임의계정\t<script>alert(1)</script>\ttext\t=1+2`,'',0,currentMonth,randomUUID);
 assert.equal(bad[0].merchant,'<script>alert(1)</script>');assert(gridProblems(bad[0],bad,currentMonth).some(p=>p.code==='ACCOUNT'));assert(gridProblems(bad[0],bad,currentMonth).some(p=>p.code==='AMOUNT'));
 assert.throws(()=>pasteRows([],Array(502).fill('x').join('\n'),'',0,currentMonth,randomUUID));
 const copy=duplicateRow(row,randomUUID());assert.equal(copy.version,0);assert.equal(importRows([row,copy],[blankRow(currentMonth,randomUUID())],'replace').length,2);assert.equal(importRows([row,copy],[blankRow(currentMonth,randomUUID())],'append').length,3);assert.equal(row.version,1);
});
test('grid snapshot atomically creates/updates/deletes, rejects stale replay and omission, saves without evidence but cannot submit',async()=>{
 const db=await database();try{
 const fresh={...row,id:randomUUID(),version:0,attachment_id:'',amount:3000};
 await save(db,[{...row,amount:9000},fresh]);
 assert.equal((await db.query('select * from expense_item where claim_id=$1',[claimId])).rows.length,2);
 await assert.rejects(save(db,[row,fresh]));
 await assert.rejects(save(db,[{...row,version:2}],[],2));
 await assert.rejects(asUser(db,'employee',tx=>tx.query("select submit_expense_claim($1,2,'')",[claimId])));
 await save(db,[{...fresh,version:1,attachment_id:receiptId}],[{id:itemId,version:2}],2);
 assert.equal((await db.query('select * from expense_item where claim_id=$1',[claimId])).rows.length,1);
 await asUser(db,'employee',tx=>tx.query("select submit_expense_claim($1,3,'')",[claimId]));
 await save(db,[{...fresh,version:2,attachment_id:receiptId}],[],4);
 await asUser(db,'employee',tx=>tx.query("select save_expense_items($1,$2,'')",[claimId,JSON.stringify([{...fresh,version:3,attachment_id:receiptId}])]));
 }finally{await db.close();}
});
test('grid rejects cross-user claim/item/deletion/receipt, ownership and unknown payload; managers cannot author for others',async()=>{
 const db=await database();try{
 for(const items of [[{...row,id:otherItemId}],[{...row,attachment_id:otherReceiptId}],[{...row,employee_id:'10000000-0000-4000-8000-000000000002'}],[{...row,claim_id:otherClaimId}],[{...row,account_category:'invented'}],[{...row,expense_type:'FUEL',legacy_summary:true,import_filename:'forged.xlsx',import_origin:'지출결의서!4'}]])await assert.rejects(save(db,items));
 await assert.rejects(save(db,[row],[{id:otherItemId,version:1}]));
 await assert.rejects(save(db,[{...row,id:otherItemId,attachment_id:otherReceiptId}],[],1,otherClaimId));
 for(const role of ['leader','it','admin','ceo','expense'])await assert.rejects(save(db,[row],[],1,claimId,role));
 assert.equal((await db.query<{amount:number}>('select amount from expense_item where id=$1',[itemId])).rows[0].amount,12000);
 await save(db,[{...row,amount:8000}]);
 await assert.rejects(save(db,[{...row,version:2,amount:7000},{...row,id:randomUUID(),version:0,amount:-1}],[],2));
 assert.equal((await db.query<{amount:number}>('select amount from expense_item where id=$1',[itemId])).rows[0].amount,8000);
 }finally{await db.close();}
});
test('grid recalculates vehicle amount and does not silently create duplicate month after lost response',async()=>{
 const db=await database();try{
 await save(db,[{...row,expense_type:'FUEL',amount:1,vehicle:{project_or_trip_name:'출장',origin:'서울',destination:'송도',one_way_amount:5036,trip_count:20}}]);
 assert.equal((await db.query<{amount:number}>('select amount from expense_item where id=$1',[itemId])).rows[0].amount,100720);
 await assert.rejects(asUser(db,'employee',tx=>tx.query("select save_expense_grid(null,$1,0,'[]','[]','')",[currentMonth+'-01'])));
 }finally{await db.close();}
});
test('dining snapshot redistribution releases old allocation before validating all rows',async()=>{
 const db=await database();try{
 const person='10000000-0000-4000-8000-000000000001';const second={...row,id:randomUUID(),version:0,expense_type:'DINING',amount:30000,attendees:[{employee_id:person,allocated_amount:10000}]};
 await save(db,[{...row,expense_type:'DINING',amount:30000,attendees:[{employee_id:person,allocated_amount:20000}]},second]);
 await save(db,[{...second,version:1,attendees:[{employee_id:person,allocated_amount:20000}]},{...row,version:2,expense_type:'DINING',amount:30000,attendees:[{employee_id:person,allocated_amount:10000}]}],[],2);
 await assert.rejects(save(db,[{...second,version:2,attendees:[{employee_id:person,allocated_amount:20001}]},{...row,version:3,expense_type:'DINING',amount:30000,attendees:[{employee_id:person,allocated_amount:10000}]}],[],3));
 assert.equal(Number((await db.query<{sum:string}>('select sum(allocated_amount) from expense_attendee')).rows[0].sum),30000);
 }finally{await db.close();}
});
test('grid migration preserves private receipt RLS and denies locked/paid write paths',async()=>{
 const db=await database();try{
 await asUser(db,'employee',async tx=>{assert.equal((await tx.query('select * from expense_attachment where id=$1',[otherReceiptId])).rows.length,0);assert.equal((await tx.query('select * from storage.objects where name=$1',[otherClaimId+'/'+otherReceiptId])).rows.length,0);});
 for(const status of ['LOCKED','PAID']){
  await db.query('update expense_claim set status=$1 where id=$2',[status,claimId]);
  await assert.rejects(save(db,[row]));
  await assert.rejects(save(db,[],[{id:itemId,version:1}]));
  await assert.rejects(asUser(db,'employee',tx=>tx.query("select reserve_expense_attachment($1,'x.pdf','application/pdf',10)",[claimId])));
 }
 await assert.rejects(asUser(db,'leader',tx=>tx.query("select manage_expense_claim($1,1,'PAY')",[claimId])));
 }finally{await db.close();}
});

test('submitted Grid edits retain payment window, evidence, ownership and version protection',async()=>{
 const db=await database();try{
  await db.exec(`create or replace function public.expense_today() returns date language sql stable as $$select '${currentMonth}-15'::date$$`);
  await db.query("update expense_claim set status='SUBMITTED',submitted_at=now(),payment_date=$1 where id=$2",[currentMonth+'-15',claimId]);
  await save(db,[{...row,amount:11000}]);
  await assert.rejects(save(db,[row])); // stale version still fails after submission
  await assert.rejects(save(db,[{...row,version:2,attachment_id:''}],[],2));
  await assert.rejects(save(db,[{...row,version:2,attachment_id:otherReceiptId}],[],2));
  await assert.rejects(save(db,[{...row,version:2}],[],2,claimId,'leader'));
  await asUser(db,'employee',tx=>tx.query("select save_expense_items($1,$2,'')",[claimId,JSON.stringify([{...row,version:2,amount:10000}])]));
  await asUser(db,'employee',tx=>tx.query("select reserve_expense_attachment($1,'new.pdf','application/pdf',10)",[claimId]));
  const state=(await db.query<{status:string;version:number}>('select status,version from expense_claim where id=$1',[claimId])).rows[0];
  assert.equal(state.status,'SUBMITTED');
  for(const lock of ["payment_date=public.expense_today()-1","payment_date=public.expense_today(),locked_at=now()","locked_at=null,status='LOCKED'","status='PAID'"]){
   await db.exec(`update expense_claim set ${lock} where id='${claimId}'`);
   await assert.rejects(save(db,[{...row,version:3}],[],state.version));
   await assert.rejects(save(db,[],[{id:itemId,version:3}],state.version));
   await assert.rejects(asUser(db,'employee',tx=>tx.query("select save_expense_items($1,$2,'')",[claimId,JSON.stringify([{...row,version:3}])])));
   await assert.rejects(asUser(db,'employee',tx=>tx.query("select reserve_expense_attachment($1,'locked.pdf','application/pdf',10)",[claimId])));
  }
  assert.equal((await db.query<{amount:number}>('select amount from expense_item where id=$1',[itemId])).rows[0].amount,10000);
 }finally{await db.close();}
});

test('application payment boundary includes Seoul payment day and denies explicit locks',async()=>{
 const {editable}=await import('../src/lib/expenses/validation');
 const claim={id:claimId,employee_id:'employee',usage_month:'2026-10-01',status:'SUBMITTED' as const,submitted_at:'2026-11-01',late_reason:'',locked_at:null,payment_date:'2026-11-15',version:1};
 assert.equal(editable(claim,'2026-11-14'),true);assert.equal(editable(claim,'2026-11-15'),true);assert.equal(editable(claim,'2026-11-16'),false);
 assert.equal(editable({...claim,locked_at:'2026-11-14'},'2026-11-14'),false);
 for(const status of ['LOCKED','PAID'] as const)assert.equal(editable({...claim,status},'2026-11-14'),false);
});
