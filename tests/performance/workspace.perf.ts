import {test,expect,type APIRequestContext,type Page} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {loginAs} from '../e2e/fixtures';
import {approvalId} from './seed';
type Aggregate={count:number,totalMs:number,errors:number};
type Counts={http:Record<string,Aggregate>;adapterSql:Aggregate};
type Sample={readyMs:number;counts:Counts};
const results:Record<string,{first:Sample;warm:Sample[];p50Ms:number;p95Ms:number}>={};
const headers={'x-dxt-perf-control':'synthetic-only'};
async function measure(page:Page,request:APIRequestContext,action:()=>Promise<void>):Promise<Sample>{
 await page.waitForLoadState('networkidle');
 expect((await request.post('http://localhost:54329/_performance',{headers})).ok()).toBeTruthy();
 const start=performance.now();await action();await page.waitForLoadState('networkidle');
 const readyMs=performance.now()-start;
 const metrics=await request.get('http://localhost:54329/_performance',{headers});expect(metrics.ok()).toBeTruthy();
 return {readyMs,counts:await metrics.json() as Counts};
}
function record(name:string,samples:Sample[]){for(const sample of samples){expect(sample.counts.adapterSql.errors).toBe(0);for(const aggregate of Object.values(sample.counts.http))expect(aggregate.errors).toBe(0);}const sorted=samples.slice(1).map(x=>x.readyMs).sort((a,b)=>a-b);results[name]={first:samples[0],warm:samples.slice(1),p50Ms:sorted[Math.ceil(sorted.length*.5)-1],p95Ms:sorted[Math.ceil(sorted.length*.95)-1]};}
test.afterAll(()=>{
 const directory=process.env.DXT_PERF_OUTPUT||join(tmpdir(),'dxt-performance-results');mkdirSync(directory,{recursive:true});
 const label=(process.env.DXT_PERF_LABEL||'sample').replace(/[^a-zA-Z0-9_-]/g,'_');
 writeFileSync(join(directory,`${label}.json`),JSON.stringify({label,workload:'synthetic-v1-50-employees-200-month-claims',warmSamples:10,measurement:'Local production build, hard navigation/action through networkidle; first request is not hosted cold start. HTTP totals include mock queue; adapterSql excludes RLS setup and SQL inside stored functions.',results},null,2));
});
for(const [name,role,path] of [['employee-home','employee','/'],['employee-expenses','employee','/expenses?month=2026-10'],['leader-approvals','leader','/leave/approvals'],['admin-expenses','admin','/admin/expenses?month=2026-10'],['ceo-employees','ceo','/admin/employees']]){
 test(name,async({page,context,request})=>{await loginAs(context,role);const samples:Sample[]=[];for(let i=0;i<11;i++)samples.push(await measure(page,request,async()=>{const response=await page.goto(path);expect(response?.status()).toBe(200);await expect(page.locator('main')).toBeVisible();}));record(name,samples);});
}
test('employee-save',async({page,context,request})=>{
 await loginAs(context,'employee');await page.goto('/expenses?month=2026-10');const samples:Sample[]=[];
 for(let i=0;i<11;i++){
  await page.getByRole('textbox',{name:'1행 사용처',exact:true}).fill(`합성 저장 ${i}`);
  samples.push(await measure(page,request,async()=>{const response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/expenses'));await page.getByRole('button',{name:'일괄 저장',exact:true}).click();expect((await response).ok()).toBeTruthy();await expect(page.getByRole('button',{name:'일괄 저장',exact:true})).toBeDisabled();}));
 }
 record('employee-save',samples);
});
test('leader-approval',async({page,context,request})=>{
 await loginAs(context,'leader');const samples:Sample[]=[];
 for(let i=0;i<11;i++){
  await page.goto(`/leave/approvals?request=${approvalId(i)}`);
  samples.push(await measure(page,request,async()=>{await page.getByRole('dialog').getByRole('button',{name:'승인',exact:true}).click();await expect(page.getByRole('dialog').getByRole('button',{name:'승인 취소',exact:true})).toBeVisible();}));
 }
 record('leader-approval',samples);
});
