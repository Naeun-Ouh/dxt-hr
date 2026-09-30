import { readFileSync } from 'node:fs';
import { projectDatabase, colleagueId } from './project-fixture';
import { personId } from './domain-fixture';
import { today } from '../src/lib/expenses/validation';
export const claimId='60000000-0000-4000-8000-000000000001',otherClaimId='60000000-0000-4000-8000-000000000002';
export const itemId='70000000-0000-4000-8000-000000000001',otherItemId='70000000-0000-4000-8000-000000000002';
export const receiptId='80000000-0000-4000-8000-000000000001',otherReceiptId='80000000-0000-4000-8000-000000000002';
export const currentMonth=today().slice(0,7);
export const expenseValues={id:itemId,version:1,usage_date:currentMonth+'-01',expense_type:'OVERTIME',merchant:'본죽 잠실점',description:'야근 식사',account_category:'복리후생비',amount:12000,evidence_type:'개인카드',payment_method:'PERSONAL_CARD',project_id:null,trip_context:'',notes:'',attachment_id:receiptId,attendees:[]};
export async function expenseDatabase() {
 const db=await projectDatabase();
 await db.exec(`create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb,unique(bucket_id,name));
 alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;`);
 await db.exec(readFileSync('supabase/migrations/202610010006_expenses.sql','utf8'));
 for(const [c,i,a,e,merchant] of [[claimId,itemId,receiptId,personId,'본죽 잠실점'],[otherClaimId,otherItemId,otherReceiptId,colleagueId,'동료 비공개 식당']]) {
  await db.query('insert into expense_claim(id,employee_id,usage_month) values($1,$2,$3)',[c,e,currentMonth+'-01']);
  await db.query("insert into expense_attachment(id,claim_id,storage_path,filename,mime_type,byte_size,ready) values($1,$2,$3,'receipt.pdf','application/pdf',15,true)",[a,c,`${c}/${a}`]);
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('expense-evidence',$1,'{\"size\":15,\"mimetype\":\"application/pdf\"}')",[`${c}/${a}`]);
  await db.query("insert into expense_item(id,claim_id,usage_date,expense_type,merchant,description,account_category,amount,evidence_type,payment_method,attachment_id) values($1,$2,$3,'OVERTIME',$4,'야근 식사','복리후생비',12000,'개인카드','PERSONAL_CARD',$5)",[i,c,currentMonth+'-01',merchant,a]);
 }
 return db;
}
