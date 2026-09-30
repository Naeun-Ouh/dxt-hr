import 'server-only';
import { requireCapability } from '../auth/access';
import { employeeClient, EMPLOYEE_COLUMNS } from '../employees/data';
import type { Employee, Organization } from '../employees/types';
import { ASSIGNMENT_COLUMNS, CAREER_COLUMNS, EXTENSION_COLUMNS, PROJECT_COLUMNS, type Assignment, type Career, type Extension, type Project } from './types';
// Page through PostgREST rather than silently truncating resource coverage at its row limit.
async function allRows<T>(table: string, columns: string): Promise<T[]> {
 const client = await employeeClient(), rows: T[] = [];
 for (let offset=0;;offset+=500) {
  const {data,error} = await client.from(table).select(columns).order('id').range(offset,offset+499);
  if (error) throw new Error('Project service unavailable');
  rows.push(...data as T[]);
  if (data.length<500) return rows;
 }
}
export async function projectData(manage = false) {
 const principal = await requireCapability(manage ? 'PROJECT_MANAGE' : 'EMPLOYEE_ACCESS');
 const client = await employeeClient();
 const {data: selfId, error} = await client.rpc('current_employee_id');
 if (error) throw new Error('Employee link unavailable');
 const [projects, assignments, employees, organizations] = await Promise.all([
  allRows<Project>('project',PROJECT_COLUMNS),allRows<Assignment>('project_assignment',ASSIGNMENT_COLUMNS),
  allRows<Employee>('employee',EMPLOYEE_COLUMNS),allRows<Organization>('organization','id,name,parent_id,type,version'),
 ]);
 return { principal, selfId: selfId as string | null, projects, assignments, employees, organizations };
}
export async function careerData() {
 const data = await projectData();
 const careers = await allRows<Career>('career',CAREER_COLUMNS);
 return {...data, assignments: data.assignments.filter(a=>a.employee_id===data.selfId), careers};
}
export async function projectExtensions(id: string) {
 await requireCapability('PROJECT_MANAGE');
 const {data,error} = await (await employeeClient()).from('project_extension').select(EXTENSION_COLUMNS).eq('project_id',id).order('changed_at',{ascending:false});
 if (error) throw new Error('Project history unavailable');
 return data as Extension[];
}
