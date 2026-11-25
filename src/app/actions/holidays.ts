'use server';
import {randomUUID} from 'node:crypto';
import {revalidatePath} from 'next/cache';
import {requireCapability} from '@/lib/auth/access';
import {leaveRpc} from '@/lib/leave/data';
import {isUuid,validDate} from '@/lib/employees/validation';
import type {FormState} from '@/lib/employees/types';
export async function saveHoliday(_state:FormState,form:FormData):Promise<FormState>{
 await requireCapability('HOLIDAY_MANAGE');
 const id=String(form.get('id')||randomUUID()),day=String(form.get('day')||''),name=String(form.get('name')||'').trim(),version=Number(form.get('version')),active=form.get('active')!=='false';
 if(!isUuid(id)||!validDate(day)||!name||name.length>100||!Number.isInteger(version)||version<0)return {error:'날짜와 휴일명을 확인해 주세요.'};
 try{await leaveRpc('save_company_holiday',{p_id:id,p_day:day,p_name:name,p_version:version,p_active:active});}
 catch(error){const code=error&&typeof error==='object'&&'code'in error?error.code:'';return {error:code==='40001'?'달력이 변경되었습니다. 새로고침 후 다시 시도해 주세요.':'저장할 수 없습니다. 확인된 연도와 권한, 중복 날짜를 확인해 주세요.'};}
 for(const path of ['/admin/holidays','/leave/request','/leave/team-calendar','/leave/approvals'])revalidatePath(path);
 return {success:'저장했습니다.'};
}
