'use server';
import {randomUUID} from 'node:crypto';
import {redirect,notFound} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireCapability} from '@/lib/auth/access';
import {leaveRpc,today,requestDetail} from '@/lib/leave/data';
import {leaveInput,decisionItems} from '@/lib/leave/validation';
import {ValidationError,isUuid,versionFrom} from '@/lib/employees/validation';
import type {FormState} from '@/lib/employees/types';
const messages:Record<string,string>={PAST_REASON_REQUIRED:'미리 신청하지 못한 사유를 입력해 주세요.',INSUFFICIENT_BALANCE:'사용 가능한 연차가 부족합니다. 관리자에게 잔여 일수를 확인해 주세요.',OVERLAPPING_LEAVE:'이미 신청한 날짜와 시간이 겹칩니다. 신청 내역을 확인해 주세요.',INVALID_EMPLOYEE_DATE:'입사일 이후의 날짜를 선택해 주세요.',INACTIVE_EMPLOYEE:'퇴사한 직원의 신청은 승인할 수 없습니다.',INVALID_STATE:'이미 처리된 신청입니다. 새로고침해 주세요.'};
function failure(error:unknown):FormState{if(error instanceof ValidationError)return {error:error.message,fields:error.fields};if(error&&typeof error==='object'){if('code'in error&&error.code==='40001')return {error:'다른 사용자가 변경했습니다. 새로고침 후 다시 시도해 주세요.'};if('message'in error&&typeof error.message==='string'&&messages[error.message])return {error:messages[error.message]};}return {error:'처리할 수 없습니다. 권한과 입력 내용을 확인하고 새로고침해 주세요.'};}
function refresh(){for(const path of ['/leave','/leave/requests','/leave/approvals','/leave/team-calendar','/admin/leave'])revalidatePath(path);}
export async function submitLeave(_state:FormState,form:FormData):Promise<FormState>{
 await requireCapability('EMPLOYEE_ACCESS');const id=randomUUID();
 try{await leaveRpc('submit_leave',{p_id:id,...leaveInput(form,await today())});}catch(error){return failure(error);}
 refresh();redirect('/leave/requests/'+id+'?saved=1');
}
export async function decideLeave(_state:FormState,form:FormData):Promise<FormState>{
 await requireCapability('TEAM_LEAVE_APPROVE');
 try{
  const items=decisionItems(form.getAll('selection')),action=String(form.get('decision')||''),note=String(form.get('note')||'').trim();
  if(!['APPROVED','REJECTED','CANCELLED'].includes(action)||note.length>2000)throw new ValidationError({decision:'처리 내용을 확인해 주세요.'});
  // Each selected row is checked with current RLS before the atomic DB recheck.
  for(const item of items){const r=await requestDetail(item.id);if(!await leaveRpc<boolean>('leave_reviewer',{p_employee:r.employee_id}))notFound();}
  await leaveRpc('review_leave',{p_items:items,p_action:action,p_note:note});
 }catch(error){if(error&&typeof error==='object'&&'digest'in error)throw error;return failure(error);}
 refresh();return {success:'처리했습니다.'};
}
export async function adjustLeave(id:string,year:number,_state:FormState,form:FormData):Promise<FormState>{
 await requireCapability('LEAVE_MANAGE');if(!isUuid(id))notFound();
 try{const delta=Number(form.get('delta')),reason=String(form.get('reason')||'').trim();if(!Number.isFinite(delta)||!delta||Math.abs(delta)>366||delta*2%1||!reason||reason.length>2000)throw new ValidationError({reason:'0.5일 단위 조정 일수와 사유를 입력해 주세요.'});
 await leaveRpc('adjust_leave',{p_employee:id,p_year:year,p_delta:delta,p_reason:reason,p_version:versionFrom(form)});
 }catch(error){return failure(error);}
 refresh();redirect('/admin/leave/'+id+'?year='+year+'&saved=1');
}
