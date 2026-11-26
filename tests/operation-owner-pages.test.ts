import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTaskOwners} from '../src/lib/operations/owner-pages';
import type {TaskOwner} from '../src/lib/operations/types';

test('eight checklist tasks load owners in one scoped request, empty scope makes none',async()=>{
 let calls=0;const ids=Array.from({length:8},(_,i)=>`task-${i}`);
 const result=await loadTaskOwners([...ids,ids[0]],async(batch,from,to)=>{
  calls++;assert.deepEqual(batch,ids);assert.equal(from,0);assert.equal(to,499);
  return batch.map(task_id=>({task_id,employee_id:'owner'}));
 });
 assert.equal(calls,1);assert.equal(result.length,8);
 assert.deepEqual(await loadTaskOwners([],async()=>{throw Error('unbounded query');}),[]);
});

test('bounded task batches and owner pagination preserve multiple owners without truncation',async()=>{
 const ids=Array.from({length:70},(_,i)=>`task-${String(i).padStart(3,'0')}`);
 const source:TaskOwner[]=ids.flatMap(task_id=>Array.from({length:10},(_,i)=>({task_id,employee_id:`owner-${i}`})));
 const calls:{ids:string[];from:number;to:number}[]=[];
 const rows=await loadTaskOwners(ids,async(batch,from,to)=>{
  calls.push({ids:batch,from,to});assert.ok(batch.length<=64);
  return source.filter(row=>batch.includes(row.task_id)).slice(from,to+1);
 });
 assert.deepEqual(rows,source);assert.equal(calls.length,3);
 assert.deepEqual(calls.map(c=>c.from),[0,500,0]);
 await assert.rejects(()=>loadTaskOwners(ids,async()=>{throw Error('permission changed');}),/permission changed/);
});
