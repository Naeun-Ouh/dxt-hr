import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import ExcelJS from 'exceljs';
import {monthlyExpenseDatabase} from './expense-monthly-fixture';
import {asUser,personId} from './domain-fixture';
import {colleagueId} from './project-fixture';
import {claimId,otherClaimId,itemId,currentMonth,expenseValues} from './expense-fixture';
import {writableItem} from '../src/lib/expenses/grid';
import type {ItemInput} from '../src/lib/expenses/types';
import {cardValues,cardLabel} from '../src/lib/expenses/cards';
import {parseWorkbook,templateWorkbook,exportWorkbook} from '../src/lib/expenses/workbook';
const values={issuer:'현대카드',nickname:'경비용',last4:'0123',active:true};
type DB=Awaited<ReturnType<typeof monthlyExpenseDatabase>>;
const register=async(db:DB,user='employee',v=values)=> (await asUser(db,user,tx=>tx.query<{id:string}>('select save_expense_payment_card(null,0,$1) id',[JSON.stringify(v)]))).rows[0].id;
const update=(db:DB,id:string,version:number,v:unknown,user='employee')=>asUser(db,user,tx=>tx.query('select save_expense_payment_card($1,$2,$3)',[id,version,JSON.stringify(v)]));
const save=(db:DB,card:string|null,version=1,claim=claimId,extra={})=>asUser(db,'employee',tx=>tx.query("select save_expense_grid($1,$2,$3,$4,'[]','')",[claim,currentMonth+'-01',version,JSON.stringify([{...expenseValues,version,payment_card_id:card,...extra}])]));
test('card RLS and RPC derive identity, deny cross-user CRUD, anonymous/direct writes and unknown sensitive fields',async()=>{
 const db=await monthlyExpenseDatabase();try{
 const a=await register(db),b=await register(db,'expense');
 const own=await asUser(db,'employee',tx=>tx.query('select id from expense_payment_card'));assert.deepEqual(own.rows,[{id:a}]);
 for(const role of ['employee','admin','ceo','leader','it']){
  assert.equal((await asUser(db,role,tx=>tx.query('select id from expense_payment_card where id=$1',[b]))).rows.length,0);
  await assert.rejects(update(db,b,1,{...values,active:false},role));
 }
 await assert.rejects(asUser(db,'employee',tx=>tx.query('insert into expense_payment_card(employee_id,issuer,nickname,last4) values($1,$2,$3,$4)',[colleagueId,'x','x','1234'])));
 await assert.rejects(asUser(db,'employee',tx=>tx.query('update expense_payment_card set employee_id=$1 where id=$2',[colleagueId,a])));
 await assert.rejects(asUser(db,'employee',tx=>tx.query('delete from expense_payment_card where id=$1',[a])));
 for(const key of ['employee_id','user_id','pan','cvc','cvv','pin','card_number'])await assert.rejects(update(db,a,1,{...values,[key]:'forged'}));
 await assert.rejects(update(db,a,1,{...values,last4:'1234567890123456'}));await assert.rejects(update(db,a,1,{...values,nickname:'1234 5678 9012 3456'}));
 await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role anon');await tx.query('select save_expense_payment_card(null,0,$1)',[JSON.stringify(values)]);}));
 await update(db,a,1,{...values,nickname:'새 별칭'});await assert.rejects(update(db,a,1,values));await update(db,a,2,{...values,active:false});
 assert.equal((await db.query("select * from audit_log where entity_type='expense_payment_card' and entity_id=$1",[a])).rows.length,3);
 const cols=(await db.query<{column_name:string}>("select column_name from information_schema.columns where table_name='expense_payment_card'")).rows.map(x=>x.column_name);assert(!cols.some(c=>/pan|cvc|cvv|pin|card_number/.test(c)));
 }finally{await db.close();}
});
test('expense card use is owner/active checked and atomic; historical snapshot survives metadata changes and deactivation',async()=>{
 const db=await monthlyExpenseDatabase();try{
 const a=await register(db),b=await register(db,'expense');
 await assert.rejects(save(db,b));await assert.rejects(save(db,a,1,otherClaimId));await assert.rejects(save(db,a,1,claimId,{payment_method:'CASH'}));
 await save(db,a);
 const label=cardLabel(values);assert.equal((await db.query<{payment_card_label:string}>('select payment_card_label from expense_item where id=$1',[itemId])).rows[0].payment_card_label,label);
 await update(db,a,1,{...values,nickname:'변경'});await save(db,a,2);await update(db,a,2,{...values,active:false});
 const history=await asUser(db,'employee',tx=>tx.query<{payment_card_label:string}>('select payment_card_label from expense_item where id=$1',[itemId]));assert.equal(history.rows[0].payment_card_label,label);
 await assert.rejects(save(db,a,3));await assert.rejects(save(db,a,3,claimId,{id:randomUUID(),version:0}));
 assert.equal((await asUser(db,'expense',tx=>tx.query<{payment_card_label:string}>('select payment_card_label from expense_item where id=$1',[itemId]))).rows[0].payment_card_label,label);
 await save(db,null,3,claimId,{payment_method:'CASH'});assert.equal((await db.query<{payment_card_label:null}>('select payment_card_label from expense_item where id=$1',[itemId])).rows[0].payment_card_label,null);
 }finally{await db.close();}
});
test('card parser maps only supplied own active cards; ambiguous, inactive, UUID, legacy and cash are explicit; exports are masked',async()=>{
 const card={...values,id:randomUUID(),employee_id:personId,version:1};
 const book=new ExcelJS.Workbook();await book.xlsx.load(await templateWorkbook(currentMonth,'테스트',[card]) as never);
 assert.equal(book.getWorksheet('카드선택목록')!.getCell('A2').text,cardLabel(card));
 const sheet=book.getWorksheet('지출결의서')!;sheet.addRow([currentMonth+'-01','업체','비품','소모품비',5000,'개인카드','','소모품','개인카드','',cardLabel(card)]);
 const parse=async(cards=[card])=>parseWorkbook(Buffer.from(await book.xlsx.writeBuffer()),'cards.xlsx',currentMonth,'',[],cards);
 let preview=await parse();assert.equal(preview.items[0].payment_card_id,card.id);
 assert((await parse([{...card,active:false}])).problems.some(p=>p.code==='CARD'));
 assert((await parse([card,{...card,id:randomUUID()}])).problems.some(p=>p.code==='CARD'));
 sheet.getCell('K4').value=card.id;assert((await parse()).problems.some(p=>p.code==='CARD'));
 sheet.getCell('I4').value='현금';preview=await parse();assert(!preview.items[0].payment_card_id);assert(!preview.problems.some(p=>p.code==='CARD'));
 sheet.getCell('I4').value='개인카드';sheet.getCell('K4').value='';assert(!(await parse()).items[0].payment_card_id);
 const output=new ExcelJS.Workbook();await output.xlsx.load(await exportWorkbook([{'결제수단':'개인카드','결제카드':cardLabel(card),'금액':5000}]) as never);assert.equal(output.getWorksheet('경비 내역')!.getCell('B2').text,cardLabel(card));
 assert.throws(()=>cardValues({...values,employee_id:personId}));assert.throws(()=>cardValues({...values,last4:'1234567890123456'}));
});
test('card writes cannot bypass expense payment locks or forge a server-generated snapshot',async()=>{
 const db=await monthlyExpenseDatabase();try{
 const card=await register(db);
 const imported=writableItem({...expenseValues,id:randomUUID(),version:0,payment_card_id:card,payment_card_label:cardLabel(values)} as ItemInput);
 await asUser(db,'employee',tx=>tx.query("select save_expense_items($1,$2,'')",[claimId,JSON.stringify([imported])]));
 assert.equal((await db.query<{payment_card_label:string}>('select payment_card_label from expense_item where id=$1',[imported.id])).rows[0].payment_card_label,cardLabel(values));
 await db.query('delete from expense_item where id=$1',[imported.id]);await db.query('update expense_claim set version=1 where id=$1',[claimId]);
 await assert.rejects(save(db,card,1,claimId,{payment_card_label:'forged'}));
 for(const status of ['LOCKED','PAID']){await db.query('update expense_claim set status=$1 where id=$2',[status,claimId]);await assert.rejects(save(db,card));}
 await db.query("update expense_claim set status='SUBMITTED',payment_date=public.expense_today()-1 where id=$1",[claimId]);await assert.rejects(save(db,card));
 assert.equal((await db.query<{payment_card_id:null}>('select payment_card_id from expense_item where id=$1',[itemId])).rows[0].payment_card_id,null);
 }finally{await db.close();}
});
