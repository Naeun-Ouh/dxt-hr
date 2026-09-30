import { isUuid, validDate, ValidationError } from '../employees/validation';
import { STATUSES } from './types';
export type Kind = 'project' | 'assignment' | 'career';
export function projectInput(kind: Kind, form: FormData) {
 const fields: Record<string,string> = {}, values: Record<string, string | string[]> = {};
 const required = kind === 'project' ? ['customer_name','name','start_date','current_end_date','pm_employee_id','work_location','status'] : kind === 'assignment' ? ['project_id','employee_id','start_date','end_date','role','status'] : ['assignment_id','job_function','role','responsibilities'];
 for (const key of required) {
  const value = typeof form.get(key) === 'string' ? String(form.get(key)).trim() : '';
  values[key] = value;
  const max = key === 'responsibilities' ? 10000 : ['role','job_function'].includes(key) ? 100 : 200;
  if (!value || value.length > max) fields[key] = `필수 항목입니다. ${max}자 이내로 입력해 주세요.`;
  if (key.endsWith('_id') && !isUuid(value)) fields[key] = '목록에서 선택해 주세요.';
  if (key.endsWith('_date') && !validDate(value)) fields[key] = '올바른 날짜를 입력해 주세요.';
 }
 if ('status' in values && !Object.hasOwn(STATUSES,String(values.status))) fields.status = '상태를 선택해 주세요.';
 const end = kind === 'project' ? 'current_end_date' : 'end_date';
 if (values.start_date && values[end] < values.start_date) fields[end] = '종료일은 시작일 이후여야 합니다.';
 if (kind === 'project') { values.reason = String(form.get('reason') || '').trim(); if (values.reason.length > 1000) fields.reason='1000자 이내로 입력해 주세요.'; }
 if (kind === 'career') {
  values.skills = [...new Set(String(form.get('skills') || '').split(',').map(s=>s.trim()).filter(Boolean))];
  if (values.skills.length > 30 || values.skills.some(s=>s.length>100)) fields.skills='기술은 각 100자, 최대 30개까지 입력해 주세요.';
 }
 if (Object.keys(fields).length) throw new ValidationError(fields);
 return values;
}
