import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { dryRun, readMapping, readRows, sha256, workbookRows, type Mapping, type SourceRow } from '../src/lib/migration/dry-run';
import { legacyWorkbookFixture } from './legacy-workbook-fixture';
const employee='10000000-0000-4000-8000-000000000001';
const asset:SourceRow={key:'asset-1',sheet:'Assets',row:2,employeeKey:'a',asset:{type:'NOTEBOOK',status:'IN_USE',manufacturer:'TEST',model:'TEST',serial_number:'SECRET-SERIAL'},history:[{employeeKey:'a',start:'2026-01-01',end:null}]};
const expense:SourceRow={key:'expense-1',sheet:'Expenses',row:2,employeeKey:'a',expense:{id:'source-1',version:0,usage_date:'2026-01-02',expense_type:'OTHER',merchant:'PRIVATE MERCHANT',description:'PRIVATE DESCRIPTION',account_category:'기타',amount:271818,payment_method:'CASH',evidence_type:'현금영수증',project_id:null,trip_context:'',notes:'PRIVATE NOTES',attachment_id:'',attendees:[]}};
function setup(rows:SourceRow[]=[asset,expense]){const bytes=Buffer.from(JSON.stringify(rows));const mapping:Mapping={version:'review-v1',reviewedSourceSha256:sha256(bytes),asOf:'2026-01-31',employees:{a:employee},expected:{records:rows.length,assets:rows.filter(r=>r.asset).length,expenseAmount:rows.reduce((s,r)=>s+(Number.isSafeInteger(r.expense?.amount)?r.expense!.amount:0),0),historyPeriods:rows.reduce((s,r)=>s+(r.history?.length??0),0)},exclusions:[]};return {bytes,mapping};}
test('offline manifest is deterministic, reconciled, and contains no employee identity or payload',()=>{
 const {bytes,mapping}=setup();const report=dryRun(bytes,readRows(JSON.parse(bytes.toString())),readMapping(mapping));
 assert.equal(report.reviewStatus,'READY_FOR_REVIEW');assert.deepEqual(report.counts,{candidates:2,rejected:0,excluded:0});assert.equal(report.totals.historyPeriods,1);assert.equal(report.totals.expenseAmount,271818);
 assert.deepEqual(report,dryRun(bytes,[asset,expense],mapping));assert.equal(report.applySupported,false);
 for(const secret of [employee,'PRIVATE','SECRET-SERIAL','asset-1'])assert.ok(!JSON.stringify(report).includes(secret));
});
test('duplicate source keys and normalized serials reject every conflicting row',()=>{
 const rows=[asset,{...asset,key:'asset-2',row:3,asset:{...asset.asset!,serial_number:' secret-serial '}},{...asset,row:4}];const {bytes,mapping}=setup(rows);const report=dryRun(bytes,rows,mapping);
 assert.equal(report.counts.rejected,3);assert.ok(report.diagnostics.some(d=>d.code==='DUPLICATE_KEY'));assert.ok(report.diagnostics.some(d=>d.code==='DUPLICATE_SERIAL'));
});
test('malformed mappings, missing identity mapping, future dates, unsafe money and raw references block review',()=>{
 const {mapping}=setup();assert.throws(()=>readMapping({...mapping,employees:{a:'not-a-uuid'}}));assert.throws(()=>readMapping({...mapping,expected:{...mapping.expected,records:-1}}));assert.throws(()=>readRows([{...asset,unexpected:'ignored'}]));
 const rows=[{...expense,employeeKey:'missing',expense:{...expense.expense!,usage_date:'2026-02-30',amount:NaN,project_id:employee}}];const s=setup(rows);const report=dryRun(s.bytes,rows,s.mapping);
 for(const code of ['DATE','AMOUNT','EMPLOYEE_MAPPING','UNREVIEWED_FOREIGN_REFERENCE'])assert.ok(report.diagnostics.some(d=>d.code===code));assert.equal(report.reviewStatus,'BLOCKED');
});

test('expense duplicate suspicion warns while inherited object names never resolve identities',()=>{
 const rows=[expense,{...expense,key:'expense-2',row:3}];let s=setup(rows);let report=dryRun(s.bytes,rows,s.mapping);
 assert.equal(report.reviewStatus,'READY_FOR_REVIEW');assert.equal(report.diagnostics.filter(d=>d.code==='DUPLICATE').length,2);
 const forged=[{...expense,employeeKey:'toString'}];s=setup(forged);report=dryRun(s.bytes,forged,s.mapping);assert.equal(report.reviewStatus,'BLOCKED');assert.ok(report.diagnostics.some(d=>d.code==='EMPLOYEE_MAPPING'));
});
test('history is never fabricated and overlap/multiple holders fail',()=>{
 const missing={...asset,history:undefined};let s=setup([missing]);let report=dryRun(s.bytes,[missing],s.mapping);assert.equal(report.totals.historyPeriods,0);assert.ok(report.diagnostics.some(d=>d.code==='HISTORY_NOT_PROVIDED'));
 const bad={...asset,history:[{employeeKey:'a',start:'2026-01-01',end:null},{employeeKey:'a',start:'2026-01-02',end:null}]};s=setup([bad]);report=dryRun(s.bytes,[bad],s.mapping);assert.ok(report.diagnostics.some(d=>d.code==='HISTORY_INVALID'));assert.ok(report.diagnostics.some(d=>d.code==='MULTIPLE_ACTIVE_HOLDERS'));
});
test('historical holder mappings reject inherited object keys',()=>{
 const rows=[{...asset,employeeKey:undefined,history:[{employeeKey:'toString',start:'2026-01-01',end:'2026-01-02'}]}];
 const {bytes,mapping}=setup(rows);const report=dryRun(bytes,rows,mapping);
 assert.equal(report.reviewStatus,'BLOCKED');assert.ok(report.diagnostics.some(d=>d.code==='HISTORY_INVALID'));
});
test('reviewed exclusions, expected totals and byte-level source provenance cannot silently drift',()=>{
 const {bytes,mapping}=setup();mapping.exclusions=[{key:'sample-1',sheet:'Examples',row:3,reason:'SAMPLE',amount:100}];mapping.expected.records++;mapping.expected.expenseAmount+=100;
 assert.equal(dryRun(bytes,[asset,expense],mapping).reviewStatus,'READY_FOR_REVIEW');
 const report=dryRun(Buffer.concat([bytes,Buffer.from(' ')]),[asset,expense],{...mapping,expected:{...mapping.expected,expenseAmount:0}});
 assert.ok(report.diagnostics.some(d=>d.code==='SOURCE_HASH_MISMATCH'));assert.ok(report.diagnostics.some(d=>d.code==='RECONCILIATION_EXPENSEAMOUNT'));
});
test('existing legacy workbook adapter preserves sheet/row, computes vehicle totals and excludes SAMPLE rows',async()=>{
 const book=legacyWorkbookFixture();book.getWorksheet('주유비,통행비')!.getRow(6).values=['TEST TRIP','TEST A','TEST B',100,2,null,null,null,'TEST TRIP','TEST A','TEST B',50,2];
 const bytes=Buffer.from(await book.xlsx.writeBuffer());const mapping:Mapping={version:'v1',reviewedSourceSha256:sha256(bytes),asOf:'2026-01-31',employees:{a:employee},expected:{records:4,assets:0,expenseAmount:300,historyPeriods:0},exclusions:[{key:'summary-fuel',sheet:'지출결의서',row:12,reason:'SUMMARY',amount:0},{key:'summary-toll',sheet:'지출결의서',row:13,reason:'SUMMARY',amount:0}],workbook:{month:'2026-01',vehicleDate:'2026-01-10',attendees:[],rows:{'주유비,통행비!6 (주유비)':{key:'fuel',employeeKey:'a'},'주유비,통행비!6 (통행비)':{key:'toll',employeeKey:'a'}}}};
 const input=await workbookRows(bytes,mapping), report=dryRun(bytes,input.rows,mapping,input.diagnostics);
 assert.equal(report.reviewStatus,'READY_FOR_REVIEW');assert.equal(report.totals.expenseAmount,300);assert.ok(report.records.every(r=>r.provenance.row===6));
 const again=await workbookRows(bytes,mapping);assert.deepEqual(report,dryRun(bytes,again.rows,mapping,again.diagnostics));
 const unmatched=await workbookRows(bytes,{...mapping,workbook:{...mapping.workbook!,rows:{}}});assert.ok(unmatched.diagnostics.some(d=>d.code==='UNMAPPED_WORKBOOK_ROW'));
});
test('CLI creates only a new owner-private report, no overwrite, summary-only output',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dxt-dry-run-'));
 try{const {bytes,mapping}=setup();await writeFile(join(dir,'source.json'),bytes);await writeFile(join(dir,'mapping.json'),JSON.stringify(mapping));const args=['--import','tsx',resolve('scripts/legacy-dry-run.ts'),'json',join(dir,'source.json'),join(dir,'mapping.json'),join(dir,'report.json')];const run=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(run.status,0,run.stderr);assert.equal(JSON.parse(run.stdout).status,'READY_FOR_REVIEW');assert.ok(!run.stdout.includes('271818'));assert.equal((await stat(join(dir,'report.json'))).mode&0o777,0o600);assert.equal(spawnSync(process.execPath,args,{encoding:'utf8'}).status,1);assert.deepEqual(await readFile(join(dir,'source.json')),bytes);
 }finally{await rm(dir,{recursive:true,force:true});}
});
