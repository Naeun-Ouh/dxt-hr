import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedBody, BODY_LIMIT, previewMigration, SOURCE_LIMIT } from '../src/lib/migration/review';
import {sha256} from '../src/lib/migration/dry-run';
const id='10000000-0000-4000-8000-000000000001';
const bytes=Buffer.from('[]');
const mapping={version:'test',reviewedSourceSha256:sha256(bytes),asOf:'2026-01-01',employees:{a:id},expected:{records:0,assets:0,expenseAmount:0,historyPeriods:0},exclusions:[]};
test('web preview is deterministic and rejects unknown live employee mappings and oversized input',async()=>{
 const run=(source=bytes,m=mapping,name='source.json')=>previewMigration(source,name,JSON.stringify(m),new Set([id]));
 const result=await run();assert.equal(result.applySupported,false);assert.equal(result.reviewStatus,'READY_FOR_REVIEW');assert.deepEqual(await run(),result);
 await assert.rejects(()=>previewMigration(bytes,'source.json',JSON.stringify(mapping),new Set()));
 await assert.rejects(()=>run(Buffer.alloc(SOURCE_LIMIT+1)));await assert.rejects(()=>run(bytes,mapping,'source.csv'));
 assert.equal((await run(bytes,{...mapping,reviewedSourceSha256:'0'.repeat(64)})).reviewStatus,'BLOCKED');
});
test('streaming request cap works without or with forged content-length',async()=>{
 const request=(value:Uint8Array,headers:Record<string,string>={})=>new Request('https://example.test',{method:'POST',body:value.buffer as ArrayBuffer,headers});
 assert.equal((await boundedBody(request(new Uint8Array([1,2])))).length,2);
 await assert.rejects(()=>boundedBody(request(new Uint8Array(BODY_LIMIT+1))));
 await assert.rejects(()=>boundedBody(request(new Uint8Array(BODY_LIMIT+1),{'content-length':'1'})));
 await assert.rejects(()=>boundedBody(request(new Uint8Array([1]),{'content-length':String(BODY_LIMIT+1)})));
});
