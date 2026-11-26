import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {monthlyExpenseDatabase} from './expense-monthly-fixture';
import {asUser,personId} from './domain-fixture';
import {claimId,otherClaimId,receiptId,itemId,currentMonth,expenseValues} from './expense-fixture';
import {applyRoute,inCategory,routeValues,type RoutePreset} from '../src/lib/expenses/routes';
import {blankRow,changePurpose,writableItem} from '../src/lib/expenses/grid';
async function database(){const db=await monthlyExpenseDatabase();await db.exec(readFileSync('supabase/migrations/20261126024427_expense_route_presets.sql','utf8'));return db;}
type DB=Awaited<ReturnType<typeof database>>;
const values={origin:'서울',destination:'부산',alias:'고객사',fuel_amount:30000,toll_amount:15000,active:true};
const save=(db:DB,user:string,id:string|null=null,version=0,value:unknown=values)=>asUser(db,user,tx=>tx.query<{id:string}>('select save_expense_route_preset($1,$2,$3) id',[id,version,JSON.stringify(value)]));
test('route ownership is auth derived; cross-user/admin/leader/anon and direct writes cannot read or mutate personal presets',async()=>{
 const db=await database();try{
 const own=(await save(db,'employee')).rows[0].id,other=(await save(db,'expense')).rows[0].id;
 assert.deepEqual((await asUser(db,'employee',tx=>tx.query('select id from expense_route_preset'))).rows,[{id:own}]);
 for(const role of ['employee','admin','ceo','leader','it']){assert.equal((await asUser(db,role,tx=>tx.query('select id from expense_route_preset where id=$1',[other]))).rows.length,0);await assert.rejects(save(db,role,other,1));}
 for(const key of ['employee_id','user_id','id','distance','fuel_price'])await assert.rejects(save(db,'employee',own,1,{...values,[key]:personId}));
 await assert.rejects(asUser(db,'employee',tx=>tx.query('update expense_route_preset set employee_id=$1 where id=$2',[personId,other])));
 await assert.rejects(asUser(db,'employee',tx=>tx.query('delete from expense_route_preset where id=$1',[own])));
 await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role anon');await tx.query('select save_expense_route_preset(null,0,$1)',[JSON.stringify(values)]);}));
 await save(db,'employee',own,1,{...values,alias:'変更'});await assert.rejects(save(db,'employee',own,1));await save(db,'employee',own,2,{...values,active:false});
 assert.equal((await db.query("select id from audit_log where entity_type='expense_route_preset' and entity_id=$1",[own])).rows.length,3);
 }finally{await db.close();}
});
test('explicit route selection copies editable values; later rename/deactivation does not rewrite saved vehicle history; payment blocks writes',async()=>{
 const db=await database();try{
 const id=(await save(db,'employee')).rows[0].id;
 const route=(await asUser(db,'employee',tx=>tx.query<RoutePreset>('select * from expense_route_preset where id=$1',[id]))).rows[0];
 const row=applyRoute({...changePurpose({...blankRow(currentMonth,itemId),...expenseValues,expense_type:'FUEL'},'FUEL'),vehicle:{origin:'',destination:'',project_or_trip_name:'TEST 출장',one_way_amount:0,trip_count:2}},route);
 const persist=(version:number)=>asUser(db,'employee',tx=>tx.query("select save_expense_grid($1,$2,$3,$4,'[]','')",[claimId,currentMonth+'-01',version,JSON.stringify([{...writableItem(row),version}])]));
 await persist(1);await save(db,'employee',id,1,{...values,origin:'수정',fuel_amount:999,active:false});
 const detail=(await db.query<{origin:string;one_way_amount:number}>('select origin,one_way_amount from vehicle_travel_detail where item_id=$1',[itemId])).rows[0];assert.equal(detail.origin,'서울');assert.equal(Number(detail.one_way_amount),30000);
 await db.query("update expense_claim set status='PAID' where id=$1",[claimId]);await assert.rejects(persist(2));
 }finally{await db.close();}
});
test('last ready submitted evidence cannot be removed until replacement finished; replay and payment/cross-user/transport guards hold',async()=>{
 const db=await database();try{
 await asUser(db,'employee',tx=>tx.query("select submit_expense_claim($1,1,'')",[claimId]));
 const remove=(id:string)=>asUser(db,'employee',tx=>tx.query('select remove_expense_attachment($1,$2)',[claimId,id]));
 await assert.rejects(remove(receiptId),/LAST_READY_EVIDENCE/);
 const pending=(await asUser(db,'employee',tx=>tx.query<{id:string}>("select reserve_expense_attachment($1,'replacement.pdf','application/pdf',20) id",[claimId]))).rows[0].id;
 await assert.rejects(remove(receiptId),/LAST_READY_EVIDENCE/);
 await asUser(db,'employee',tx=>tx.query("insert into storage.objects(bucket_id,name,metadata) values('expense-evidence',$1,'{\"size\":20,\"mimetype\":\"application/pdf\"}')",[claimId+'/'+pending]));
 await asUser(db,'employee',tx=>tx.query('select finish_expense_attachment($1)',[pending]));await remove(receiptId);await remove(receiptId);
 assert.equal((await db.query("select id from audit_log where entity_type='expense_attachment' and entity_id=$1 and action='REMOVE'",[receiptId])).rows.length,1);
 await assert.rejects(remove(pending),/LAST_READY_EVIDENCE/);
 await assert.rejects(asUser(db,'employee',tx=>tx.query("select reserve_expense_attachment($1,'large.pdf','application/pdf',4194305)",[claimId])));
 await assert.rejects(asUser(db,'employee',tx=>tx.query('select remove_expense_attachment($1,$2)',[otherClaimId,pending])));
 await assert.rejects(asUser(db,'employee',tx=>tx.query('update expense_attachment set ready=false where id=$1',[pending])));
 assert.equal((await asUser(db,'employee',tx=>tx.query('delete from storage.objects where name=$1 returning id',[claimId+'/'+pending]))).rows.length,0);
 // PGlite serializes connection transactions: two competing requests still
 // demonstrate the invariant; hosted multi-connection stress is a separate gate.
 const extra=(await asUser(db,'employee',tx=>tx.query<{id:string}>("select reserve_expense_attachment($1,'second.pdf','application/pdf',20) id",[claimId]))).rows[0].id;
 await asUser(db,'employee',tx=>tx.query("insert into storage.objects(bucket_id,name,metadata) values('expense-evidence',$1,'{\"size\":20,\"mimetype\":\"application/pdf\"}')",[claimId+'/'+extra]));
 await asUser(db,'employee',tx=>tx.query('select finish_expense_attachment($1)',[extra]));
 const outcomes=await Promise.allSettled([remove(pending),remove(extra)]);assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);assert.equal(outcomes.filter(o=>o.status==='rejected').length,1);
 assert.equal((await db.query('select id from expense_attachment where claim_id=$1 and ready and deleted_at is null',[claimId])).rows.length,1);
 for(const state of ["status='LOCKED'","status='PAID'","status='SUBMITTED',payment_date=public.expense_today()-1"]){await db.exec(`update expense_claim set ${state} where id='${claimId}'`);await assert.rejects(remove(pending));}
 }finally{await db.close();}
});
test('route validation, categories, independent copied snapshots and unchanged formula',()=>{
 assert.deepEqual(routeValues(values),values);for(const amount of [-1,0,1.2,100000001,NaN,undefined])assert.throws(()=>routeValues({...values,fuel_amount:amount}));assert.throws(()=>routeValues({...values,employee_id:personId}));
 const row=changePurpose(blankRow(currentMonth,randomUUID()),'TOLL');row.vehicle!.trip_count=3;const preset={...values,id:randomUUID(),employee_id:personId,version:1};const copied=applyRoute(row,preset);assert.equal(copied.amount,45000);assert.equal(row.vehicle!.origin,'');preset.origin='Changed';assert.equal(copied.vehicle!.origin,'서울');assert(inCategory(copied,'TOLL'));assert(!inCategory(copied,'GENERAL'));assert(inCategory(copied,'ALL'));assert.throws(()=>applyRoute(row,{...preset,active:false}));
 assert.equal(applyRoute(copied,{...preset,toll_amount:null}).amount,45000);
});
test('browser transport aggregate cap includes Excel plus evidence while existing files remain readable',async()=>{
 const {checkExpenseUpload,EXPENSE_UPLOAD_LIMIT}=await import('../src/lib/expenses/transport');
 const form=new FormData();form.set('workbook',new File([new Uint8Array(EXPENSE_UPLOAD_LIMIT)],'source.xlsx'));assert.doesNotThrow(()=>checkExpenseUpload(form));form.set('receipt',new File(['a'],'receipt.pdf'));assert.throws(()=>checkExpenseUpload(form),/4 MiB/);
 const db=await database();try{
 await db.query('update expense_attachment set byte_size=10485760 where id=$1',[receiptId]);
 assert.equal((await asUser(db,'employee',tx=>tx.query<{byte_size:number}>('select byte_size from expense_attachment where id=$1',[receiptId]))).rows[0].byte_size,10485760);
 }finally{await db.close();}
});
