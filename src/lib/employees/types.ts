import { ROLE_LABELS, type Role } from "../permissions";
export const EMPLOYEE_ROLE_LABELS = { ...ROLE_LABELS, EMPLOYEE: "일반 직원" };
export interface Employee {
  id: string; name: string; english_name: string | null; company_email: string;
  phone: string | null; department_id: string | null; title: string; hire_date: string;
  employment_status: "ACTIVE" | "INACTIVE"; work_location: string | null; version: number;
}
export interface EmployeeProfile extends Employee { roles: Role[] }
export interface Organization { id: string; name: string; parent_id: string | null; type: string | null; version: number }
export const PRIVATE_FIELDS = ["resident_registration_number", "address", "bank_name", "bank_account", "salary", "emergency_contact"] as const;
export type PrivateField = typeof PRIVATE_FIELDS[number];
export type PrivateValues = Record<PrivateField, string>;
export const PRIVATE_LABELS: Record<PrivateField, string> = {
  resident_registration_number: "주민등록번호", address: "주소", bank_name: "은행", bank_account: "계좌번호", salary: "연봉", emergency_contact: "긴급연락처",
};
export const emptyPrivate = (): PrivateValues => ({ resident_registration_number: "", address: "", bank_name: "", bank_account: "", salary: "", emergency_contact: "" });
export interface FormState { error?: string; fields?: Record<string, string>; success?: string }
export type EmployeeInput = Omit<EmployeeProfile, "id" | "version">;
