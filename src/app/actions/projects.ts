'use server';
import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireCapability } from '@/lib/auth/access';
import { employeeClient } from '@/lib/employees/data';
import type { FormState } from '@/lib/employees/types';
import { isUuid, ValidationError, versionFrom } from '@/lib/employees/validation';
import { projectInput, type Kind } from '@/lib/projects/validation';
function failure(error: unknown): FormState {
 if (error instanceof ValidationError) return {error:error.message, fields:error.fields};
 const code = error && typeof error==='object' && 'code' in error ? error.code : '';
 if (code==='40001') return {error:'다른 사용자가 변경했습니다. 새로고침 후 다시 시도해 주세요.'};
 if (code==='23503') return {error:'연결된 투입·변경 이력·커리어가 있어 삭제할 수 없거나, 선택한 정보가 존재하지 않습니다.'};
 if (code==='23514') return {error:'날짜와 입력값을 확인해 주세요. 투입 기간은 프로젝트 기간 안에 있어야 합니다.'};
 return {error:'저장할 수 없습니다. 권한과 입력값을 확인해 주세요.'};
}
export async function saveProjectRecord(kind: Kind, id: string | null, _previous: FormState, form: FormData): Promise<FormState> {
 await requireCapability(kind === 'career' ? 'EMPLOYEE_ACCESS' : 'PROJECT_MANAGE');
 if (!['project','assignment','career'].includes(kind) || (id && !isUuid(id))) return failure(null);
 const target = id || randomUUID(); let destination = '/admin/projects';
 try {
  const values = projectInput(kind,form), version = versionFrom(form), client = await employeeClient();
  if ((id && version<1) || (!id && version!==0)) return failure(null);
  if (kind==='career') {
   // Explicit action ownership check, in addition to the independent RPC/RLS boundary.
   const {data: owner, error} = await client.rpc('current_employee_id');
   if (error || !owner) return failure(null);
   const {data: assignment} = await client.from('project_assignment').select('id').eq('id',values.assignment_id).eq('employee_id',owner).maybeSingle();
   if (!assignment) return failure(null);
   if (id) {
    const {data: record} = await client.from('career').select('id').eq('id',id).eq('employee_id',owner).maybeSingle();
    if (!record) return failure(null);
   }
  }
  const {error} = await client.rpc(`save_${kind}`,{p_id:target,p_values:values,p_expected_version:version});
  if (error) return failure(error);
  destination = kind==='career' ? `/career/${target}/edit` : `/admin/projects/${kind==='project' ? target : values.project_id}`;
 } catch(error) { return failure(error); }
 revalidatePath('/','layout');
 redirect(`${destination}?saved=1`);
}
export async function deleteProjectRecord(kind: 'project' | 'assignment', id: string, projectId: string, _previous: FormState, form: FormData): Promise<FormState> {
 await requireCapability('PROJECT_MANAGE');
 if (!['project','assignment'].includes(kind) || !isUuid(id) || !isUuid(projectId)) return failure(null);
 try {
  const {error} = await (await employeeClient()).rpc('delete_project_record',{p_kind:kind,p_id:id,p_expected_version:versionFrom(form)});
  if (error) return failure(error);
 } catch(error) {return failure(error);}
 revalidatePath('/','layout');
 redirect(kind==='project' ? '/admin/projects?deleted=1' : `/admin/projects/${projectId}?deleted=1`);
}
