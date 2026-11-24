import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PDFDocument} from 'pdf-lib';
import sharp from 'sharp';
import {contractsDatabase} from './contracts-fixture';
import {asUser,personId} from './domain-fixture';
import {asService} from './operations-fixture';
import {colleagueId} from './project-fixture';
import {validateDocument} from '../src/lib/hr-documents/validation';
async function setup(){const db=await contractsDatabase();await db.exec(readFileSync('supabase/migrations/20261124134708_employee_hr_documents.sql','utf8'));return db;}
async function reserve(db:Awaited<ReturnType<typeof setup>>,employee=personId,type='RESUME',role='designated'){
 const r=await asUser(db,role,tx=>tx.query<{id:string}>("select reserve_hr_document($1,$2,'synthetic.pdf','application/pdf',20,repeat('a',64),null,null) id",[employee,type]));
 const id=r.rows[0].id;
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('employee-hr-documents',$1,'{\"size\":20,\"mimetype\":\"application/pdf\"}')",[employee+'/'+id]);
 await asService(db,tx=>tx.query('select finish_hr_document($1)',[id]));return id;
}
test('HR documents scope: own allowed files, private HR only management, cross-user and team denied',async()=>{const db=await setup();try{
 const a=await reserve(db),b=await reserve(db,colleagueId),other=await reserve(db,personId,'OTHER_HR');
 assert.equal((await asUser(db,'employee',tx=>tx.query('select id from employee_hr_document'))).rows.length,1);
 for(const role of ['employee','leader','admin','it','division','expense']){
  const target=role==='expense'?a:b;
  assert.equal((await asUser(db,role,tx=>tx.query('select id from employee_hr_document where id=$1',[target]))).rows.length,0);
  await assert.rejects(()=>asUser(db,role,tx=>tx.query("select access_hr_document($1,'DOWNLOAD')",[target])));
  await assert.rejects(()=>asUser(db,role,tx=>tx.query('select archive_hr_document($1)',[a])));
  await assert.rejects(()=>reserve(db,personId,'RESUME',role));
  await assert.rejects(()=>asUser(db,role,tx=>tx.query('select finish_hr_document($1)',[a])));
 }
 await assert.rejects(()=>asUser(db,'employee',tx=>tx.query("select access_hr_document($1,'VIEW')",[other])));
 for(const role of ['ceo','designated'])assert.equal((await asUser(db,role,tx=>tx.query('select id from employee_hr_document'))).rows.length,3);
 await asUser(db,'employee',tx=>tx.query("select access_hr_document($1,'DOWNLOAD')",[a]));
 await asUser(db,'ceo',tx=>tx.query("select access_hr_document($1,'VIEW')",[a]));
 assert.deepEqual((await db.query<{action:string}>('select action from employee_hr_document_event where document_id=$1 order by occurred_at',[a])).rows.map(r=>r.action),['UPLOAD','DOWNLOAD','VIEW']);
}finally{await db.close();}});
test('HR document versions, archive, immutable paths/history and private Storage deny bypasses',async()=>{const db=await setup();try{
 const a=await reserve(db),b=await reserve(db);
 await asUser(db,'ceo',tx=>tx.query('select archive_hr_document($1)',[a]));
 await asUser(db,'ceo',tx=>tx.query('select archive_hr_document($1)',[a]));
 assert.equal((await db.query("select * from employee_hr_document_event where action='ARCHIVE'")).rows.length,1);
 assert.deepEqual((await asUser(db,'employee',tx=>tx.query('select id from employee_hr_document'))).rows,[{id:b}]);
 await assert.rejects(()=>asUser(db,'employee',tx=>tx.query("select access_hr_document($1,'VIEW')",[a])));
 await asUser(db,'designated',tx=>tx.query("select access_hr_document($1,'DOWNLOAD')",[a]));
 assert.equal((await db.query('select version from employee_hr_document order by version')).rows.length,2);
 for(const role of ['employee','leader','admin','designated','ceo']){
  assert.equal((await asUser(db,role,tx=>tx.query("select * from storage.objects where bucket_id='employee-hr-documents'"))).rows.length,0);
  await assert.rejects(()=>asUser(db,role,tx=>tx.query("insert into storage.objects(bucket_id,name) values('employee-hr-documents','forged')")));
  await assert.rejects(()=>asUser(db,role,tx=>tx.query('update employee_hr_document set employee_id=$1 where id=$2',[colleagueId,b])));
 }
 await assert.rejects(()=>db.query("update employee_hr_document set storage_path='forged' where id=$1",[a]));
 await assert.rejects(()=>db.query('delete from employee_hr_document where id=$1',[a]));
 await assert.rejects(()=>db.query('delete from employee_hr_document_event'));
 await assert.rejects(()=>db.transaction(async tx=>{await tx.exec('set local role anon');await tx.query('select finish_hr_document($1)',[b]);}));
 assert.equal((await db.query<{public:boolean}>("select public from storage.buckets where id='employee-hr-documents'")).rows[0].public,false);
}finally{await db.close();}});
test('HR upload validates filename, MIME, signature, actual decode and size',async()=>{
 const pdf=await PDFDocument.create();pdf.addPage();const bytes=Buffer.from(await pdf.save());
 assert.equal((await validateDocument(new File([bytes],'resume.pdf',{type:'application/pdf'}))).hash.length,64);
 for(const type of ['png','jpeg'] as const){const image=await sharp({create:{width:2,height:2,channels:3,background:'#fff'}})[type]().toBuffer();await validateDocument(new File([image],`bank.${type}`,{type:`image/${type}`}));}
 for(const file of [new File([bytes],'../resume.pdf',{type:'application/pdf'}),new File([bytes],'resume.png',{type:'image/png'}),new File(['%PDF- bad'],'resume.pdf',{type:'application/pdf'}),new File([Buffer.alloc(10485761)],'big.pdf',{type:'application/pdf'}),new File(['<svg/>'],'x.jpg',{type:'image/jpeg'})])await assert.rejects(()=>validateDocument(file));
});
test('unpublished files stay hidden; finish requires a stored validated object and anon cannot mutate',async()=>{const db=await setup();try{
 const row=await asUser(db,'ceo',tx=>tx.query<{id:string}>("select reserve_hr_document($1,'BANKBOOK_COPY','bank.pdf','application/pdf',20,repeat('b',64),null,null) id",[personId]));const id=row.rows[0].id;
 for(const role of ['employee','ceo','designated'])assert.equal((await asUser(db,role,tx=>tx.query('select id from employee_hr_document where id=$1',[id]))).rows.length,0);
 await assert.rejects(()=>asService(db,tx=>tx.query('select finish_hr_document($1)',[id])));
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('employee-hr-documents',$1,'{\"size\":19,\"mimetype\":\"application/pdf\"}')",[personId+'/'+id]);
 await assert.rejects(()=>asService(db,tx=>tx.query('select finish_hr_document($1)',[id])));
 for(const sql of ["select reserve_hr_document($1,'RESUME','x.pdf','application/pdf',20,repeat('a',64),null,null)","select access_hr_document($1,'DOWNLOAD')",'select archive_hr_document($1)'])await assert.rejects(()=>db.transaction(async tx=>{await tx.exec('set local role anon');await tx.query(sql,[id]);}));
 for(const role of ['employee','leader','ceo']){
  const before=(await db.query('select * from storage.objects where name=$1',[personId+'/'+id])).rows;
  await asUser(db,role,async tx=>{await tx.query('update storage.objects set name=$1 where name=$2',['forged',personId+'/'+id]);await tx.query('delete from storage.objects where name=$1',[personId+'/'+id]);}).catch(()=>{});
  assert.deepEqual((await db.query('select * from storage.objects where name=$1',[personId+'/'+id])).rows,before);
 }
}finally{await db.close();}});
