'use server';
import {requireCapability} from '../auth/access';
import {employeeClient} from '../employees/data';
import {isUuid} from '../employees/validation';
import {revalidatePath} from 'next/cache';
export async function saveCarryover(form:FormData):Promise<{error?:string}>{
 await requireCapability('LEAVE_MANAGE');const db=await employeeClient();const action=String(form.get('action')||''),version=Number(form.get('version'));
 if(!Number.isSafeInteger(version)||version<0)return {error:'최신 상태를 확인해 주세요.'};
 let result;
 if(action==='capture'){
  const employee=String(form.get('employee')||''),year=Number(form.get('year'));if(!isUuid(employee)||!Number.isInteger(year)||year<1900||year>9998)return {error:'직원과 기준 연도를 확인해 주세요.'};
  result=await db.rpc('capture_carryover_evidence',{p_employee:employee,p_year:year,p_mode:String(form.get('mode')||''),p_source:String(form.get('source')||''),p_end:String(form.get('end')||'')||null,p_version:version,p_verified:form.get('verified')==='on'});
 }else if(action==='review'){
  const id=String(form.get('id')||'');if(!isUuid(id))return {error:'검토 항목을 확인해 주세요.'};
  result=await db.rpc('review_carryover_candidate',{p_id:id,p_version:version,p_state:String(form.get('state')||''),p_note:String(form.get('note')||'')});
 }else return {error:'지원하지 않는 작업입니다.'};
 if(result.error)return {error:'저장할 수 없습니다. 11월 30일 기준일, 실제 근거 및 최신 버전을 확인해 주세요. 당일 이후에는 날짜가 확인된 원본 대조가 필요합니다.'};
 revalidatePath('/admin/leave/carryover');revalidatePath('/leave/carryover');return {};
}
