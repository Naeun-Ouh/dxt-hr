import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {PDFDocument,PDFName,PDFRawStream} from 'pdf-lib';
import {contractsDatabase,contractId,contractHash,contractBody} from './contracts-fixture';
import {asUser} from './domain-fixture';
import {asService} from './operations-fixture';
import {normalizeSeal} from '../src/lib/contracts/seal-image';
import {contractPdf} from '../src/lib/contracts/pdf';
import type {Contract,Signature} from '../src/lib/contracts/types';
const a='a1000000-0000-4000-8000-000000000001',b='a1000000-0000-4000-8000-000000000002';
async function reserve(db:Awaited<ReturnType<typeof contractsDatabase>>,id:string,role='admin'){
 await asUser(db,role,tx=>tx.query('select reserve_company_seal($1,$2,$3,$4)',[id,'TEST Company','TEST Representative','a'.repeat(64)]));
 await db.query("insert into storage.objects(bucket_id,name) values('company-seals',$1)",[id+'/seal.png']);
}
test('seal RLS, RPC, raw Storage and append-only metadata enforce manager boundaries',async()=>{const db=await contractsDatabase();try{
 await reserve(db,a);
 for(const role of ['employee','leader','it','expense']){
  assert.equal((await asUser(db,role,tx=>tx.query('select id from company_seal'))).rows.length,0);
  for(const sql of ['select reserve_company_seal($1,\'Forged\',\'Forged\',repeat(\'a\',64))','select activate_company_seal($1,null)','select deactivate_company_seal($1)'])await assert.rejects(()=>asUser(db,role,tx=>tx.query(sql,[b])));
 }
 for(const role of ['employee','leader','admin','ceo']){
  assert.equal((await asUser(db,role,tx=>tx.query("select * from storage.objects where bucket_id='company-seals'"))).rows.length,0);
  await assert.rejects(()=>asUser(db,role,tx=>tx.query("insert into storage.objects(bucket_id,name) values('company-seals','forged.png')")));
  await assert.rejects(()=>asUser(db,role,tx=>tx.query('update company_seal set active=true where id=$1',[a])));
 }
 await assert.rejects(()=>asUser(db,'ceo',tx=>tx.query('select activate_company_seal($1,null)',[a])));
 await asUser(db,'admin',tx=>tx.query('select activate_company_seal($1,null)',[a]));
 await assert.rejects(()=>db.query("update company_seal set storage_path='forged' where id=$1",[a]));
 await assert.rejects(()=>db.query('delete from company_seal_event'));
 await reserve(db,b,'ceo');
 await assert.rejects(()=>asUser(db,'ceo',tx=>tx.query('select activate_company_seal($1,null)',[b])));
 await asUser(db,'ceo',tx=>tx.query('select activate_company_seal($1,$2)',[b,a]));
 assert.deepEqual((await db.query('select id from company_seal where active')).rows,[{id:b}]);
 await asUser(db,'ceo',tx=>tx.query('select deactivate_company_seal($1)',[b]));
 assert.equal((await db.query('select id from company_seal where active')).rows.length,0);
}finally{await db.close();}});
test('company signature freezes seal before PDF retry, replacement and replay; completion stays immutable',async()=>{const db=await contractsDatabase();try{
 await reserve(db,a);await asUser(db,'admin',tx=>tx.query('select activate_company_seal($1,null)',[a]));
 for(const [role,rpc] of [['employee','sign_employee_contract'],['ceo','sign_company_contract']])await asUser(db,role,tx=>tx.query(`select ${rpc}($1,1,$2,true)`,[contractId,contractHash]));
 const read=()=>db.query<Signature>('select * from employment_contract_signature where contract_id=$1 order by signed_at',[contractId]);
 const before=(await read()).rows;assert.equal(before.find(s=>s.party==='COMPANY')?.company_seal_id,a);
 await reserve(db,b,'ceo');await asUser(db,'ceo',tx=>tx.query('select activate_company_seal($1,$2)',[b,a]));
 await asUser(db,'ceo',tx=>tx.query('select sign_company_contract($1,1,$2,true)',[contractId,contractHash]));assert.deepEqual((await read()).rows,before);
 const c=(await db.query<Contract>('select * from employment_contract where id=$1',[contractId])).rows[0];
 await assert.rejects(()=>contractPdf(c,contractBody,contractHash,before));
 const seal=await sharp({create:{width:100,height:100,channels:4,background:'#cc0000'}}).png().toBuffer();
 const bytes=await contractPdf(c,contractBody,contractHash,before,seal),pdf=await PDFDocument.load(bytes);
 assert.ok(pdf.context.enumerateIndirectObjects().some(([,obj])=>obj instanceof PDFRawStream&&obj.dict.get(PDFName.of('Subtype'))===PDFName.of('Image')));
 const path=contractId+'/sealed.pdf';await db.query("insert into storage.objects(bucket_id,name) values('employment-contracts',$1)",[path]);
 await asService(db,tx=>tx.query('select complete_employment_contract($1,1,$2,$3)',[contractId,path,contractHash]));
 const completed=(await db.query('select * from employment_contract where id=$1',[contractId])).rows;
 await asService(db,tx=>tx.query('select complete_employment_contract($1,1,$2,$3)',[contractId,contractId+'/replacement.pdf','b'.repeat(64)]));
 assert.deepEqual((await db.query('select * from employment_contract where id=$1',[contractId])).rows,completed);
 await assert.rejects(()=>db.query('update employment_contract_signature set company_seal_id=$1 where contract_id=$2',[b,contractId]));
 await assert.rejects(()=>db.query("update employment_contract set pdf_path='new.pdf' where id=$1",[contractId]));
 assert.deepEqual((await read()).rows,before);
}finally{await db.close();}});
test('PNG normalization rejects spoofed, malformed, oversized and excessive dimensions',async()=>{
 const png=await sharp({create:{width:60,height:60,channels:4,background:'#cc000080'}}).png().toBuffer();
 const animated=Buffer.concat([png.subarray(0,33),Buffer.from([0,0,0,0,97,99,84,76,0,0,0,0]),png.subarray(33)]);await assert.rejects(()=>normalizeSeal(animated));
 const normalized=await normalizeSeal(Buffer.concat([png,Buffer.from('untrusted trailing metadata')]));assert.equal(normalized.hash.length,64);assert.ok(!normalized.bytes.includes(Buffer.from('untrusted trailing metadata')));
 for(const input of [Buffer.from('<svg/>'),Buffer.alloc(1048577),png.subarray(0,20),await sharp({create:{width:2049,height:1,channels:4,background:'#fff'}}).png().toBuffer()])await assert.rejects(()=>normalizeSeal(input));
});
test('no seal remains supported and pre-migration company signatures are never backfilled',async()=>{const db=await contractsDatabase({legacyEvidence:true});try{
 const {readFileSync}=await import('node:fs');
 await db.exec(readFileSync('supabase/migrations/20261119104141_contract_signature_evidence.sql','utf8'));
 for(const [role,rpc] of [['employee','sign_employee_contract'],['ceo','sign_company_contract']])await asUser(db,role,tx=>tx.query(`select ${rpc}($1,1,$2,true)`,[contractId,contractHash]));
 const before=(await db.query<Record<string,unknown>>('select * from employment_contract_signature order by party')).rows;
 await db.exec(readFileSync('supabase/migrations/20261120030704_company_seals.sql','utf8'));
 const after=(await db.query<Record<string,unknown>>('select * from employment_contract_signature order by party')).rows;
 assert.deepEqual(after,before.map(row=>({...row,company_seal_id:null,company_name:null,representative_name:null})));
 const c=(await db.query<Contract>('select * from employment_contract where id=$1',[contractId])).rows[0];
 assert.equal((await contractPdf(c,contractBody,contractHash,after as unknown as Signature[])).subarray(0,5).toString(),'%PDF-');
}finally{await db.close();}});
