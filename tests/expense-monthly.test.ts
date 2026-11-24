import test from 'node:test';
import assert from 'node:assert/strict';
import {monthlyExpenseDatabase} from './expense-monthly-fixture';
import {asUser} from './domain-fixture';
import {claimId,otherClaimId,receiptId,otherReceiptId,itemId,expenseValues,currentMonth} from './expense-fixture';
const reserve=(db:Awaited<ReturnType<typeof monthlyExpenseDatabase>>,claim=claimId,user='employee',size=20)=>asUser(db,user,tx=>tx.query<{id:string}>("select reserve_expense_attachment($1,'monthly.pdf','application/pdf',$2) id",[claim,size]));
test('monthly submission needs one ready file, not per-item links; removal preserves legacy references and revokes download',async()=>{
 const db=await monthlyExpenseDatabase();try{
  await asUser(db,'employee',tx=>tx.query('select remove_expense_attachment($1,$2)',[claimId,receiptId]));
  assert.equal((await db.query<{attachment_id:string}>('select attachment_id from expense_item where id=$1',[itemId])).rows[0].attachment_id,receiptId);
  await asUser(db,'employee',async tx=>{assert.equal((await tx.query('select * from expense_attachment where id=$1',[receiptId])).rows.length,0);assert.equal((await tx.query('select * from storage.objects where name=$1',[claimId+'/'+receiptId])).rows.length,0);});
  await assert.rejects(asUser(db,'employee',tx=>tx.query("select submit_expense_claim($1,1,'')",[claimId])));
  const id=(await reserve(db)).rows[0].id;
  await assert.rejects(asUser(db,'employee',tx=>tx.query('select finish_expense_attachment($1)',[id])));
  await asUser(db,'employee',tx=>tx.query("insert into storage.objects(bucket_id,name,metadata) values('expense-evidence',$1,'{\"size\":20,\"mimetype\":\"application/pdf\"}')",[claimId+'/'+id]));
  await asUser(db,'employee',tx=>tx.query('select finish_expense_attachment($1)',[id]));
  await asUser(db,'employee',tx=>tx.query("select save_expense_grid($1,$2,1,$3,'[]','')",[claimId,currentMonth+'-01',JSON.stringify([{...expenseValues,attachment_id:''}])]));
  await asUser(db,'employee',tx=>tx.query("select submit_expense_claim($1,2,'')",[claimId]));
  assert.equal((await db.query<{attachment_id:string|null}>('select attachment_id from expense_item where id=$1',[itemId])).rows[0].attachment_id,null);
  await reserve(db); // SUBMITTED edit window remains open
 }finally{await db.close();}
});
test('monthly files reject cross-user list/download/reserve/finalize/remove/move and anonymous RPC/storage access',async()=>{
 const db=await monthlyExpenseDatabase();try{
  await asUser(db,'employee',async tx=>{assert.equal((await tx.query('select * from expense_attachment where claim_id=$1',[otherClaimId])).rows.length,0);assert.equal((await tx.query('select * from storage.objects where name=$1',[otherClaimId+'/'+otherReceiptId])).rows.length,0);});
  await assert.rejects(reserve(db,otherClaimId));
  await assert.rejects(asUser(db,'employee',tx=>tx.query('select finish_expense_attachment($1)',[otherReceiptId])));
  for(const claim of [claimId,otherClaimId])await assert.rejects(asUser(db,'employee',tx=>tx.query('select remove_expense_attachment($1,$2)',[claim,otherReceiptId])));
  await assert.rejects(asUser(db,'employee',tx=>tx.query('update expense_attachment set claim_id=$1 where id=$2',[claimId,otherReceiptId])));
  await assert.rejects(asUser(db,'employee',tx=>tx.query("insert into storage.objects(bucket_id,name,metadata) values('expense-evidence',$1,'{}')",[otherClaimId+'/forged'])));
  for(const sql of ["select reserve_expense_attachment('"+claimId+"','x.pdf','application/pdf',20)","select finish_expense_attachment('"+receiptId+"')","select remove_expense_attachment('"+claimId+"','"+receiptId+"')","insert into storage.objects(bucket_id,name) values('expense-evidence','anon')","delete from expense_attachment"]){await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role anon');await tx.exec(sql);}));}
  for(const user of ['leader','it','expense','admin','ceo'])await assert.rejects(reserve(db,claimId,user));
  assert.equal((await db.query<{public:boolean}>("select public from storage.buckets where id='expense-evidence'")).rows[0].public,false);
 }finally{await db.close();}
});
test('attachment reserve/finalize/remove and direct storage writes stop at lock/payment cutoff, inclusive Seoul payment day',async()=>{
 const db=await monthlyExpenseDatabase();try{
  await db.exec(`create or replace function public.expense_today() returns date language sql stable as $$select '${currentMonth}-15'::date$$`);
  await db.query("update expense_claim set status='SUBMITTED',payment_date=$1 where id=$2",[currentMonth+'-15',claimId]);
  const id=(await reserve(db)).rows[0].id;
  for(const setting of ["payment_date=public.expense_today()-1","payment_date=public.expense_today(),locked_at=now()","locked_at=null,status='LOCKED'","status='PAID'"]){
   await db.exec(`update expense_claim set ${setting} where id='${claimId}'`);
   await assert.rejects(reserve(db));
   await assert.rejects(asUser(db,'employee',tx=>tx.query('select finish_expense_attachment($1)',[id])));
   await assert.rejects(asUser(db,'employee',tx=>tx.query('select remove_expense_attachment($1,$2)',[claimId,receiptId])));
   await assert.rejects(asUser(db,'employee',tx=>tx.query("insert into storage.objects(bucket_id,name,metadata) values('expense-evidence',$1,'{\"size\":20,\"mimetype\":\"application/pdf\"}')",[claimId+'/'+id])));
   assert.equal((await asUser(db,'employee',tx=>tx.query('delete from storage.objects where name=$1 returning id',[claimId+'/'+receiptId]))).rows.length,0);
  }
 }finally{await db.close();}
});
test('claim reservation count/total caps include pending files; removed reservations cannot finalize or upload',async()=>{
 const db=await monthlyExpenseDatabase();try{
  const ids:string[]=[];for(let i=0;i<19;i++)ids.push((await reserve(db)).rows[0].id);
  await assert.rejects(reserve(db));
  const removed=ids[0];await asUser(db,'employee',tx=>tx.query('select remove_expense_attachment($1,$2)',[claimId,removed]));
  await reserve(db);
  await assert.rejects(asUser(db,'employee',tx=>tx.query('select finish_expense_attachment($1)',[removed])));
  await assert.rejects(asUser(db,'employee',tx=>tx.query("insert into storage.objects(bucket_id,name,metadata) values('expense-evidence',$1,'{}')",[claimId+'/'+removed])));
  await db.query('update expense_attachment set deleted_at=now() where claim_id=$1',[claimId]);
  for(let i=0;i<10;i++)await reserve(db,claimId,'employee',10485760);
  await assert.rejects(reserve(db));
 }finally{await db.close();}
});
