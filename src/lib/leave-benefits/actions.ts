'use server';
import {randomUUID} from 'node:crypto';
import {revalidatePath} from 'next/cache';
import {requireCapability} from '@/lib/auth/access';
import {leaveRpc} from '@/lib/leave/data';
import {isUuid} from '@/lib/employees/validation';
import type {BenefitKind,BenefitPlan,BenefitResult} from './types';
const messages:Record<string,string>={PRIOR_SUBSTITUTE_MAPPING_REQUIRED:'기존 수동·이관 대휴의 근무 연결을 먼저 대조해 주세요. 잔액이 0이어도 기지급 이력이 있으면 자동 지급하지 않습니다.',YEAR_END_NOT_RECONCILED:'연말 잔여분 대조 전에는 이월할 수 없습니다. 다음 회계연도에 다시 확인하세요.',PENDING_YEAR_END_REQUESTS:'연말까지의 대기 휴가를 먼저 처리해 주세요.',UNVERIFIED_OPENING_BALANCE:'사용기간 미확정 재원을 먼저 확인해 주세요.',POST_CUTOFF_ADJUSTMENT_REVIEW_REQUIRED:'연말 이후 원장 변경이 있어 원본 대조가 필요합니다.',STALE_BENEFIT_PREVIEW:'원장 또는 근거가 변경되었습니다. 새로 미리보기해 주세요.',BENEFIT_ALREADY_LINKED:'이미 반영한 근거입니다. 처리 이력을 확인하세요.',BENEFIT_ALREADY_USED_REVIEW_REQUIRED:'이미 사용하거나 이월한 재원은 자동 정정할 수 없습니다. 담당자 검토가 필요합니다.',EXPIRED_WORK_REVIEW_REQUIRED:'해당 연도가 지난 주말근무는 별도 검토가 필요합니다.',INACTIVE_EMPLOYEE_REVIEW_REQUIRED:'재직 상태를 확인한 뒤 별도 검토해 주세요.',STALE_LEAVE:'잔액이 변경되었습니다. 새로고침 후 다시 확인하세요.'};
function failure(error:unknown):BenefitResult{const message=error&&typeof error==='object'&&'message'in error?String(error.message):'';return {error:messages[message]||'처리하지 못했습니다. 권한·입력·근거 상태를 확인하고 다시 미리보기해 주세요.'};}
function refresh(){for(const path of ['/admin/leave/benefits','/admin/leave','/leave'])revalidatePath(path);}
export async function previewBenefit(kind:BenefitKind,reference:string,source:string|null):Promise<BenefitResult>{
 await requireCapability('LEAVE_MANAGE');if(!['WEEKEND','CARRYOVER'].includes(kind)||!isUuid(reference)||(source!==null&&!isUuid(source)))return {error:'검토할 근거를 선택해 주세요.'};
 try{return {plan:await leaveRpc<BenefitPlan>('preview_leave_benefit',{p_kind:kind,p_reference:reference,p_source:source}),operationId:randomUUID()};}catch(error){return failure(error);}
}
export async function applyBenefit(id:string,plan:BenefitPlan,reason:string,reconciled:boolean):Promise<BenefitResult>{
 await requireCapability('LEAVE_MANAGE');if(!isUuid(id)||!plan||typeof plan!=='object'||JSON.stringify(plan).length>16000||typeof reason!=='string'||reason.trim().length<5||reason.length>1000||reconciled!==true)return {error:'원본·기지급 내역 대조와 회사 복지 기준 확인 후 5자 이상의 사유를 입력해 주세요.'};
 try{await leaveRpc('apply_leave_benefit',{p_id:id,p_plan:plan,p_reason:reason.trim(),p_reconciled:true});refresh();return {success:'확인된 재원을 반영했습니다.'};}catch(error){return failure(error);}
}
export async function reverseBenefit(operation:string,version:number,reason:string):Promise<BenefitResult>{
 await requireCapability('LEAVE_MANAGE');if(!isUuid(operation)||!Number.isInteger(version)||version<0||typeof reason!=='string'||reason.trim().length<5||reason.length>1000)return {error:'정정할 내역과 5자 이상의 근거를 확인해 주세요.'};
 try{await leaveRpc('reverse_leave_benefit',{p_operation:operation,p_version:version,p_reason:reason.trim()});refresh();return {success:'원본을 보존하고 정정 원장을 기록했습니다.'};}catch(error){return failure(error);}
}

export async function cancelApprovedWork(work:string,version:number,accountVersion:number|null,reason:string):Promise<BenefitResult>{
 await requireCapability('LEAVE_MANAGE');if(!isUuid(work)||!Number.isInteger(version)||version<1||(accountVersion!==null&&(!Number.isInteger(accountVersion)||accountVersion<0))||typeof reason!=='string'||reason.trim().length<5||reason.length>1000)return {error:'취소할 근무와 5자 이상의 근거를 확인해 주세요.'};
 try{await leaveRpc('cancel_approved_weekend_work',{p_work:work,p_version:version,p_account_version:accountVersion,p_reason:reason.trim()});refresh();revalidatePath('/leave/weekend-work');revalidatePath('/leave/weekend-work/approvals');return {success:'승인을 취소하고 연결된 미사용 재원을 정정했습니다. 원본 근무와 이력은 보존됩니다.'};}catch(error){return failure(error);}
}
