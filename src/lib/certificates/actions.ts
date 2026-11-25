'use server';
import {revalidatePath} from 'next/cache';
import {requireCapability} from '../auth/access';
import {employeeClient} from '../employees/data';
import {isUuid} from '../employees/validation';
import {issueCertificate} from './storage';
import {CertificatePdfSizeError} from './limits';
export async function certificateAction(form:FormData):Promise<{error?:string;ok?:boolean}>{
 const action=String(form.get('action')||'');await requireCapability(['approve','reject','retry','settings'].includes(action)?'HR_CERTIFICATE_MANAGE':'EMPLOYEE_ACCESS');
 const id=String(form.get('id')||'');if(action!=='settings'&&!isUuid(id))return {error:'요청을 확인해 주세요.'};
 if(form.has('employee_id'))return {error:'직원 지정은 허용하지 않습니다.'};
 const db=await employeeClient();let result;
 if(action==='request')result=await db.rpc('request_hr_certificate',{p_id:id,p_purpose:String(form.get('purpose')||''),p_note:String(form.get('note')||'')});
 else if(action==='cancel')result=await db.rpc('cancel_hr_certificate',{p_id:id});
 else if(action==='approve'||action==='reject')result=await db.rpc('review_hr_certificate',{p_id:id,p_action:action==='approve'?'APPROVED':'REJECTED',p_reason:String(form.get('reason')||'')});
 else if(action==='settings')result=await db.rpc('save_hr_certificate_setting',{p_address:String(form.get('address')||''),p_registration:String(form.get('registration')||'')});
 else if(action!=='retry')return {error:'지원하지 않는 작업입니다.'};
 if(result?.error)return {error:'요청 상태·권한·필수 입력을 확인해 주세요. 승인에는 활성 회사 직인이 필요합니다.'};
 if(action==='approve'||action==='retry'){try{await issueCertificate(id);}catch(error){if(error instanceof CertificatePdfSizeError)return {error:error.message};return {error:'승인은 보존되었습니다. 직인/저장소 설정을 확인한 뒤 발급 재시도를 눌러 주세요.'};}}
 revalidatePath('/certificates/me');revalidatePath('/admin/certificates');return {ok:true};
}
