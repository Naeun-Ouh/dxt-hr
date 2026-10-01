import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { assetDatabase,assetId,otherAssetId,licenseId,accountId,assetValues,productKey,password } from './asset-fixture';
import { asUser,personId,ring } from './domain-fixture';
import { colleagueId } from './project-fixture';
import { idFor } from './e2e/fixtures';
import { decryptValue,encryptValue } from '../src/lib/employees/encryption';
import { assetInput,vaultInput } from '../src/lib/assets/validation';
test('asset ownership and history follow atomic transfer, return and stale update protection',async()=>{const db=await assetDatabase();try{
 assert.deepEqual((await asUser(db,'employee',tx=>tx.query('select id from asset'))).rows,[{id:assetId}]);
 assert.equal((await asUser(db,'employee',tx=>tx.query('select id from asset where id=$1',[otherAssetId]))).rows.length,0);
 assert.equal((await asUser(db,'leader',tx=>tx.query('select id from asset'))).rows.length,0);
 for(const role of ['employee','leader','expense','division'])await assert.rejects(asUser(db,role,tx=>tx.query('select save_asset($1,$2,1)',[assetId,assetValues])));
 await asUser(db,'it',tx=>tx.query('select save_asset($1,$2,1)',[assetId,{...assetValues,current_holder_id:colleagueId}]));
 assert.equal((await asUser(db,'employee',tx=>tx.query('select id from asset'))).rows.length,0);
 assert.equal((await asUser(db,'employee',tx=>tx.query('select id from asset_assignment'))).rows.length,0);
 assert.equal((await asUser(db,'expense',tx=>tx.query('select id from asset'))).rows.length,2);
 await assert.rejects(asUser(db,'it',tx=>tx.query('select save_asset($1,$2,1)',[assetId,assetValues])));
 await asUser(db,'it',tx=>tx.query('select save_asset($1,$2,2)',[assetId,{...assetValues,status:'AVAILABLE',current_holder_id:null}]));
 const history=await db.query<{returned_at:unknown}>('select * from asset_assignment where asset_id=$1',[assetId]);assert.equal(history.rows.length,2);assert.ok(history.rows.every(r=>r.returned_at));
 assert.equal((await db.query('select * from asset_event where asset_id=$1',[assetId])).rows.length,3);
 await assert.rejects(asUser(db,'it',tx=>tx.query('select delete_asset($1,3)',[assetId])));
 await assert.rejects(asUser(db,'employee',tx=>tx.query("update asset set current_holder_id=$1 where id=$2",[personId,otherAssetId])));
 await assert.rejects(asUser(db,'it',tx=>tx.query("delete from asset_assignment where asset_id=$1",[assetId])));
 const fresh=randomUUID();await asUser(db,'it',tx=>tx.query('select save_asset($1,$2,0)',[fresh,{...assetValues,serial_number:'DELETE-TEST',status:'AVAILABLE',current_holder_id:null}]));await asUser(db,'it',tx=>tx.query('select delete_asset($1,1)',[fresh]));
 }finally{await db.close();}});
test('vault capability matrix, encrypted storage, audited reveals, forged kinds and explicit grants',async()=>{const db=await assetDatabase();try{
 for(const role of ['employee','leader','expense','division','inactive','unprovisioned']){assert.equal((await asUser(db,role,tx=>tx.query('select id from vault_entry'))).rows.length,0);for(const [id,kind] of [[licenseId,'windows'],[accountId,'account']])await assert.rejects(asUser(db,role,tx=>tx.query('select reveal_vault_entry($1,$2)',[id,kind])));}
 for(const role of ['admin','ceo','designated']){assert.equal((await asUser(db,role,tx=>tx.query('select id from vault_entry'))).rows.length,2);await assert.rejects(asUser(db,role,tx=>tx.query('select reveal_vault_entry($1,$2)',[licenseId,'windows'])));await assert.rejects(asUser(db,role,tx=>tx.query('select reveal_vault_entry($1,$2)',[accountId,'account'])));}
 for(const role of ['it','combined'])for(const [id,kind,secret] of [[licenseId,'windows',productKey],[accountId,'account',password]]){
 const r=await asUser(db,role,tx=>tx.query<{value:string}>('select reveal_vault_entry($1,$2) value',[id,kind]));assert.notEqual(r.rows[0].value,secret);assert.equal(decryptValue(r.rows[0].value,`vault:${kind}:${id}`,ring),secret);assert.throws(()=>decryptValue(r.rows[0].value,`vault:${kind}:${randomUUID()}`,ring));}
 for(const role of ['employee','it','admin'])await assert.rejects(asUser(db,role,tx=>tx.query('select * from vault_secret')));
 await assert.rejects(asUser(db,'it',tx=>tx.query('select reveal_vault_entry($1,$2)',[licenseId,'account'])));
 await assert.rejects(asUser(db,'it',tx=>tx.query('select reveal_vault_entry($1,$2)',[randomUUID(),'windows'])));
 await db.query("update app_memberships set capabilities=array['WINDOWS_KEY_REVEAL','ACCOUNT_PASSWORD_REVEAL'] where user_id=$1",[idFor('admin')]);
 await asUser(db,'admin',tx=>tx.query('select reveal_vault_entry($1,$2)',[licenseId,'windows']));
 await db.query("update app_memberships set capabilities='{}' where user_id=$1",[idFor('admin')]);await assert.rejects(asUser(db,'admin',tx=>tx.query('select reveal_vault_entry($1,$2)',[licenseId,'windows'])));
 const audit=JSON.stringify((await db.query('select * from audit_log')).rows);assert.ok(!audit.includes(productKey)&&!audit.includes(password));assert.equal((await db.query("select * from audit_log where action='REVEAL' and entity_type like 'vault_%'")).rows.length,5);
 const stored=JSON.stringify((await db.query('select * from vault_entry')).rows);assert.ok(!stored.includes(productKey)&&!stored.includes(password));
 }finally{await db.close();}});
test('secret edit preserves ciphertext when blank, rejects plaintext and stale updates, supports migration and delete',async()=>{const db=await assetDatabase();try{
 const before=(await db.query<{ciphertext:string}>('select ciphertext from vault_secret where entry_id=$1',[accountId])).rows[0].ciphertext;
 await asUser(db,'admin',tx=>tx.query('select save_vault_entry($1,$2,$3,null,1)',[accountId,'account',{name:'Gmail updated',login_id:'office@example.test'}]));
 assert.equal((await db.query<{ciphertext:string}>('select ciphertext from vault_secret where entry_id=$1',[accountId])).rows[0].ciphertext,before);
 await assert.rejects(asUser(db,'it',tx=>tx.query('select save_vault_entry($1,$2,$3,$4,2)',[accountId,'account',{name:'x'},'plaintext'])));
 const cipher=encryptValue('new-secret',`vault:account:${accountId}`,ring);
 await asUser(db,'it',tx=>tx.query('select save_vault_entry($1,$2,$3,$4,2)',[accountId,'account',{name:'Updated',login_id:'x'},cipher]));
 await assert.rejects(asUser(db,'it',tx=>tx.query('select delete_vault_entry($1,$2,2)',[accountId,'account'])));
 await asUser(db,'it',tx=>tx.query('select delete_vault_entry($1,$2,3)',[accountId,'account']));assert.equal((await db.query('select * from vault_secret where entry_id=$1',[accountId])).rows.length,0);
 }finally{await db.close();}});
test('inactive holders stay visible for return without blocking employment changes',async()=>{const db=await assetDatabase();try{
 await db.query("update employee set employment_status='INACTIVE' where id=$1",[personId]);
 assert.equal((await asUser(db,'employee',tx=>tx.query('select * from asset'))).rows.length,0);
 await asUser(db,'it',tx=>tx.query('select save_asset($1,$2,1)',[assetId,{...assetValues,status:'REPAIR'}]));
 await asUser(db,'it',tx=>tx.query('select save_asset($1,$2,2)',[assetId,{...assetValues,status:'AVAILABLE',current_holder_id:null}]));
 await assert.rejects(asUser(db,'it',tx=>tx.query('select save_asset($1,$2,3)',[assetId,assetValues])));
 }finally{await db.close();}});
test('asset and vault input validation preserves password bytes and rejects malformed values',()=>{
 const form=(values:Record<string,string>)=>{const f=new FormData();Object.entries(values).forEach(([k,v])=>f.set(k,v));return f;};
 assert.throws(()=>assetInput(form({...assetValues,current_holder_id:''})));
 assert.throws(()=>assetInput(form({...assetValues,type:'KEYBOARD'})));
 assert.throws(()=>vaultInput(form({name:'x',secret:'bad-key'}),'windows',true));
 assert.throws(()=>vaultInput(form({name:'x',login_id:'x',secret:'a',url:'javascript:alert(1)'}),'account',true));
 assert.equal(vaultInput(form({name:'x',login_id:'x',secret:'  password  '}),'account',true).secret,'  password  ');
});
