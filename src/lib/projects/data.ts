import 'server-only';
import { canReadCareerFor } from './access';
import { requireCapability } from '../auth/access';
import { employeeClient, EMPLOYEE_COLUMNS } from '../employees/data';
import type { Employee, Organization } from '../employees/types';
import { ASSIGNMENT_COLUMNS, CAREER_COLUMNS, EXTENSION_COLUMNS, PROJECT_COLUMNS, type Assignment, type Career, type Extension, type Project } from './types';
// Page through PostgREST rather than silently truncating resource coverage at its row limit.
async function allRows<T>(table: string, columns: string, employeeId?: string): Promise<T[]> {
 const client = await employeeClient(), rows: T[] = [];
 for (let offset=0;;offset+=500) {
  let request = client.from(table).select(columns).order('id').range(offset,offset+499);
  if (employeeId) request = request.eq('employee_id',employeeId);
  const {data,error} = await request;
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
 // Own authoring screens must never include rows newly visible through team read scope.
 const careers = data.selfId ? await allRows<Career>('career',CAREER_COLUMNS,data.selfId) : [];
 return {...data, assignments: data.assignments.filter(a=>a.employee_id===data.selfId), careers};
}
export async function projectExtensions(id: string) {
 await requireCapability('PROJECT_MANAGE');
 const {data,error} = await (await employeeClient()).from('project_extension').select(EXTENSION_COLUMNS).eq('project_id',id).order('changed_at',{ascending:false});
 if (error) throw new Error('Project history unavailable');
 return data as Extension[];
}

export async function employeeCareerData(id: string) {
 const data = await projectData();
 const target = data.employees.find(e=>e.id===id), self = data.employees.find(e=>e.id===data.selfId);
 if (!target || !canReadCareerFor(data.principal,self,target)) return null;
 const careers = await allRows<Career>('career',CAREER_COLUMNS,id);
 return {...data, careers};
}

export async function canViewEmployeeCareer(id: string) {
 await requireCapability('EMPLOYEE_ACCESS');
 const {data,error}=await (await employeeClient()).rpc('can_read_career',{p_employee:id});
 return !error && data===true;
}
