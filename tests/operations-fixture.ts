import { readFileSync } from 'node:fs';
import { assetDatabase } from './asset-fixture';
import { asUser,personId,ring } from './domain-fixture';
import { colleagueId } from './project-fixture';
import { idFor } from './e2e/fixtures';
import { encryptValue } from '../src/lib/employees/encryption';
export const onboardingId='a0000000-0000-4000-8000-000000000001',offboardingId='a0000000-0000-4000-8000-000000000002';
export const departingId='10000000-0000-4000-8000-000000000005',ceoEmployeeId='10000000-0000-4000-8000-000000000006';
export const documentId='a1000000-0000-4000-8000-000000000001',announcementId='a2000000-0000-4000-8000-000000000001',draftId='a2000000-0000-4000-8000-000000000002';
export const familyId='a3000000-0000-4000-8000-000000000001',otherFamilyId='a3000000-0000-4000-8000-000000000002';
export const birthdayDeliveryEmail='verified-employee@example.test';
export const ceoDeliveryEmail='verified-ceo@example.test';
export const resignationReason='CEO-ONLY resignation reason fixture',letter='%PDF-1.4 CEO-ONLY LETTER';
export async function operationsDatabase(options:{dormantMail?:boolean}={}){const db=await assetDatabase();await db.exec("alter table auth.users add column email text, add column email_confirmed_at timestamptz;");await db.query('update auth.users set email=$1,email_confirmed_at=now() where id=$2',[ceoDeliveryEmail,idFor('ceo')]);await db.query('update auth.users set email=$1,email_confirmed_at=now() where id=$2',[birthdayDeliveryEmail,idFor('employee')]);await db.exec(readFileSync('supabase/migrations/202610010008_operations.sql','utf8'));await db.exec(readFileSync('supabase/migrations/202610040009_verified_ceo_mail.sql','utf8'));await db.exec(readFileSync('supabase/migrations/202610040010_verified_mail_recipients.sql','utf8'));await db.exec(readFileSync('supabase/migrations/202610060011_defer_automatic_mail.sql','utf8'));
 // Explicit isolated-test reactivation keeps dormant recipient/idempotency regressions exercised.
 if(options.dormantMail)await db.exec('grant execute on function public.enqueue_company_mail(uuid,boolean),public.claim_company_mail(uuid) to service_role;');
 await db.exec('alter role service_role bypassrls; grant usage on schema storage to service_role; grant select on storage.objects to service_role;');
 await db.transaction(async tx=>{for(const [id,name,auth] of [[departingId,'퇴사예정자',null],[ceoEmployeeId,'대표자',idFor('ceo')]]){await tx.query("insert into employee(id,name,company_email,title,hire_date,auth_user_id) values($1,$2,$3,'운영','2025-01-01',$4)",[id,name,`${id}@example.test`,auth]);await tx.query("insert into employee_role values($1,'EMPLOYEE')",[id]);}});
 await asUser(db,'admin',async tx=>{await tx.query("select start_operation($1,'onboarding',$2,null)",[onboardingId,personId]);await tx.query("select start_operation($1,'offboarding',$2,expense_today())",[offboardingId,departingId]);await tx.query('select save_announcement($1,$2,$3,true,0)',[announcementId,'2026년 하반기 워크숍 일정 안내','10월 워크숍 일정과 준비사항을 안내드립니다.']);await tx.query('select save_announcement($1,$2,$3,false,0)',[draftId,'ADMIN-ONLY draft title','ADMIN-ONLY unpublished body']);});
 await asUser(db,'it',tx=>tx.query('select save_asset($1,$2,0)',['90000000-0000-4000-8000-000000000003',{type:'MONITOR',manufacturer:'Dell',model:'미반납 모니터',serial_number:'OFFBOARD-UNRETURNED',status:'IN_USE',current_holder_id:departingId}]));
 await asUser(db,'ceo',tx=>tx.query('select save_resignation_reason($1,$2,0)',[offboardingId,encryptValue(resignationReason,`${offboardingId}:resignation`,ring)]));
 await db.query("insert into resignation_document(id,case_id,storage_path,filename,mime_type,byte_size,ready) values($1,$2,$3,'CEO-ONLY-letter.pdf','application/pdf',$4,true)",[documentId,offboardingId,`${offboardingId}/${documentId}`,Buffer.byteLength(letter)]);
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('resignation-letters',$1,$2)",[`${offboardingId}/${documentId}`,{size:Buffer.byteLength(letter),mimetype:'application/pdf'}]);await db.query('update operation_case set document_received=true where id=$1',[offboardingId]);
 await asUser(db,'employee',tx=>tx.query("select save_family_registration($1,'OWN_MARRIAGE','2026-10-12','김테스트 결혼 소식','PRIVATE-FAMILY-DETAILS own venue/contact',0)",[familyId]));
 await asUser(db,'expense',tx=>tx.query("select save_family_registration($1,'CONDOLENCE','2026-10-10','PRIVATE-OTHER-FAMILY','PRIVATE-OTHER-DETAILS',0)",[otherFamilyId]));
 await asUser(db,'employee',tx=>tx.query("select publish_family_post($1,'결혼 소식을 전합니다','많은 축하 부탁드립니다.',true,0)",[familyId]));
 const task=await db.query<{id:string}>("select id from operation_task where case_id=$1 and type='GMAIL'",[onboardingId]);await asUser(db,'admin',tx=>tx.query("select save_operation_task($1,'DONE','계정 확인 완료',$2,1)",[task.rows[0].id,[personId,colleagueId]]));
 await db.query('insert into birthday_calendar values($1,1,2)',[personId]);
 return db;}
export async function asService<T>(db:Awaited<ReturnType<typeof operationsDatabase>>,fn:(tx:import('@electric-sql/pglite').Transaction)=>Promise<T>){return db.transaction(async tx=>{await tx.exec('set local role service_role');return fn(tx);});}
