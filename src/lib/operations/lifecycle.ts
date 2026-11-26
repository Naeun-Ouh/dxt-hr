import type {OperationCase,OperationTask} from './types';
export type LifecycleTask=Pick<OperationTask,'id'|'case_id'|'type'|'status'>;
export function lifecycleReadiness(record:OperationCase,tasks:LifecycleTask[],today:string){
 if(record.completed_at)return {label:'처리 완료',remaining:0,checks:[] as string[]};
 const remaining=tasks.filter(t=>t.case_id===record.id&&!['DONE','NOT_APPLICABLE'].includes(t.status)).length;
 const checks:string[]=[];if(remaining)checks.push(`체크리스트 ${remaining}건`);
 if(record.kind==='offboarding'){if(!record.resignation_date)checks.push('퇴사일 입력');else if(record.resignation_date>today)checks.push('퇴사일 도래 전');if(!record.document_received)checks.push('사직서 수령');if(!record.unused_leave_checked)checks.push('미사용 휴가 확인');}
 return {label:checks.length?'확인 필요':'완료 검토 가능',remaining,checks};
}
// Bound PostgREST IN filters and page within each batch; the adapter orders by unique task ID.
export async function loadLifecycleTasks(caseIds:string[],page:(ids:string[],from:number,to:number)=>Promise<LifecycleTask[]>){
 const result:LifecycleTask[]=[],unique=[...new Set(caseIds)];
 for(let offset=0;offset<unique.length;offset+=64){const ids=unique.slice(offset,offset+64);for(let from=0;;from+=500){const rows=await page(ids,from,from+499);result.push(...rows);if(rows.length<500)break;}}
 return result;
}
