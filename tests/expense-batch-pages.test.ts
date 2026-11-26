import test from 'node:test';
import assert from 'node:assert/strict';
import {expenseBatchPages} from '../src/lib/expenses/batch-pages';

test('expense batches preserve scoped IDs, deterministic paging, and rows beyond API limits',async()=>{
 const ids=Array.from({length:205},(_,i)=>String(i).padStart(3,'0'));
 const calls:{ids:string[];from:number;to:number}[]=[];
 const rows=await expenseBatchPages([...ids].reverse().concat(ids),async(batch,from,to)=>{
  calls.push({ids:batch,from,to});
  return batch.flatMap(id=>Array.from({length:6},(_,n)=>`${id}:${n}`)).slice(from,to+1);
 });
 assert.equal(rows.length,1230);assert.equal(new Set(rows).size,1230);
 assert(calls.every(c=>c.ids.length<=100&&c.ids.every(id=>ids.includes(id))));
 assert.equal(calls.filter(c=>c.from===500).length,2);
 assert.deepEqual(rows,ids.flatMap(id=>Array.from({length:6},(_,n)=>`${id}:${n}`)));
});
test('expense batching bounds concurrency and never queries an empty scope',async()=>{
 let active=0,peak=0,calls=0;
 await expenseBatchPages([],async()=>{calls++;return [];});assert.equal(calls,0);
 await expenseBatchPages(Array.from({length:951},(_,i)=>String(i)),async()=>{
  active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,1));active--;return [];
 });assert.equal(peak,4);
});
test('expense batch failure does not return a misleading partial result',async()=>{
 await assert.rejects(expenseBatchPages(['a'],async(_ids,from)=>{
  if(from)throw new Error('unavailable');return Array(500).fill('row');
 }),/unavailable/);
});
