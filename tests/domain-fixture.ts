import { PGlite, type Transaction } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { cases, idFor } from './e2e/fixtures';
import { encryptValue, parseKeyring } from '../src/lib/employees/encryption';
export const personId = '10000000-0000-4000-8000-000000000001';
export const departmentId = '20000000-0000-4000-8000-000000000001';
export const testKeys = JSON.stringify({ test: Buffer.alloc(32, 7).toString('base64') });
export const ring = parseKeyring(testKeys, 'test');
export async function domainDatabase() {
 const db = new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema auth; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
 for (const path of ['202609300001_foundation.sql','202609300002_employees.sql']) await db.exec(readFileSync('supabase/migrations/'+path,'utf8'));
 for (const [name, data] of Object.entries(cases)) {
  await db.query('insert into auth.users values ($1)',[idFor(name)]);
  if (name !== 'unprovisioned') await db.query("insert into app_memberships(user_id,display_name,status,roles,capabilities) values($1,'테스트 사용자',$2,$3,$4)",[idFor(name),data.status || 'ACTIVE',data.roles,data.capabilities || []]);
 }
 await db.query("insert into organization(id,name) values($1,'개발팀')",[departmentId]);
 await db.query("insert into employee(id,name,company_email,title,hire_date,department_id,phone,work_location) values($1,'김테스트','kim@example.test','개발자','2025-01-02',$2,'010-0000-0000','서울')",[personId,departmentId]);
 await db.exec(readFileSync('supabase/migrations/202609300003_employee_roles.sql','utf8'));
 await db.query('insert into employee_birth_detail values($1,$2)',[personId,encryptValue('1990-01-02',`${personId}:birth`,ring)]);
 await db.query('insert into employee_private_hr(employee_id,encrypted_payload) values($1,$2)',[personId,encryptValue(JSON.stringify({resident_registration_number:'900102-1234567',address:'테스트 전용 주소',bank_name:'테스트은행',bank_account:'000-test-123',salary:'50000000',emergency_contact:'테스트 연락처'}),`${personId}:private`,ring)]);
 return db;
}
export async function asUser<T>(db: PGlite,name: string, fn: (tx: Transaction)=>Promise<T>) {
 return db.transaction(async tx=>{await tx.exec('set local role authenticated'); await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[idFor(name)]); return fn(tx);});
}
