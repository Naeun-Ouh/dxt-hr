import 'server-only';
import {requireCapability} from '@/lib/auth/access';
import {readRows} from '@/lib/operations/data';
import {leaveRpc} from '@/lib/leave/data';
import type {Source} from '@/lib/leave/types';
import type {BenefitCandidate,BenefitHistory,BenefitOperation,ApprovedWork} from './types';
export async function benefitData(){
 await requireCapability('LEAVE_MANAGE');
 const [people,work,cases,operations,reversals]=await Promise.all([
  readRows<{id:string;name:string}>('employee','id,name'),
  readRows<{id:string;employee_id:string;work_date:string;indicative_days:number;version:number}>('weekend_work','id,employee_id,work_date,indicative_days,version',{status:'APPROVED'}),
  readRows<{id:string;employee_id:string;year:number}>('leave_carryover_case','id,employee_id,year',{state:'CONFIRMED'}),
  readRows<BenefitOperation>('leave_benefit_operation','id,employee_id,kind,to_source,days,reason,occurred_at,plan'),
  readRows<{operation_id:string}>('leave_benefit_reversal','operation_id',{},'operation_id'),
 ]);
 const names=Object.fromEntries(people.map(p=>[p.id,p.name]));
 const sourceKeys=[...new Set([...cases.map(c=>c.employee_id+':'+c.year),...operations.map(o=>o.employee_id+':'+o.plan.year)])];
 const sourceRows:(readonly [string,Source[]])[]=[];
 // Bound parallel RPC fan-out while retaining every authorized employee/year.
 for(let i=0;i<sourceKeys.length;i+=8)sourceRows.push(...await Promise.all(sourceKeys.slice(i,i+8).map(async key=>{const [employee,year]=key.split(':');return [key,await leaveRpc<Source[]>('leave_sources',{p_employee:employee,p_year:Number(year)})] as const;})));
 const sources=new Map(sourceRows);const candidates:BenefitCandidate[]=work.filter(w=>!operations.some(o=>o.plan.reference===w.id)).map(w=>({key:w.id,kind:'WEEKEND',reference:w.id,source:null,employee:names[w.employee_id]||'직원',label:`${w.work_date} · 주말근무 · ${w.indicative_days}일`}));
 for(const c of cases)for(const s of sources.get(c.employee_id+':'+c.year)||[]){if(!['ANNUAL','SUBSTITUTE'].includes(s.bucket)||!s.validity_confirmed||s.receiving_year!==c.year||Number(s.balance)<=0||operations.some(o=>o.plan.source===s.id))continue;candidates.push({key:c.id+':'+s.id,kind:'CARRYOVER',reference:c.id,source:s.id,employee:names[c.employee_id]||'직원',label:`${c.year}년 이월 검토 · ${s.bucket==='ANNUAL'?'연차':'대휴'} · ${s.balance}일 · ${s.note}`});}
 const history:BenefitHistory[]=operations.map(o=>({...o,employee:names[o.employee_id]||'직원',version:sources.get(o.employee_id+':'+o.plan.year)?.find(s=>s.id===o.to_source)?.version??null,reversed:reversals.some(r=>r.operation_id===o.id)}));
 const approvedWork:ApprovedWork[]=work.map(w=>({...w,employee:names[w.employee_id]||'직원',accountVersion:history.find(o=>o.plan.reference===w.id)?.version??null}));
 return {candidates,approvedWork,history:history.toSorted((a,b)=>b.occurred_at.localeCompare(a.occurred_at))};
}
