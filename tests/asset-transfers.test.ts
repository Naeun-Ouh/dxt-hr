import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { assetTransferDatabase,transferMigration } from './asset-transfer-fixture';
import { contractsDatabase } from './contracts-fixture';
import { asUser,personId } from './domain-fixture';
import { colleagueId,leaderId } from './project-fixture';
import { assetId,otherAssetId,assetValues } from './asset-fixture';
import { transferInput } from '../src/lib/assets/validation';
import type { PGlite } from '@electric-sql/pglite';
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'});
async function request(db:PGlite,options:{id?:string;role?:string;asset?:string;recipient?:string;date?:string;assignment?:string}={}){
 const asset=options.asset||assetId;
 const assignment=options.assignment||(await db.query<{id:string}>('select id from asset_assignment where asset_id=$1 and returned_at is null',[asset])).rows[0]?.id;
 const id=options.id||randomUUID();
 await asUser(db,options.role||'employee',tx=>tx.query('select request_asset_transfer($1,$2,$3,$4,$5,$6)',[id,asset,assignment,options.recipient||colleagueId,options.date||today(),'handoff memo']));
 return id;
}
const resolve=(db:PGlite,id:string,role='expense',action='CONFIRMED',force=false)=>asUser(db,role,tx=>tx.query('select resolve_asset_transfer($1,$2,$3)',[id,action,force]));
test('migration preserves existing current and historical assignments without changing their identifiers/dates',async()=>{
 const db=await contractsDatabase();try{
 await asUser(db,'it',tx=>tx.query('select save_asset($1,$2,1)',[assetId,{...assetValues,current_holder_id:colleagueId}]));
 const before=(await db.query('select id,asset_id,employee_id,assigned_at,returned_at,changed_by from asset_assignment order by id')).rows;
 await db.exec(readFileSync(transferMigration,'utf8'));
 assert.deepEqual((await db.query('select id,asset_id,employee_id,assigned_at,returned_at,changed_by from asset_assignment order by id')).rows,before);
 const own=(await asUser(db,'employee',tx=>tx.query<{state:string;serial_number:string}>('select * from asset_assignment'))).rows;
 assert.equal(own.length,1);assert.equal(own[0].state,'RETURNED');assert.equal(own[0].serial_number,assetValues.serial_number);
 assert.equal((await db.query("select * from asset_assignment where state='ACTIVE'")).rows.length,before.filter(r=>!(r as {returned_at:unknown}).returned_at).length);
 }finally{await db.close();}
});
test('sender registration leaves one holder, recipient confirmation is atomic and replay-safe, own history stays isolated',async()=>{
 const db=await assetTransferDatabase();try{
 const id=randomUUID(),assignment=(await db.query<{id:string}>('select id from asset_assignment where asset_id=$1',[assetId])).rows[0].id;
 await request(db,{id,assignment});await request(db,{id,assignment});
 assert.equal((await db.query('select * from asset_transfer')).rows.length,1);
 assert.deepEqual((await db.query('select current_holder_id from asset where id=$1',[assetId])).rows,[{current_holder_id:personId}]);
 assert.equal((await db.query("select * from asset_assignment where asset_id=$1 and state='ACTIVE'",[assetId])).rows.length,1);
 assert.equal((await asUser(db,'expense',tx=>tx.query('select * from asset where id=$1',[assetId]))).rows.length,0);
 for(const role of ['employee','leader','division','inactive','unprovisioned'])await assert.rejects(resolve(db,id,role));
 await assert.rejects(resolve(db,id,'employee','CONFIRMED',true));
 await assert.rejects(resolve(db,id,'employee','CANCELLED'));
 await assert.rejects(asUser(db,'it',tx=>tx.query('select save_asset($1,$2,2)',[assetId,{...assetValues,current_holder_id:leaderId}])));
 // Queued duplicate confirmations exercise repeated transaction state on the same embedded DB.
 await Promise.all([resolve(db,id),resolve(db,id)]);
 await resolve(db,id);
 await request(db,{id,assignment}); // Original sender's exact request retry after confirmation is harmless.
 const periods=(await db.query<{employee_id:string;state:string;assigned_at:Date;returned_at:Date|null}>('select * from asset_assignment where asset_id=$1 order by assigned_at,id',[assetId])).rows;
 assert.equal(periods.length,2);assert.equal(periods.filter(r=>r.state==='ACTIVE').length,1);
 const old=periods.find(r=>r.employee_id===personId)!,current=periods.find(r=>r.employee_id===colleagueId)!;
 assert.deepEqual(old.returned_at,current.assigned_at);
 assert.equal((await db.query("select * from asset_event where transfer_id=$1 and event_type='TRANSFER_CONFIRMED'",[id])).rows.length,1);
 assert.equal((await asUser(db,'employee',tx=>tx.query('select * from asset where id=$1',[assetId]))).rows.length,0);
 const mine=(await asUser(db,'employee',tx=>tx.query<{employee_id:string}>('select * from asset_assignment where asset_id=$1',[assetId]))).rows;
 assert.equal(mine.length,1);assert.equal(mine[0].employee_id,personId);
 for(const role of ['employee','expense'])assert.equal((await asUser(db,role,tx=>tx.query('select * from asset_transfer where id=$1',[id]))).rows.length,1);
 for(const role of ['leader','division','inactive','unprovisioned']){
 assert.equal((await asUser(db,role,tx=>tx.query('select * from asset_transfer where id=$1',[id]))).rows.length,0);
 assert.equal((await asUser(db,role,tx=>tx.query('select * from asset_assignment where employee_id=$1',[personId]))).rows.length,0);
 }
 assert.equal((await asUser(db,'employee',tx=>tx.query('select * from asset_event'))).rows.length,0);
 // Former holder cannot follow asset metadata or see a later transfer between other employees.
 const next=await request(db,{role:'expense',recipient:leaderId});
 assert.equal((await asUser(db,'employee',tx=>tx.query('select * from asset_transfer where id=$1',[next]))).rows.length,0);
 await assert.rejects(resolve(db,next,'employee'));
 await resolve(db,next,'leader');
 assert.equal((await asUser(db,'employee',tx=>tx.query('select * from asset_assignment'))).rows.length,1);
 }finally{await db.close();}
});
test('forged UUID, stale assignment, duplicate pending, invalid/inactive recipients and dates fail closed',async()=>{
 const db=await assetTransferDatabase();try{
 for(const role of ['employee','leader','division','inactive','unprovisioned','admin'])await assert.rejects(request(db,{role,asset:otherAssetId,recipient:personId}));
 await assert.rejects(request(db,{asset:randomUUID(),assignment:randomUUID()}));
 await assert.rejects(request(db,{assignment:randomUUID()}));
 await assert.rejects(request(db,{recipient:personId}));
 await assert.rejects(request(db,{recipient:randomUUID()}));
 await assert.rejects(request(db,{date:'2020-01-01'}));
 await assert.rejects(request(db,{date:'2999-01-01'}));
 await db.query("update employee set employment_status='INACTIVE' where id=$1",[colleagueId]);
 await assert.rejects(request(db));
 await db.query("update employee set employment_status='ACTIVE' where id=$1",[colleagueId]);
 const id=await request(db);
 await assert.rejects(request(db));
 await assert.rejects(request(db,{id,recipient:leaderId}));
 await assert.rejects(request(db,{id,role:'expense'}));
 await db.query("update employee set employment_status='INACTIVE' where id=$1",[colleagueId]);
 await assert.rejects(resolve(db,id));await assert.rejects(resolve(db,id,'it','CONFIRMED',true));
 assert.equal((await db.query("select * from asset_assignment where asset_id=$1 and state='ACTIVE'",[assetId])).rows.length,1);
 await resolve(db,id,'it','CANCELLED');await resolve(db,id,'it','CANCELLED');
 await assert.rejects(resolve(db,id,'it','CONFIRMED',true));
 assert.equal((await db.query("select * from asset_event where transfer_id=$1 and event_type='TRANSFER_CANCELLED'",[id])).rows.length,1);
 // Cancellation retains the original period and allows metadata correction/return.
 await asUser(db,'it',tx=>tx.query('select save_asset($1,$2,3)',[assetId,{...assetValues,status:'AVAILABLE',current_holder_id:null}]));
 assert.equal((await db.query('select * from asset_assignment where asset_id=$1',[assetId])).rows.length,1);
 }finally{await db.close();}
});
test('ADMIN, CEO and IT_ADMIN force confirmations preserve history and audited overrides; direct writes/anon RPC denied',async()=>{
 const db=await assetTransferDatabase();try{
 for(const role of ['admin','ceo','it']){
 const id=await request(db);await resolve(db,id,role,'CONFIRMED',true);
 const t=(await db.query<{forced:boolean}>('select * from asset_transfer where id=$1',[id])).rows[0];assert.equal(t.forced,true);
 assert.equal((await db.query("select * from audit_log where entity_id=$1 and action='TRANSFER_FORCE_CONFIRMED'",[id])).rows.length,1);
 const version=(await db.query<{version:number}>('select version from asset where id=$1',[assetId])).rows[0].version;
 await asUser(db,role,tx=>tx.query('select save_asset($1,$2,$3)',[assetId,assetValues,version]));
 }
 for(const role of ['employee','expense','it','admin'])for(const sql of [
  'delete from asset_assignment','update asset_assignment set employee_id=$1','delete from asset_transfer','update asset_transfer set recipient_id=$1','delete from asset_event',
 ])await assert.rejects(asUser(db,role,tx=>tx.query(sql,sql.includes('$1')?[personId]:[])));
 await assert.rejects(db.query("update asset_assignment set assigned_at=now() where returned_at is not null"));
 await assert.rejects(db.query('delete from asset_assignment'));
 await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role anon');return tx.query('select resolve_asset_transfer($1,$2,false)',[randomUUID(),'CONFIRMED']);}));
 assert.equal((await db.query("select * from asset_assignment where asset_id=$1 and state='ACTIVE'",[assetId])).rows.length,1);
 }finally{await db.close();}
});
test('transfer input rejects forged identifiers, invalid dates and oversized memo',()=>{
 const form=(values:Record<string,string>)=>{const f=new FormData();Object.entries(values).forEach(([k,v])=>f.set(k,v));return f;};
 for(const values of [{recipient_id:'bad',handoff_date:today(),memo:''},{recipient_id:colleagueId,handoff_date:'2026-02-30',memo:''},{recipient_id:colleagueId,handoff_date:today(),memo:'x'.repeat(2001)}])assert.throws(()=>transferInput(form(values)));
 assert.deepEqual(transferInput(form({recipient_id:colleagueId,handoff_date:today(),memo:'  note  '})),{recipient:colleagueId,date:today(),memo:'note'});
});

test('mid-confirmation failure rolls back period closure; competing requests and terminal decisions cannot split holders',async()=>{
 const db=await assetTransferDatabase();try{
 const attempts=await Promise.allSettled([request(db),request(db)]);
 assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
 const id=(attempts.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<string>).value;
 // Fail after closing the sender period, during insertion of the recipient period.
 await db.exec("create function public.test_reject_assignment() returns trigger language plpgsql as $$begin raise exception 'Injected insert failure'; end$$; create trigger test_reject_assignment before insert on asset_assignment for each row execute function public.test_reject_assignment();");
 await assert.rejects(resolve(db,id));
 assert.deepEqual((await db.query('select current_holder_id from asset where id=$1',[assetId])).rows,[{current_holder_id:personId}]);
 assert.equal((await db.query("select * from asset_assignment where asset_id=$1 and state='ACTIVE'",[assetId])).rows.length,1);
 assert.equal((await db.query('select * from asset_assignment where asset_id=$1',[assetId])).rows.length,1);
 assert.deepEqual((await db.query('select state from asset_transfer where id=$1',[id])).rows,[{state:'PENDING'}]);
 assert.equal((await db.query("select * from asset_event where transfer_id=$1 and event_type='TRANSFER_CONFIRMED'",[id])).rows.length,0);
 await db.exec('drop trigger test_reject_assignment on asset_assignment; drop function public.test_reject_assignment();');
 const decisions=await Promise.allSettled([resolve(db,id),resolve(db,id,'it','CANCELLED')]);
 assert.equal(decisions.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await db.query("select * from asset_assignment where asset_id=$1 and state='ACTIVE'",[assetId])).rows.length,1);
 assert.equal((await db.query("select * from asset_event where transfer_id=$1 and event_type in ('TRANSFER_CONFIRMED','TRANSFER_CANCELLED')",[id])).rows.length,1);
 }finally{await db.close();}
});
