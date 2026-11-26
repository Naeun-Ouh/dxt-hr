'use server';
import {randomUUID} from 'node:crypto';
import {revalidatePath} from 'next/cache';
import {requireCapability} from '@/lib/auth/access';
import {leaveRpc,ownEmployee} from '@/lib/leave/data';
import {weekendRecord} from '@/lib/leave/weekend-data';
import {minuteValue} from '@/lib/leave/weekend';
import {isUuid,validDate,versionFrom} from '@/lib/employees/validation';
import type {FormState} from '@/lib/employees/types';
const failure=():FormState=>({error:'처리할 수 없습니다. 본인·팀 범위, 주말 날짜, 중복 신청과 현재 상태를 확인해 주세요.'});
function refresh(){revalidatePath('/leave/weekend-work');revalidatePath('/leave/weekend-work/approvals');}
export async function submitWeekendWork(_state:FormState,form:FormData):Promise<FormState>{
 await requireCapability('EMPLOYEE_ACCESS');
 try{const day=String(form.get('day')??''),reason=String(form.get('reason')??'').trim(),project=String(form.get('project')??''),start=minuteValue(form.get('start')),end=minuteValue(form.get('end')),pause=Number(form.get('break'));
 if(!validDate(day)||!reason||reason.length>2000||(project&&!isUuid(project))||!Number.isInteger(pause)||pause<0||end<=start||pause>=end-start)throw Error('INVALID_INPUT');
 await leaveRpc('submit_weekend_work',{p_id:randomUUID(),p_day:day,p_start:start,p_end:end,p_break:pause,p_project:project||null,p_reason:reason});
 }catch{return failure();}refresh();return {success:'근무 내역을 등록했습니다. 검토 후에도 대휴는 자동 지급되지 않습니다.'};
}
export async function decideWeekendWork(_state:FormState,form:FormData):Promise<FormState>{
 const action=String(form.get('decision')??'');await requireCapability(action==='CANCELLED'?'EMPLOYEE_ACCESS':'TEAM_LEAVE_APPROVE');
 try{const id=String(form.get('id')??''),row=await weekendRecord(id);if(action==='CANCELLED'){if(row.employee_id!==await ownEmployee())return failure();}else if(!['APPROVED','REJECTED'].includes(action)||!await leaveRpc<boolean>('weekend_work_reviewer',{p_employee:row.employee_id}))return failure();
 await leaveRpc('decide_weekend_work',{p_id:id,p_version:versionFrom(form),p_action:action});
 }catch(error){if(error&&typeof error==='object'&&'digest'in error)throw error;return failure();}refresh();return {success:'처리했습니다. 대휴 원장은 변경되지 않았습니다.'};
}
