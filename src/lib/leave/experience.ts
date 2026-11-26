import type {Source,LeaveRequest,Bucket} from './types';
import {workingDays} from './validation';
/** Read-only display model. Never substitutes for the locked database allocation. */
export function balanceExperience(sources:Source[],requests:LeaveRequest[],asOf:string){
 const known=sources.filter(s=>s.validity_confirmed&&s.valid_from&&s.valid_until);
 const usable=known.filter(s=>s.valid_from!<=asOf&&s.valid_until!>=asOf);
 const pending=requests.filter(r=>r.status==='PENDING');
 const annualPending=pending.filter(r=>r.kind!=='BIRTHDAY').reduce((n,r)=>n+Number(r.days),0);
 const available=usable.filter(s=>s.bucket!=='BIRTHDAY').reduce((n,s)=>n+Number(s.balance),0);
 const horizon=new Date(asOf+'T00:00:00Z');horizon.setUTCDate(horizon.getUTCDate()+60);
 return {available,pending:annualPending,birthdayPending:pending.filter(r=>r.kind==='BIRTHDAY').reduce((n,r)=>n+Number(r.days),0),
  estimated:Math.max(0,available-annualPending),shortfall:Math.max(0,annualPending-available),
  unknown:sources.filter(s=>!s.validity_confirmed).reduce((n,s)=>n+Number(s.balance),0),
  expiring:usable.filter(s=>s.valid_until!<=horizon.toISOString().slice(0,10)).reduce((n,s)=>n+Number(s.balance),0),
  buckets:Object.fromEntries((['ANNUAL','CARRYOVER','SUBSTITUTE','BIRTHDAY'] as Bucket[]).map(b=>[b,{known:sources.some(s=>s.bucket===b&&s.validity_confirmed),available:usable.filter(s=>s.bucket===b).reduce((n,s)=>n+Number(s.balance),0)}])) as Record<Bucket,{known:boolean;available:number}>};
}
export function requestExperience(start:string,end:string,unit:string,sources:Source[],holidays:string[]){
 const workDates:string[]=[],weekends:string[]=[],excluded:string[]=[];
 const a=Date.parse(start),b=Date.parse(end);
 if(Number.isFinite(a)&&Number.isFinite(b)&&b>=a&&b-a<=366*86400000){
  for(let d=a;d<=b;d+=86400000){const date=new Date(d),key=date.toISOString().slice(0,10);if([0,6].includes(date.getUTCDay()))weekends.push(key);else if(holidays.includes(key))excluded.push(key);else workDates.push(key);}
 }
 const days=workingDays(start,end,unit,holidays),first=workDates[0],last=workDates.at(-1);
 const eligible=sources.filter(s=>s.bucket!=='BIRTHDAY'&&s.validity_confirmed&&first&&last&&s.valid_from!<=first&&s.valid_until!>=last);
 const split=sources.some(s=>s.bucket!=='BIRTHDAY'&&s.validity_confirmed&&Number(s.balance)>0&&workDates.some(d=>s.valid_from!<=d&&s.valid_until!>=d)&&workDates.some(d=>d<s.valid_from!||d>s.valid_until!));
 let remaining=days;
 const allocation=(['SUBSTITUTE','CARRYOVER','ANNUAL'] as const).map(bucket=>{const available=eligible.filter(s=>s.bucket===bucket).reduce((n,s)=>n+Number(s.balance),0),taken=Math.min(remaining,available);remaining-=taken;return {bucket,available,taken,after:available-taken};});
 return {workDates,weekends,excluded,days,allocation,split,available:allocation.reduce((n,a)=>n+a.available,0),shortfall:remaining,crossYear:start.slice(0,4)!==end.slice(0,4)};
}

/** Event totals, never reconstructed from a current balance or imported opening balance. */
export function annualGrantEvidence(rows:import('./types').Ledger[],sources:{id:string;legacy:boolean}[],year:number){
 const ids=new Set(sources.filter(s=>!s.legacy).map(s=>s.id));
 const annual=rows.filter(r=>r.year===year&&r.bucket==='ANNUAL');
 const confirmed=annual.filter(r=>ids.has(r.source_id));
 return {positive:confirmed.filter(r=>r.event_type==='ADJUSTMENT'&&Number(r.amount_delta)>0).reduce((n,r)=>n+Number(r.amount_delta),0),
  negative:-confirmed.filter(r=>r.event_type==='ADJUSTMENT'&&Number(r.amount_delta)<0).reduce((n,r)=>n+Number(r.amount_delta),0),
  used:-annual.filter(r=>r.event_type==='DEDUCTION'||r.event_type==='REVERSAL').reduce((n,r)=>n+Number(r.amount_delta),0),
  hasEvidence:confirmed.some(r=>r.event_type==='ADJUSTMENT'&&Number(r.amount_delta)>0),legacyUnverified:sources.some(s=>s.legacy)||annual.some(r=>!ids.has(r.source_id))};
}
