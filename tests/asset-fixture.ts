import { readFileSync } from 'node:fs';
import { expenseDatabase } from './expense-fixture';
import { asUser,personId,ring } from './domain-fixture';
import { colleagueId } from './project-fixture';
import { encryptValue } from '../src/lib/employees/encryption';
export const assetId='90000000-0000-4000-8000-000000000001',otherAssetId='90000000-0000-4000-8000-000000000002';
export const licenseId='91000000-0000-4000-8000-000000000001',accountId='91000000-0000-4000-8000-000000000002';
export const productKey='AAAAA-BBBBB-CCCCC-DDDDD-2PQGP',password='fixture-only-password-42';
export const assetValues={type:'NOTEBOOK',manufacturer:'Apple',model:'MacBook Pro 14 M3',serial_number:'C02X9K2A',status:'IN_USE',current_holder_id:personId};
export async function assetDatabase(){const db=await expenseDatabase();await db.exec(readFileSync('supabase/migrations/202610010007_assets.sql','utf8'));
 await asUser(db,'it',async tx=>{
  await tx.query('select save_asset($1,$2,0)',[assetId,assetValues]);
  await tx.query('select save_asset($1,$2,0)',[otherAssetId,{...assetValues,model:'동료 전용 ThinkPad',serial_number:'PRIVATE-SERIAL-002',current_holder_id:colleagueId}]);
  for(const [id,kind,secret,values] of [[licenseId,'windows',productKey,{name:'Windows 11 Pro',device_asset_id:assetId,assigned_employee_id:personId,key_suffix:'2PQGP'}],[accountId,'account',password,{name:'Gmail 공용',login_id:'dxt.office@example.test',url:'https://mail.google.com',memo:'회사 공용 메일'}]] as const)
   await tx.query('select save_vault_entry($1,$2,$3,$4,0)',[id,kind,values,encryptValue(secret,`vault:${kind}:${id}`,ring)]);
 });return db;}
