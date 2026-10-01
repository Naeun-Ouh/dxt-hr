import { legacyWorkbookFixture } from './legacy-workbook-fixture';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { asUser, personId } from './domain-fixture';
import { colleagueId } from './project-fixture';
import { expenseDatabase,claimId,otherClaimId,itemId,otherItemId,receiptId,otherReceiptId,currentMonth,expenseValues } from './expense-fixture';
import { claimProblems,deadline,itemProblems } from '../src/lib/expenses/validation';
import { templateWorkbook,parseWorkbook,exportWorkbook } from '../src/lib/expenses/workbook';
import type { ItemInput } from '../src/lib/expenses/types';
test('expense RLS isolates claims, items, receipts, attendees, vehicles and storage across roles',async()=>{
 const db=await expenseDatabase();try{
 for(const role of ['employee','leader','it','division']) await asUser(db,role,async tx=>{
  for(const table of ['expense_claim','expense_item','expense_attachment']) {const r=await tx.query(`select * from ${table}`);assert.equal(r.rows.length,role==='employee'?1:0);}
  assert.equal((await tx.query('select * from storage.objects')).rows.length,role==='employee'?1:0);
 });
 for(const role of ['expense','admin','ceo'])await asUser(db,role,async tx=>assert.equal((await tx.query('select * from expense_claim')).rows.length,2));
 await assert.rejects(asUser(db,'employee',tx=>tx.query("update expense_item set amount=1 where id=$1",[otherItemId])));
 await assert.rejects(asUser(db,'employee',tx=>tx.query("select save_expense_items($1,$2,'')",[otherClaimId,JSON.stringify([{...expenseValues,id:otherItemId,attachment_id:otherReceiptId}])])));
 await assert.rejects(asUser(db,'employee',tx=>tx.query("select save_expense_items($1,$2,'')",[claimId,JSON.stringify([{...expenseValues,employee_id:colleagueId}])])));
 await assert.rejects(asUser(db,'employee',tx=>tx.query("select save_expense_items($1,$2,'')",[claimId,JSON.stringify([{...expenseValues,attachment_id:otherReceiptId}])])));
 for(const role of ['employee','leader','it','division'])await assert.rejects(asUser(db,role,tx=>tx.query("select manage_expense_claim($1,1,'PAY')",[otherClaimId])));
 await assert.rejects(asUser(db,'employee',tx=>tx.query("insert into storage.objects(bucket_id,name) values('expense-evidence',$1)",[otherClaimId+'/'+randomUUID()])));
 await asUser(db,'employee',async tx=>{assert.equal((await tx.query("delete from storage.objects where name=$1 returning name",[claimId+'/'+receiptId])).rows.length,0);});
 }finally{await db.close();}
});
test('receipt finalization requires a stored object; vehicle totals derive; stale versions fail; batch is atomic',async()=>{
 const db=await expenseDatabase();try{
 await assert.rejects(asUser(db,'employee',async tx=>{const r=await tx.query<{id:string}>("select reserve_expense_attachment($1,'test.pdf','application/pdf',10) id",[claimId]);await tx.query('select finish_expense_attachment($1)',[r.rows[0].id]);}));
 const input={...expenseValues,expense_type:'FUEL',amount:1,vehicle:{project_or_trip_name:'출장',origin:'구로',destination:'송도',one_way_amount:5036,trip_count:20}};
 await asUser(db,'employee',tx=>tx.query("select save_expense_items($1,$2,'')",[claimId,JSON.stringify([input])]));
 assert.equal((await db.query<{amount:number}>('select amount from expense_item where id=$1',[itemId])).rows[0].amount,100720);
 await asUser(db,'leader',async tx=>assert.equal((await tx.query('select * from vehicle_travel_detail')).rows.length,0));
 await assert.rejects(asUser(db,'employee',tx=>tx.query("select save_expense_items($1,$2,'')",[claimId,JSON.stringify([input])])));
 await assert.rejects(asUser(db,'employee',tx=>tx.query("select save_expense_items($1,$2,'')",[claimId,JSON.stringify([{...expenseValues,id:randomUUID(),version:0},{...expenseValues,id:randomUUID(),version:0,amount:-1}])])));
 assert.equal((await db.query('select * from expense_item')).rows.length,2);
 const legacy={...expenseValues,id:randomUUID(),version:0,expense_type:'FUEL',amount:25000,legacy_summary:true,import_filename:'legacy.xlsx',import_origin:'지출결의서!8'};
 await asUser(db,'employee',tx=>tx.query("select save_expense_items($1,$2,'')",[claimId,JSON.stringify([legacy])]));
 assert.equal((await db.query<{amount:number}>('select amount from expense_item where id=$1',[legacy.id])).rows[0].amount,25000);

 }finally{await db.close();}
});
test('dining allocation is cumulative across submitters, edits release only own allocation, overage stays warning',async()=>{
 const db=await expenseDatabase();try{
 const dining={...expenseValues,expense_type:'DINING',amount:80000,attendees:[{employee_id:personId,allocated_amount:20000},{employee_id:colleagueId,allocated_amount:30000}]};
 await asUser(db,'employee',tx=>tx.query("select save_expense_items($1,$2,'')",[claimId,JSON.stringify([dining])]));
 await asUser(db,'leader',async tx=>assert.equal((await tx.query('select * from expense_attendee')).rows.length,0));
 const other={...dining,id:otherItemId,attachment_id:otherReceiptId,attendees:[{employee_id:personId,allocated_amount:10001}]};
 await assert.rejects(asUser(db,'expense',tx=>tx.query("select save_expense_items($1,$2,'')",[otherClaimId,JSON.stringify([other])])));
 await asUser(db,'expense',tx=>tx.query("select save_expense_items($1,$2,'')",[otherClaimId,JSON.stringify([{...other,attendees:[{employee_id:personId,allocated_amount:10000}]}])]));
 await asUser(db,'expense',async tx=>{const r=await tx.query<{ok:boolean}>('select expense_dining_available($1,$2) ok',[currentMonth+'-01',JSON.stringify([{...other,id:randomUUID(),version:0,attendees:[{employee_id:personId,allocated_amount:1}]}])]);assert.equal(r.rows[0].ok,false);});
 assert(itemProblems(dining as ItemInput).some(p=>p.code==='DINING_TOTAL'&&p.severity==='WARNING'));
 await asUser(db,'employee',tx=>tx.query("select save_expense_items($1,$2,'')",[claimId,JSON.stringify([{...expenseValues,version:2}])]));
 assert.equal((await db.query('select * from expense_attendee')).rows.length,1);
 }finally{await db.close();}
});
test('submission, payment and period locks are audited and cannot be bypassed by receipt or item RPCs',async()=>{
 const db=await expenseDatabase();try{
 await asUser(db,'employee',tx=>tx.query("select submit_expense_claim($1,1,'')",[claimId]));
 await asUser(db,'expense',tx=>tx.query("select manage_expense_claim($1,2,'PAY')",[claimId]));
 for(const sql of ["select save_expense_items($1,$2,'')","select reserve_expense_attachment($1,'x.pdf','application/pdf',10)"]){await assert.rejects(asUser(db,'employee',tx=>tx.query(sql,sql.includes('$2')?[claimId,JSON.stringify([expenseValues])]:[claimId])));}
 await db.query("update expense_claim set status='SUBMITTED',locked_at=null,payment_date=public.expense_today()-1 where id=$1",[claimId]);
 await assert.rejects(asUser(db,'employee',tx=>tx.query("select save_expense_items($1,$2,'')",[claimId,JSON.stringify([expenseValues])])));
 const logs=await db.query<{action:string}>('select action from audit_log where entity_id=$1',[claimId]);assert(logs.rows.some(r=>r.action==='SUBMIT'));assert(logs.rows.some(r=>r.action==='PAY'));
 }finally{await db.close();}
});
test('deadline and retroactive semantics use calendar months and warning-only lateness',()=>{
 assert.equal(deadline('2026-09'),'2026-10-04');assert.equal(deadline('2026-10'),'2026-11-01');
 assert(claimProblems('2026-07','', '2026-10-01').some(p=>p.code==='RETRO_REASON'));
 assert(claimProblems('2026-09','', '2026-10-10').every(p=>p.severity==='WARNING'));
 const input=expenseValues as ItemInput;assert(itemProblems({...input,id:randomUUID()},[input]).some(p=>p.code==='DUPLICATE'));
});
test('two-sheet template imports, legacy bad formulas ignored, summaries not duplicated, structural errors block',async()=>{
 const book=new ExcelJS.Workbook();await book.xlsx.load(await templateWorkbook(currentMonth) as never);
 book.getWorksheet('지출결의서')!.addRow([currentMonth+'-01','식당','야근 식대','복리후생비',12000,'개인카드','','야근 식대','개인카드']);
 book.getWorksheet('주유비,통행비')!.addRow(['주유비',currentMonth+'-01','출장','구로','송도',5036,20,'주유소']);
 let result=await parseWorkbook(Buffer.from(await book.xlsx.writeBuffer()),'test.xlsx',currentMonth,'',[]);
 assert.equal(result.items.length,2);assert.equal(result.items.find(i=>i.expense_type==='FUEL')!.amount,100720);assert.equal(result.problems.filter(p=>p.severity==='ERROR').length,0);
 const legacy=new ExcelJS.Workbook(),s=legacy.addWorksheet('지출결의서'),t=legacy.addWorksheet('주유비,통행비');
 s.addRow(['일자','업체명','품목','계정과목','합계','증빙종류','비고']);s.addRow([1,'','주유비','차량유지비',{formula:'SUM(A1:A2)',result:25361296},'개인카드']);s.addRow([1,'','통행비','차량유지비',9999,'개인카드']);
 t.addRow(['프로젝트명/출장명','출발지','도착지','편도 주유비','횟수','총 금액',null,null,'프로젝트명/출장명','출발지','도착지','편도 통행비','횟수','총 금액']);
 t.addRow(['출장','구로','송도',5036,20,{formula:'D2*D2',result:25361296},null,null,'출장','구로','송도',2400,20,{formula:'K2*L2',result:0}]);
 result=await parseWorkbook(Buffer.from(await legacy.xlsx.writeBuffer()),'legacy.xlsx',currentMonth,currentMonth+'-01',[]);
 assert.equal(result.items.length,2);assert.deepEqual(result.items.map(i=>i.amount),[100720,48000]);assert.equal(result.problems.filter(p=>p.severity==='ERROR').length,0);
 s.addRow(['bad','식당','식사','복리후생비','NaN','개인카드']);result=await parseWorkbook(Buffer.from(await legacy.xlsx.writeBuffer()),'bad.xlsx',currentMonth,currentMonth+'-01',[]);assert(result.problems.some(p=>p.severity==='ERROR'));
 const summary=new ExcelJS.Workbook();await summary.xlsx.load(await templateWorkbook(currentMonth) as never);summary.getWorksheet('지출결의서')!.addRow([1,'','주유비','차량유지비',25000,'개인카드']);
 const summaryResult=await parseWorkbook(Buffer.from(await summary.xlsx.writeBuffer()),'summary.xlsx',currentMonth,'',[]);assert.equal(summaryResult.items.length,1);assert.equal(summaryResult.items[0].legacy_summary,true);assert.equal(summaryResult.items[0].amount,25000);assert(summaryResult.problems.some(p=>p.code==='LEGACY_VEHICLE_SUMMARY'));assert.equal(summaryResult.problems.filter(p=>p.severity==='ERROR').length,0);
 const exported=new ExcelJS.Workbook();await exported.xlsx.load(await exportWorkbook([{'금액':12000,'사용처':'=HYPERLINK("bad")'}]) as never);assert.equal(exported.worksheets[0].getCell('B2').type,ExcelJS.ValueType.String);
});

test('retroactive claims require reason in database and enter a future payment cycle',async()=>{
 const db=await expenseDatabase();try{
 const m=(await db.query<{period:Date}>("select date_trunc('month',public.expense_today()-interval '3 months')::date as period")).rows[0].period.toISOString().slice(0,10);
 const c=await asUser(db,'employee',tx=>tx.query<{id:string}>('select ensure_expense_claim($1) id',[m]));const id=c.rows[0].id;
 const a=randomUUID();await db.query("insert into expense_attachment(id,claim_id,storage_path,filename,mime_type,byte_size,ready) values($1,$2,$3,'retro.pdf','application/pdf',10,true)",[a,id,`${id}/${a}`]);
 const input={...expenseValues,id:randomUUID(),version:0,usage_date:m,attachment_id:a};
 await assert.rejects(asUser(db,'employee',tx=>tx.query("select save_expense_items($1,$2,'')",[id,JSON.stringify([input])])));
 await asUser(db,'employee',tx=>tx.query("select save_expense_items($1,$2,'증빙 재발급')",[id,JSON.stringify([input])]));
 await assert.rejects(asUser(db,'employee',tx=>tx.query("select submit_expense_claim($1,2,'')",[id])));
 await asUser(db,'employee',tx=>tx.query("select submit_expense_claim($1,2,'증빙 재발급')",[id]));
 assert.equal((await db.query<{ok:boolean}>('select payment_date>=public.expense_today() ok from expense_claim where id=$1',[id])).rows[0].ok,true);
 }finally{await db.close();}
});

test('actual legacy layout: blank real area never imports SAMPLE vehicles or prefilled summaries',async()=>{
 const book=legacyWorkbookFixture();
 const preview=await parseWorkbook(Buffer.from(await book.xlsx.writeBuffer()),'2024_DXT지출결의서_00월_홍길동_NEW.xlsx',currentMonth,currentMonth+'-01',[]);
 assert.equal(preview.items.length,0);
 assert.equal(preview.items.filter(i=>i.vehicle).length,0);
 assert(preview.problems.some(p=>p.message==='등록할 경비가 없습니다.'));
 assert(!preview.problems.some(p=>p.origin?.startsWith('주유비,통행비!17')||p.origin?.startsWith('주유비,통행비!18')));
 book.getWorksheet('지출결의서')!.getRow(16).values=[1,'실제 사용처','소모품','소모품비',5000,'개인카드'];
 const ordinary=await parseWorkbook(Buffer.from(await book.xlsx.writeBuffer()),'legacy.xlsx',currentMonth,currentMonth+'-01',[]);
 assert.equal(ordinary.items.length,1);assert.equal(ordinary.items[0].merchant,'실제 사용처');assert.equal(ordinary.items[0].amount,5000);assert.equal(ordinary.problems.filter(p=>p.severity==='ERROR').length,0);
});
test('actual legacy layout: only upper input rows are authoritative and broken totals are ignored',async()=>{
 for(const type of ['FUEL','TOLL'] as const) {
  const book=legacyWorkbookFixture(),travel=book.getWorksheet('주유비,통행비')!;
  travel.getCell('A2').value='작성방법'; // Introductory guidance is not an end marker before input begins.
  const start=type==='FUEL'?1:9;
  ['실제 고객 출장','서울','부산',1234,3].forEach((value,index)=>travel.getRow(8).getCell(start+index).value=value);
  travel.getRow(8).getCell(start+5).value={formula:type==='FUEL'?'D8*D8':'K8*L8',result:999999};
  const preview=await parseWorkbook(Buffer.from(await book.xlsx.writeBuffer()),'legacy.xlsx',currentMonth,currentMonth+'-01',[]);
  assert.equal(preview.items.length,1);assert.equal(preview.items[0].expense_type,type);assert.equal(preview.items[0].amount,3702);
  assert(preview.items[0].import_origin?.startsWith('주유비,통행비!8'));
  assert(!preview.items.some(i=>i.merchant.includes('Samsung')||i.amount===100720||i.amount===48000));
  assert.equal(preview.problems.filter(p=>p.severity==='ERROR').length,0);
 }
});
test('legacy parser stops globally at markers and repeated headers without restarting',async()=>{
 for(const marker of ['SAMPLE','sample','예시','합계','작성방법','']) {
  const book=legacyWorkbookFixture(),travel=book.getWorksheet('주유비,통행비')!;
  travel.unMergeCells('A16:N16');travel.getCell('A16').value=null;travel.getCell('H16').value=marker||null;
  // Empty marker exercises repeated semantic headings alone as the boundary.
  const preview=await parseWorkbook(Buffer.from(await book.xlsx.writeBuffer()),'legacy.xlsx',currentMonth,currentMonth+'-01',[]);
  assert.equal(preview.items.length,0,marker||'repeated header');
  assert(!preview.problems.some(p=>p.origin?.startsWith('주유비,통행비!17')||p.origin?.startsWith('주유비,통행비!18')));
 }
});
