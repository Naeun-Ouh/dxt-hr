import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {PDFDocument,PDFName,PDFRawStream} from 'pdf-lib';
import {contractsDatabase} from './contracts-fixture';
import {asUser,personId} from './domain-fixture';
import {asService} from './operations-fixture';
import {certificatePdf} from '../src/lib/certificates/pdf';
import type {Certificate} from '../src/lib/certificates/types';
const id='d3200000-0000-4000-8000-000000000001',other='d3200000-0000-4000-8000-000000000002',seal='d3200000-0000-4000-8000-000000000003';
async function setup(){const db=await contractsDatabase();await db.exec(readFileSync('supabase/migrations/20261124220945_employment_certificates.sql','utf8'));return db;}
async function request(db:Awaited<ReturnType<typeof setup>>,key=id,role='employee'){await asUser(db,role,tx=>tx.query('select request_hr_certificate($1,$2,$3)',[key,'은행 제출','테스트']));}
async function stamp(db:Awaited<ReturnType<typeof setup>>){await asUser(db,'admin',tx=>tx.query('select reserve_company_seal($1,$2,$3,$4)',[seal,'TEST DXT','TEST 대표','a'.repeat(64)]));await db.query("insert into storage.objects(bucket_id,name) values('company-seals',$1)",[seal+'/seal.png']);await asUser(db,'admin',tx=>tx.query('select activate_company_seal($1,null)',[seal]));}
test('certificates derive owner, deny cross-user and leader scope, reject forged writes and private Storage',async()=>{const db=await setup();try{
 await request(db);await request(db);assert.equal((await db.query('select * from hr_certificate_event')).rows.length,1);
 assert.equal((await db.query<{employee_id:string}>('select employee_id from hr_certificate')).rows[0].employee_id,personId);
 for(const role of ['expense','leader','it','division']){
 assert.equal((await asUser(db,role,tx=>tx.query('select * from hr_certificate where id=$1',[id]))).rows.length,0);
 await assert.rejects(()=>asUser(db,role,tx=>tx.query("select review_hr_certificate($1,'APPROVED','')",[id])));
 await assert.rejects(()=>asUser(db,role,tx=>tx.query('select cancel_hr_certificate($1)',[id])));
 await assert.rejects(()=>asUser(db,role,tx=>tx.query('select record_hr_certificate_download($1)',[id])));
 }
 for(const role of ['employee','leader','admin','ceo']){
 await assert.rejects(()=>asUser(db,role,tx=>tx.query("update hr_certificate set employee_id='10000000-0000-4000-8000-000000000002' where id=$1",[id])));
 await assert.rejects(()=>asUser(db,role,tx=>tx.query('select finish_hr_certificate($1,$2,$3)',[id,id+'/forged.pdf','a'.repeat(64)])));
 await assert.rejects(()=>asUser(db,role,tx=>tx.query("insert into storage.objects(bucket_id,name) values('hr-certificates','forged.pdf')")));
 }
 await assert.rejects(()=>asUser(db,'employee',tx=>tx.query("select request_hr_certificate($1,'bank','','10000000-0000-4000-8000-000000000002')",[other])));
 await asUser(db,'admin',tx=>tx.query("select review_hr_certificate($1,'REJECTED','서류 확인')",[id]));
 await asUser(db,'admin',tx=>tx.query("select review_hr_certificate($1,'REJECTED','다른 사유')",[id]));
 const rejected=(await db.query<Certificate>('select * from hr_certificate')).rows[0];assert.equal(rejected.pdf_path,null);assert.equal(rejected.rejection_reason,'서류 확인');
 await assert.rejects(()=>db.query('delete from hr_certificate_event'));
}finally{await db.close();}});
test('approval snapshots master and seal, issue and replay immutable PDF with stored SHA-256',async()=>{const db=await setup();try{
 await request(db);await assert.rejects(()=>asUser(db,'admin',tx=>tx.query("select review_hr_certificate($1,'APPROVED','')",[id])));await stamp(db);
 await asUser(db,'admin',tx=>tx.query("select save_hr_certificate_setting('TEST address','TEST registration')"));
 await asUser(db,'admin',tx=>tx.query("select review_hr_certificate($1,'APPROVED','')",[id]));
 const c=(await db.query<Certificate>('select * from hr_certificate where id=$1',[id])).rows[0];assert.equal(c.seal_id,seal);assert.equal(c.snapshot?.address,'TEST address');assert.ok(!('birth_date' in c.snapshot!));
 await asUser(db,'admin',tx=>tx.query('select deactivate_company_seal($1)',[seal]));
 await db.query("update employee set name='변경된 이름' where id=$1",[personId]);
 await asUser(db,'admin',tx=>tx.query("select review_hr_certificate($1,'APPROVED','')",[id]));assert.deepEqual((await db.query('select snapshot from hr_certificate where id=$1',[id])).rows[0],{snapshot:c.snapshot});
 const image=await sharp({create:{width:60,height:60,channels:4,background:'#cc0000'}}).png().toBuffer();
 const bytes=await certificatePdf(c,image),hash=createHash('sha256').update(bytes).digest('hex');const pdf=await PDFDocument.load(bytes);assert.ok(pdf.context.enumerateIndirectObjects().some(([,obj])=>obj instanceof PDFRawStream&&obj.dict.get(PDFName.of('Subtype'))===PDFName.of('Image')));
 const path=id+'/final.pdf';await db.query("insert into storage.objects(bucket_id,name) values('hr-certificates',$1)",[path]);
 await asService(db,tx=>tx.query('select finish_hr_certificate($1,$2,$3)',[id,path,hash]));
 await asService(db,tx=>tx.query('select finish_hr_certificate($1,$2,$3)',[id,id+'/replacement.pdf','b'.repeat(64)]));
 const final=(await db.query<Certificate>('select * from hr_certificate where id=$1',[id])).rows[0];assert.equal(final.pdf_sha256,hash);assert.equal(final.pdf_path,path);
 await assert.rejects(()=>db.query("update hr_certificate set purpose='changed' where id=$1",[id]));
 assert.equal((await db.query("select * from hr_certificate_event where action='ISSUED'")).rows.length,1);
 for(const role of ['employee','leader','admin','ceo'])assert.equal((await asUser(db,role,tx=>tx.query("select * from storage.objects where bucket_id='hr-certificates'"))).rows.length,0);
 await asUser(db,'employee',tx=>tx.query('select record_hr_certificate_download($1)',[id]));
}finally{await db.close();}});
test('cancellation is own-only, preapproval-only and replay-safe',async()=>{const db=await setup();try{await request(db);await asUser(db,'employee',tx=>tx.query('select cancel_hr_certificate($1)',[id]));await asUser(db,'employee',tx=>tx.query('select cancel_hr_certificate($1)',[id]));assert.equal((await db.query("select * from hr_certificate_event where action='CANCELLED'")).rows.length,1);await assert.rejects(()=>asUser(db,'admin',tx=>tx.query("select review_hr_certificate($1,'APPROVED','')",[id])));}finally{await db.close();}});

test('certificate PDF transport cap accepts exactly 4 MiB and rejects invalid or larger buffers',async()=>{
 const {assertCertificatePdfSize,CERTIFICATE_PDF_MAX_BYTES,CertificatePdfSizeError}=await import('../src/lib/certificates/limits');
 assert.equal(CERTIFICATE_PDF_MAX_BYTES,4194304);assert.doesNotThrow(()=>assertCertificatePdfSize(1));assert.doesNotThrow(()=>assertCertificatePdfSize(CERTIFICATE_PDF_MAX_BYTES));
 for(const size of [0,-1,NaN,Infinity,1.5,CERTIFICATE_PDF_MAX_BYTES+1])assert.throws(()=>assertCertificatePdfSize(size),CertificatePdfSizeError);
});
