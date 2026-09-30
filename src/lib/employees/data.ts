import "server-only";
import { ROLES } from "../permissions";
import { notFound } from "next/navigation";
import { createAuthClient } from "../auth/server";
import { requireCapability } from "../auth/access";
import { isUuid } from "./validation";
import type { Employee, EmployeeProfile, Organization } from "./types";
export const EMPLOYEE_COLUMNS = "id,name,english_name,company_email,phone,department_id,title,hire_date,employment_status,work_location,version";
export async function employeeClient() {
  const client = await createAuthClient();
  if (!client) throw new Error("Employee service unavailable");
  return client;
}
export async function organizations(): Promise<Organization[]> {
  await requireCapability("EMPLOYEE_ACCESS", "/organization");
  const { data, error } = await (await employeeClient()).from("organization").select("id,name,parent_id,type,version").order("name");
  if (error) throw new Error("Organization service unavailable");
  return data as Organization[];
}
export async function getEmployee(id: string): Promise<EmployeeProfile> {
  await requireCapability("EMPLOYEE_ACCESS", "/people");
  if (!isUuid(id)) notFound();
  const { data, error } = await (await employeeClient()).from("employee").select(`${EMPLOYEE_COLUMNS},employee_role(role)`).eq("id", id).maybeSingle();
  if (error) throw new Error("Employee service unavailable");
  if (!data) notFound();
  const { employee_role, ...employee } = data;
  return { ...employee, roles: ROLES.filter(role => employee_role.some(row => row.role === role)) } as EmployeeProfile;
}
export type SearchParams = Record<string, string | string[] | undefined>;
export function directoryFilters(query: SearchParams) {
  const q = (typeof query.q === "string" ? query.q : "").replace(/[^\p{L}\p{N}@.\s_+-]/gu, "").slice(0, 100).trim();
  const department = typeof query.department === "string" && isUuid(query.department) ? query.department : "";
  const status = query.status === "ALL" || query.status === "INACTIVE" ? query.status : "ACTIVE";
  const page = typeof query.page === "string" && /^[1-9]\d{0,5}$/.test(query.page) ? Number(query.page) : 1;
  return { q, department, status, page };
}
export async function employeeDirectory(query: SearchParams) {
  await requireCapability("EMPLOYEE_ACCESS", "/people");
  const filters = directoryFilters(query), pageSize = 8;
  let request = (await employeeClient()).from("employee").select(EMPLOYEE_COLUMNS, { count: "exact" }).order("name").order("id");
  if (filters.status !== "ALL") request = request.eq("employment_status", filters.status);
  if (filters.department) request = request.eq("department_id", filters.department);
  if (filters.q) request = request.or(`name.ilike.*${filters.q}*,company_email.ilike.*${filters.q}*`);
  const { data, error, count } = await request.range((filters.page - 1) * pageSize, filters.page * pageSize - 1);
  if (error) throw new Error("Employee directory unavailable");
  return { employees: data as Employee[], count: count || 0, filters, pageSize };
}
export async function privateRecord(id: string) {
  await requireCapability("PRIVATE_HR_ACCESS", `/admin/employees/${id}/private`);
  if (!isUuid(id)) notFound();
  const { data, error } = await (await employeeClient()).from("employee_private_hr").select("encrypted_payload,version").eq("employee_id", id).maybeSingle();
  if (error) throw new Error("Private HR service unavailable");
  return data as { encrypted_payload: string; version: number } | null;
}
export async function birthRecord(id: string) {
  await requireCapability("EMPLOYEE_MANAGE", `/admin/employees/${id}`);
  const { data, error } = await (await employeeClient()).from("employee_birth_detail").select("birth_date_encrypted").eq("employee_id", id).maybeSingle();
  if (error) throw new Error("Birth date service unavailable");
  return data as { birth_date_encrypted: string } | null;
}
