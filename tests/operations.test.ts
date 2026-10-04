import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { operationsDatabase,asService,onboardingId,offboardingId,departingId,ceoEmployeeId,ceoDeliveryEmail,documentId,announcementId,draftId,familyId,otherFamilyId,resignationReason } from './operations-fixture';
import { asUser,personId,ring } from './domain-fixture';
import { colleagueId,outsideId } from './project-fixture';
import { idFor } from './e2e/fixtures';
import { decryptValue,encryptValue } from '../src/lib/employees/encryption';
import { dispatchMail,rawMessage,cronAuthorized,type MailClaim,type MailStore } from '../src/lib/operations/mail';
import { familyInput,templateInput,renderTemplate } from '../src/lib/operations/validation';
import { can } from '../src/lib/permissions';

test('operations scope, multiple owners, lifecycle history and completion are enforced in SQL',async()=>{const db=await operationsDatabase();try{
 for(const role of ['employee','leader','division','expense','it','combined','inactive','unprovisioned']){
  assert.equal((await asUser(db,role,tx=>tx.query('select * from operation_case'))).rows.length,0);
  assert.equal((await asUser(db,role,tx=>tx.query('select * from operation_task'))).rows.length,0);
  await assert.rejects(asUser(db,role,tx=>tx.query("select start_operation($1,'onboarding',$2,null)",[randomUUID(),outsideId])));
  await assert.rejects(asUser(db,role,tx=>tx.query('select save_operation_case($1,null,false,true,1)',[onboardingId])));
 }
 const task=(await db.query<{id:string;version:number}>("select id,version from operation_task where case_id=$1 and type='M365'",[onboardingId])).rows[0];
 await asUser(db,'admin',tx=>tx.query("select save_operation_task($1,'DONE','complete',$2,$3)",[task.id,[personId,colleagueId],task.version]));assert.equal((await db.query('select * from operation_task_owner where task_id=$1',[task.id])).rows.length,2);
 await assert.rejects(asUser(db,'admin',tx=>tx.query("select save_operation_task($1,'TODO','stale','{}',$2)",[task.id,task.version])));
 await assert.rejects(asUser(db,'admin',tx=>tx.query('select save_operation_case($1,null,false,true,1)',[onboardingId])));
 for(const t of (await db.query<{id:string;version:number}>('select id,version from operation_task where case_id=$1',[onboardingId])).rows)await asUser(db,'admin',tx=>tx.query("select save_operation_task($1,'DONE','','{}',$2)",[t.id,t.version]));
 await asUser(db,'admin',tx=>tx.query('select save_operation_case($1,null,false,true,1)',[onboardingId]));
 await assert.rejects(asUser(db,'admin',tx=>tx.query("select save_operation_task($1,'TODO','','{}',3)",[task.id])));
 assert.ok((await db.query('select * from operation_history where case_id=$1',[onboardingId])).rows.length>=10);
 const accounts=(await db.query('select * from app_memberships')).rows.length;await asUser(db,'admin',tx=>tx.query("select start_operation($1,'onboarding',$2,null)",[randomUUID(),outsideId]));assert.equal((await db.query('select * from app_memberships')).rows.length,accounts);
 }finally{await db.close();}});

test('CEO-only reason, document metadata, uploads, audited proxy access; Admin may complete with unreturned assets',async()=>{const db=await operationsDatabase();try{
 for(const role of ['employee','leader','division','expense','it','admin','designated','combined']){
  assert.equal((await asUser(db,role,tx=>tx.query('select id from resignation_document'))).rows.length,0);
  await assert.rejects(asUser(db,role,tx=>tx.query('select reveal_resignation_reason($1)',[offboardingId])));
  await assert.rejects(asUser(db,role,tx=>tx.query("select reserve_resignation_document($1,'x.pdf','application/pdf',8)",[offboardingId])));
  await assert.rejects(asUser(db,role,tx=>tx.query('select record_resignation_download($1)',[documentId])));
 }
 const privateRow=await asUser(db,'ceo',tx=>tx.query<{result:{ciphertext:string;version:number}}>('select reveal_resignation_reason($1) result',[offboardingId]));assert.equal(decryptValue(privateRow.rows[0].result.ciphertext,`${offboardingId}:resignation`,ring),resignationReason);
 await assert.rejects(asUser(db,'ceo',tx=>tx.query('select reason_encrypted from resignation_private')));
 // No browser role, including CEO, can read Storage objects or mint reusable signed URLs.
 for(const role of ['employee','admin','designated','it','ceo'])assert.equal((await asUser(db,role,tx=>tx.query("select name from storage.objects where bucket_id='resignation-letters'"))).rows.length,0);
 assert.equal((await asService(db,tx=>tx.query("select name from storage.objects where bucket_id='resignation-letters'"))).rows.length,1);
 await asUser(db,'ceo',tx=>tx.query('select record_resignation_download($1)',[documentId]));await assert.rejects(asUser(db,'ceo',tx=>tx.query('select record_resignation_download($1)',[randomUUID()])));
 const reserved=await asUser(db,'ceo',tx=>tx.query<{id:string}>("select reserve_resignation_document($1,'new.pdf','application/pdf',8) id",[offboardingId]));await assert.rejects(asUser(db,'ceo',tx=>tx.query('select finish_resignation_document($1)',[reserved.rows[0].id])));
 await assert.rejects(asUser(db,'admin',tx=>tx.query('select save_operation_case($1,expense_today(),false,true,1)',[offboardingId])));
 await assert.rejects(asUser(db,'admin',tx=>tx.query('select save_operation_case($1,expense_today(),true,true,1)',[offboardingId])));
 const settlement=(await db.query<{id:string}>("select id from operation_task where case_id=$1",[offboardingId])).rows[0].id;
 await asUser(db,'admin',tx=>tx.query("select save_operation_task($1,'DONE','','{}',1)",[settlement]));
 await asUser(db,'admin',tx=>tx.query('select save_operation_case($1,expense_today(),true,true,1)',[offboardingId]));
 assert.equal((await db.query<{employment_status:string}>('select employment_status from employee where id=$1',[departingId])).rows[0].employment_status,'INACTIVE');
 assert.equal((await db.query('select * from asset where current_holder_id=$1',[departingId])).rows.length,1);
 const audit=JSON.stringify((await db.query('select * from audit_log')).rows);assert.ok(audit.includes('REVEAL_REASON')&&audit.includes('DOWNLOAD_DOCUMENT'));assert.ok(!audit.includes(resignationReason)&&!audit.includes('CEO-ONLY-letter.pdf'));
 }finally{await db.close();}});

test('announcements require explicit admin capability and private family registration never follows board visibility',async()=>{const db=await operationsDatabase();try{
 assert.equal((await asUser(db,'employee',tx=>tx.query('select id from announcement where id=$1',[draftId]))).rows.length,0);
 assert.equal((await asUser(db,'employee',tx=>tx.query('select id from announcement where id=$1',[announcementId]))).rows.length,1);
 for(const role of ['employee','leader','expense','it','division'])await assert.rejects(asUser(db,role,tx=>tx.query("select save_announcement($1,'x','x',true,1)",[announcementId])));
 await asUser(db,'admin',tx=>tx.query("select save_announcement($1,'edited','draft body',false,1)",[announcementId]));assert.equal((await asUser(db,'employee',tx=>tx.query('select * from announcement'))).rows.length,0);
 assert.deepEqual((await asUser(db,'employee',tx=>tx.query('select id from family_registration'))).rows,[{id:familyId}]);
 const board=JSON.stringify((await asUser(db,'expense',tx=>tx.query('select * from family_post'))).rows);assert.ok(board.includes('많은 축하'));assert.ok(!board.includes('PRIVATE-FAMILY'));
 await assert.rejects(asUser(db,'expense',tx=>tx.query("select save_family_registration($1,'CHILDBIRTH','2026-10-01','forged','forged',1)",[familyId])));
 await assert.rejects(asUser(db,'expense',tx=>tx.query("select publish_family_post($1,'forged','forged',true,1)",[familyId])));
 await assert.rejects(asUser(db,'admin',tx=>tx.query('select family_notification_status($1)',[familyId])));
 assert.equal((await asUser(db,'ceo',tx=>tx.query('select * from family_registration'))).rows.length,2);
 await asUser(db,'employee',tx=>tx.query("select publish_family_post($1,'','',false,1)",[familyId]));assert.equal((await asUser(db,'expense',tx=>tx.query('select * from family_post'))).rows.length,0);
 assert.equal((await db.query('select * from family_registration')).rows.length,2);
 }finally{await db.close();}});

function mailStore(db:Awaited<ReturnType<typeof operationsDatabase>>):MailStore{
 return {enqueue:async id=>{await asService(db,tx=>tx.query('select enqueue_company_mail($1,$2)',[id||null,!id]));},claim:async id=>(await asService(db,tx=>tx.query<{result:MailClaim|null}>('select claim_company_mail($1) result',[id||null]))).rows[0].result,finish:async(c,id,uncertain)=>{await asService(db,tx=>tx.query('select finish_company_mail($1,$2,$3,$4)',[c.id,c.token,id,uncertain]));}};
}
const config={clientId:'test',clientSecret:'test',refreshToken:'test',sender:'shared@example.test'};
const fakeMail=(sent:string[],fail=false):typeof fetch=>async(input,init)=>{if(String(input).includes('oauth2'))return Response.json({access_token:'test-token'});const raw=JSON.parse(String(init?.body)).raw;sent.push(Buffer.from(raw,'base64url').toString());if(fail)throw new Error('Ambiguous network timeout');return Response.json({id:'test-message-'+sent.length});};

test('birthday/calendar scope, 09:00 timing, CEO-only family routing and duplicate job execution',async()=>{const db=await operationsDatabase();try{
 await db.exec("create or replace function company_mail_now() returns timestamptz language sql stable as $$select '2026-01-02T00:00:00Z'::timestamptz$$;");
 await asUser(db,'admin',tx=>tx.query("select save_birthday_template(2026,'Happy {{name}}','Birthday {{birthday}}',0)"));
 for(const role of ['employee','it','expense','leader','division']){
  assert.equal((await asUser(db,role,tx=>tx.query('select * from birthday_template'))).rows.length,0);
  await assert.rejects(asUser(db,role,tx=>tx.query("select save_birthday_template(2026,'forged','forged',1)")));
  await assert.rejects(asUser(db,role,tx=>tx.query('select enqueue_company_mail(null,true)')));
  await assert.rejects(asUser(db,role,tx=>tx.query('select claim_company_mail(null)')));
 }
 await assert.rejects(asUser(db,'admin',tx=>tx.query('select * from birthday_calendar')));
 const sent:string[]=[],store=mailStore(db);const result=await dispatchMail(store,config,fakeMail(sent));assert.equal(result.sent,3); // one birthday, two registrations to CEO only
 assert.equal(sent.filter(m=>m.includes('To: kim@example.test')).length,1);
 assert.equal(sent.filter(m=>m.includes('To: '+ceoDeliveryEmail)).length,2);
 assert.ok(sent.every(m=>!m.includes('Bcc:')&&!m.includes('Cc:')));
 await dispatchMail(store,config,fakeMail(sent));assert.equal(sent.length,3);
 await asService(db,tx=>tx.query('select enqueue_company_mail(null,true)'));assert.equal((await db.query("select * from company_mail_delivery where kind='BIRTHDAY'")).rows.length,1);
 const metadata=JSON.stringify((await db.query('select * from company_mail_delivery')).rows);assert.ok(!metadata.includes('PRIVATE-FAMILY')&&!metadata.includes('1990-01-02'));
 assert.equal((await asUser(db,'employee',tx=>tx.query<{value:string}>('select family_notification_status($1) value',[familyId]))).rows[0].value,'SENT');
 }finally{await db.close();}});

test('mail unavailable stays pending; concurrent claims, ambiguous sends and provider failures cannot duplicate',async()=>{const db=await operationsDatabase();try{
 const store=mailStore(db),sent:string[]=[];
 assert.equal((await dispatchMail(store,undefined,fakeMail(sent),familyId)).configured,false);assert.equal(sent.length,0);
 assert.equal((await db.query<{state:string}>('select state from company_mail_delivery')).rows[0].state,'PENDING');
 await dispatchMail(store,config,fakeMail(sent,true),familyId);assert.equal(sent.length,1);
 assert.equal((await db.query<{state:string}>('select state from company_mail_delivery')).rows[0].state,'UNKNOWN');
 await dispatchMail(store,config,fakeMail(sent),familyId);assert.equal(sent.length,1);
 await store.enqueue(otherFamilyId);const claims=await Promise.all([store.claim(otherFamilyId),store.claim(otherFamilyId)]);assert.equal(claims.filter(Boolean).length,1);
 // Crash after durable claim: SENDING is never automatically recycled.
 assert.equal(await store.claim(otherFamilyId),null);
 const forged={...claims.find(Boolean)!,token:randomUUID()};await assert.rejects(store.finish(forged,'forged',false));
 const claim=claims.find(Boolean)!;await store.finish(claim,'message-2',false);await assert.rejects(store.finish(claim,'message-2',false));
 }finally{await db.close();}});

test('scheduler is not early, excludes inactive/future/non-birthday recipients and indexes only month/day',async()=>{const db=await operationsDatabase();try{
 await asUser(db,'admin',tx=>tx.query("select save_birthday_template(2026,'Hello {{name}}','Birthday {{birthday}}',0)"));
 await db.exec("create or replace function company_mail_now() returns timestamptz language sql stable as $$select '2026-01-01T23:59:00Z'::timestamptz$$;");
 await asService(db,tx=>tx.query('select enqueue_company_mail(null,true)'));assert.equal((await db.query("select * from company_mail_delivery where kind='BIRTHDAY'")).rows.length,0);
 await db.exec("create or replace function company_mail_now() returns timestamptz language sql stable as $$select '2026-01-02T00:00:00Z'::timestamptz$$;");
 await db.query("update employee set employment_status='INACTIVE' where id=$1",[personId]);await asService(db,tx=>tx.query('select enqueue_company_mail(null,true)'));assert.equal((await db.query("select * from company_mail_delivery where kind='BIRTHDAY'")).rows.length,0);
 await db.query("update employee set employment_status='ACTIVE',hire_date='2026-02-01' where id=$1",[personId]);await asService(db,tx=>tx.query('select enqueue_company_mail(null,true)'));assert.equal((await db.query("select * from company_mail_delivery where kind='BIRTHDAY'")).rows.length,0);
 const changed=encryptValue('1990-03-04',`${personId}:birth`,ring);await db.query('update employee_birth_detail set birth_date_encrypted=$1 where employee_id=$2',[changed,personId]);assert.equal((await db.query('select * from birthday_calendar')).rows.length,0);
 await asService(db,tx=>tx.query('select backfill_birthday_calendar($1,$2,3,4)',[personId,changed]));assert.deepEqual((await db.query('select * from birthday_calendar')).rows,[{employee_id:personId,month:3,day:4}]);
 await assert.rejects(asService(db,tx=>tx.query("select backfill_birthday_calendar($1,'stale',3,4)",[personId])));
 }finally{await db.close();}});

test('cron secret, template variables, header safety and explicit company capabilities',()=>{
 assert.ok(cronAuthorized('Bearer '+ 'a'.repeat(32),'a'.repeat(32)));assert.ok(!cronAuthorized(null,'a'.repeat(32)));assert.ok(!cronAuthorized('Bearer guessed','a'.repeat(32)));assert.ok(!cronAuthorized('Bearer short','short'));
 const form=(values:Record<string,string>)=>{const f=new FormData();Object.entries(values).forEach(([k,v])=>f.set(k,v));return f;};
 assert.throws(()=>templateInput(form({year:'2026',subject:'{{salary}}',body:'x'})));assert.throws(()=>templateInput(form({year:'2026',subject:'bad\r\nBcc: x',body:'x'})));assert.throws(()=>familyInput(form({category:'OTHER',event_date:'2026-10-01',title:'x',details:'x'})));
 assert.equal(renderTemplate('{{name}} {{birthday}}','Kim','01-02'),'Kim 01-02');
 assert.throws(()=>rawMessage({id:'x',token:'x',kind:'BIRTHDAY',email:'victim@example.test\r\nBcc: other@example.test',name:'x',subject:'x',body:'x'},'shared@example.test'));
 for(const role of ['EMPLOYEE','TEAM_LEADER','EXPENSE_ADMIN','IT_ADMIN','DIVISION_HEAD'] as const){const p={id:idFor('employee'),name:'x',roles:[role],grants:[]};assert.ok(!can(p,'ANNOUNCEMENT_MANAGE')&&!can(p,'FAMILY_EVENT_REVIEW'));}
});

test('employee writes update or clear the minimal calendar atomically and old RPC cannot bypass it',async()=>{const db=await operationsDatabase();try{
 const id=randomUUID(),profile={name:'Calendar test',company_email:'calendar@example.test',title:'T',hire_date:'2026-01-01',employment_status:'ACTIVE',roles:['EMPLOYEE']};
 const cipher=encryptValue('1990-02-28',`${id}:birth`,ring);
 await asUser(db,'admin',tx=>tx.query('select save_employee_with_birthday($1,$2,0,$3,false,null,2,28)',[id,profile,cipher]));
 assert.deepEqual((await db.query('select month,day from birthday_calendar where employee_id=$1',[id])).rows,[{month:2,day:28}]);
 await assert.rejects(asUser(db,'admin',tx=>tx.query('select save_employee_with_birthday($1,$2,1,$3,false,null,2,30)',[id,{...profile,name:'must rollback'},cipher])));
 assert.equal((await db.query<{name:string}>('select name from employee where id=$1',[id])).rows[0].name,'Calendar test');
 assert.deepEqual((await db.query('select month,day from birthday_calendar where employee_id=$1',[id])).rows,[{month:2,day:28}]);
 await assert.rejects(asUser(db,'admin',tx=>tx.query('select save_employee_profile($1,$2,1,null,true,null)',[id,profile])));
 await asUser(db,'admin',tx=>tx.query('select save_employee_with_birthday($1,$2,1,null,true,null,null,null)',[id,profile]));
 assert.equal((await db.query('select * from birthday_calendar where employee_id=$1',[id])).rows.length,0);
 assert.equal((await db.query('select * from employee_birth_detail where employee_id=$1',[id])).rows.length,0);
 }finally{await db.close();}});

test('long Unicode mail subjects preserve text with bounded MIME headers',()=>{
 const subject='🎉 생일을 축하합니다 '.repeat(20),mime=Buffer.from(rawMessage({id:randomUUID(),token:randomUUID(),kind:'FAMILY_EVENT',email:'ceo@example.test',name:'CEO',subject,body:'safe'},'shared@example.test'),'base64url').toString();
 const headers=mime.split('\r\n\r\n')[0].split('\r\n');assert.ok(headers.every(line=>Buffer.byteLength(line)<=78));
 const decoded=[...mime.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)].map(match=>Buffer.from(match[1],'base64').toString()).join('');assert.equal(decoded,subject);
});


test('private CEO mail ignores Admin-editable profile addresses and requires verified auth identity',async()=>{const db=await operationsDatabase();try{
 const profile={name:'대표자',company_email:'redirected@example.test',title:'운영',hire_date:'2025-01-01',employment_status:'ACTIVE',roles:['EMPLOYEE']};
 await asUser(db,'admin',tx=>tx.query('select save_employee_with_birthday($1,$2,1,null,false,null,null,null)',[ceoEmployeeId,profile]));
 await assert.rejects(asUser(db,'admin',tx=>tx.query('update auth.users set email=$1 where id=$2',[profile.company_email,idFor('ceo')])));
 const store=mailStore(db);await store.enqueue(familyId);
 const claim=await store.claim(familyId);assert.equal(claim?.email,ceoDeliveryEmail);assert.ok(claim?.body.includes('PRIVATE-FAMILY-DETAILS'));
 assert.notEqual(claim?.email,profile.company_email);await store.finish(claim!,'verified-message',false);
 await store.enqueue(otherFamilyId);await db.query('update auth.users set email_confirmed_at=null where id=$1',[idFor('ceo')]);
 assert.equal(await store.claim(otherFamilyId),null);
 assert.equal((await db.query<{state:string}>('select state from company_mail_delivery where subject_id=$1',[otherFamilyId])).rows[0].state,'CANCELLED');
 }finally{await db.close();}});
