import { PRIVATE_FIELDS, type EmployeeInput, type PrivateValues } from "./types";
export class ValidationError extends Error {
  constructor(public fields: Record<string, string>) { super("입력 내용을 확인해 주세요."); }
}
export const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0, 4)) >= 1900 && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function text(form: FormData, key: string): string { const value = form.get(key); return typeof value === "string" ? value.trim() : ""; }
export function versionFrom(form: FormData): number {
  const value = text(form, "version");
  if (!/^\d{1,9}$/.test(value)) throw new ValidationError({ version: "화면을 새로고침한 후 다시 시도해 주세요." });
  return Number(value);
}
export function employeeInput(form: FormData): EmployeeInput {
  const fields: Record<string, string> = {};
  const read = (key: string, max: number, required = false) => {
    const value = text(form, key);
    if ((required && !value) || value.length > max) fields[key] = required && !value ? "필수 입력 항목입니다." : `${max}자 이내로 입력해 주세요.`;
    return value;
  };
  const name = read("name", 100, true), english_name = read("english_name", 100), company_email = read("company_email", 254, true).toLowerCase();
  const phone = read("phone", 30), title = read("title", 100, true), work_location = read("work_location", 200);
  const department_id = text(form, "department_id"), hire_date = text(form, "hire_date"), employment_status = text(form, "employment_status");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(company_email)) fields.company_email = "회사 이메일 형식을 확인해 주세요.";
  if (!validDate(hire_date)) fields.hire_date = "유효한 입사일을 입력해 주세요.";
  if (department_id && !isUuid(department_id)) fields.department_id = "부서를 다시 선택해 주세요.";
  if (!["ACTIVE", "INACTIVE"].includes(employment_status)) fields.employment_status = "근무 상태를 선택해 주세요.";
  if (Object.keys(fields).length) throw new ValidationError(fields);
  return { name, english_name: english_name || null, company_email, phone: phone || null, title, work_location: work_location || null, department_id: department_id || null, hire_date, employment_status: employment_status as "ACTIVE" | "INACTIVE" };
}
export function birthInput(form: FormData): string {
  const birth = text(form, "birth_date");
  if (birth && (!validDate(birth) || birth > new Date().toISOString().slice(0, 10))) throw new ValidationError({ birth_date: "유효한 생년월일을 입력해 주세요." });
  return birth;
}
export function privateInput(form: FormData, existing: PrivateValues): PrivateValues {
  const values = { ...existing };
  const errors: Record<string, string> = {};
  for (const field of PRIVATE_FIELDS) {
    const value = text(form, field);
    if (value.length > 500) errors[field] = "500자 이내로 입력해 주세요.";
    if (form.get(`clear_${field}`) === "on") values[field] = "";
    else if (value) values[field] = value;
  }
  if (values.resident_registration_number && !/^\d{6}-?\d{7}$/.test(values.resident_registration_number)) errors.resident_registration_number = "주민등록번호 13자리를 확인해 주세요.";
  if (values.salary && !/^\d{1,12}$/.test(values.salary)) errors.salary = "연봉은 원 단위 숫자로 입력해 주세요.";
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return values;
}
export function organizationInput(form: FormData) {
  const name = text(form, "name"), parent_id = text(form, "parent_id"), type = text(form, "type");
  const errors: Record<string, string> = {};
  if (!name || name.length > 100) errors.name = "조직명을 1~100자로 입력해 주세요.";
  if (parent_id && !isUuid(parent_id)) errors.parent_id = "상위 조직을 다시 선택해 주세요.";
  if (type.length > 50) errors.type = "50자 이내로 입력해 주세요.";
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return { name, parent_id: parent_id || null, type: type || null };
}
