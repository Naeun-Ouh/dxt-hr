import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { operationsDatabase,asService,familyId } from './operations-fixture';
import { asUser } from './domain-fixture';

test('active schema rejects mail enqueue/claim even with service credentials and preserves registrations',async()=>{
 const db=await operationsDatabase();try{
  for(const sql of ['select enqueue_company_mail(null,true)','select claim_company_mail(null)']){
   await assert.rejects(asService(db,tx=>tx.query(sql)),/permission denied/);
   for(const role of ['employee','admin','ceo'])await assert.rejects(asUser(db,role,tx=>tx.query(sql)),/permission denied/);
  }
  assert.equal((await db.query('select * from company_mail_delivery')).rows.length,0);
  assert.equal((await db.query<{notification_queued:boolean}>('select notification_queued from family_registration where id=$1',[familyId])).rows[0].notification_queued,false);
  assert.equal((await asUser(db,'ceo',tx=>tx.query('select * from family_registration'))).rows.length,2);
 }finally{await db.close();}
});

test('retired worker and endpoint never touch credentials, network or queues even when configured',()=>{
 const script=`
 import assert from 'node:assert/strict';
 import {runCompanyMail} from './src/lib/operations/mail-server.ts';
 import {GET} from './src/app/api/cron/company-mail/route.ts';
 globalThis.fetch=async()=>{throw new Error('Unexpected network access');};
 for(const configured of [false,true]){
  for(const key of ['GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GMAIL_REFRESH_TOKEN','GMAIL_SENDER','CRON_SECRET','SUPABASE_SERVICE_ROLE_KEY'])
   process.env[key]=configured?'synthetic-credential': '';
  assert.deepEqual(await runCompanyMail(),{sent:0,uncertain:0,configured:false,disabled:true});
  assert.equal((await runCompanyMail('a3000000-0000-4000-8000-000000000001')).disabled,true);
  const response=await GET();assert.equal(response.status,410);assert.equal((await response.json()).disabled,true);
 }`;
 execFileSync(process.execPath,['--conditions=react-server','--import','tsx','--input-type=module','-e',script]);
 assert.equal(JSON.parse(readFileSync('vercel.json','utf8')).crons,undefined);
});
