import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {contractsDatabase} from './contracts-fixture';
import {asUser,personId} from './domain-fixture';

test('merged HR documents, certificates and holidays preserve independent authorization scopes',async()=>{
 const db=await contractsDatabase();
 try{
  for(const file of ['20261124134708_employee_hr_documents.sql','20261124220933_hr_document_v1_transport_limit.sql','20261124220945_employment_certificates.sql','20261124221310_leave_holiday_calendar.sql'])await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'));
  for(const [role,expected] of [['admin',[true,true,false]],['ceo',[true,true,true]],['designated',[true,true,true]],['employee',[false,false,false]],['leader',[false,false,false]],['expense',[false,false,false]],['it',[false,false,false]],['division',[false,false,false]]] as const){
   const result=await asUser(db,role,tx=>tx.query<{certificate:boolean;holiday:boolean;private:boolean}>("select has_app_capability('HR_CERTIFICATE_MANAGE') certificate,has_app_capability('HOLIDAY_MANAGE') holiday,has_app_capability('PRIVATE_HR_ACCESS') private"));
   assert.deepEqual(Object.values(result.rows[0]),[...expected],role);
   if(!expected[2])await assert.rejects(asUser(db,role,tx=>tx.query("select reserve_hr_document($1,'RESUME','synthetic.pdf','application/pdf',100,$2,null,null)",[personId,'a'.repeat(64)])));
  }
  const buckets=await db.query<{id:string;public:boolean;file_size_limit:number}>("select id,public,file_size_limit from storage.buckets where id in ('employee-hr-documents','hr-certificates','company-seals')");
  assert.equal(buckets.rows.length,3);assert.ok(buckets.rows.every(bucket=>!bucket.public));
  assert.equal(buckets.rows.find(bucket=>bucket.id==='employee-hr-documents')?.file_size_limit,4194304);
  for(const role of ['anon','authenticated']){
   const privileges=await db.query<{documents:boolean;certificates:boolean}>("select has_function_privilege($1,'public.finish_hr_document(uuid)','EXECUTE') documents,has_function_privilege($1,'public.finish_hr_certificate(uuid,text,text)','EXECUTE') certificates",[role]);
   assert.deepEqual(privileges.rows[0],{documents:false,certificates:false});
  }
 }finally{await db.close();}
});
