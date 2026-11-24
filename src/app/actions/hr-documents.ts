'use server';
import {revalidatePath} from 'next/cache';
import {requireCapability} from '@/lib/auth/access';
import {employeeClient} from '@/lib/employees/data';
import {isUuid} from '@/lib/employees/validation';
import {DOCUMENT_TYPES} from '@/lib/hr-documents/types';
import {validateDocument} from '@/lib/hr-documents/validation';
import {uploadHrObject} from '@/lib/hr-documents/storage';
import {operationsService} from '@/lib/operations/service';
export interface DocumentState {error?:string;success?:string}
function refresh(id:string){revalidatePath(`/admin/employees/${id}`);revalidatePath(`/people/${id}`);}
export async function uploadHrDocument(_state:DocumentState,form:FormData):Promise<DocumentState>{
 await requireCapability('PRIVATE_HR_ACCESS');
 const employee=String(form.get('employee_id')||''),type=String(form.get('document_type')||'');
 if(!isUuid(employee)||!Object.hasOwn(DOCUMENT_TYPES,type)||[...form.keys()].some(key=>!key.startsWith('$ACTION_')&&!['employee_id','document_type','file','issued_date','expires_at'].includes(key)))return {error:'올바른 직원과 서류 종류를 선택해 주세요.'};
 const file=form.get('file');if(!(file instanceof File))return {error:'파일을 선택해 주세요.'};
 let validated:Awaited<ReturnType<typeof validateDocument>>;
 try{validated=await validateDocument(file);}catch(e){return {error:e instanceof Error?e.message:'파일을 확인해 주세요.'};}
 const issued=String(form.get('issued_date')||''),expires=String(form.get('expires_at')||'');
 const validDate=(v:string)=>!v||(/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v);
 if(!validDate(issued)||!validDate(expires)||(issued&&expires&&expires<issued))return {error:'발급일과 유효기간을 확인해 주세요.'};
 const client=await employeeClient();
 const {data:id,error}=await client.rpc('reserve_hr_document',{p_employee:employee,p_type:type,p_filename:file.name,p_mime:file.type,p_size:file.size,p_hash:validated.hash,p_issued:issued||null,p_expires:expires||null});
 if(error||!id)return {error:'서류 등록 권한 또는 직원 정보를 확인해 주세요.'};
 try{
  await uploadHrObject(`${employee}/${id}`,validated.bytes,file.type);
  const {error:finish}=await operationsService().rpc('finish_hr_document',{p_id:id});if(finish)throw new Error();
 }catch{return {error:'파일 저장을 완료하지 못했습니다. 다시 시도해 주세요.'};}
 refresh(employee);return {success:'인사서류가 등록되었습니다. 이전 버전은 보존됩니다.'};
}
export async function archiveHrDocument(_state:DocumentState,form:FormData):Promise<DocumentState>{
 await requireCapability('PRIVATE_HR_ACCESS');const id=String(form.get('document_id')||'');
 if(!isUuid(id))return {error:'서류를 확인해 주세요.'};
 const client=await employeeClient();const {data:doc,error}=await client.from('employee_hr_document').select('employee_id').eq('id',id).maybeSingle();
 if(error||!doc)return {error:'서류를 찾을 수 없습니다.'};
 const {error:archive}=await client.rpc('archive_hr_document',{p_id:id});if(archive)return {error:'보관 처리에 실패했습니다.'};
 refresh(doc.employee_id);return {success:'서류를 보관했습니다. 담당자는 이력에서 확인할 수 있습니다.'};
}
