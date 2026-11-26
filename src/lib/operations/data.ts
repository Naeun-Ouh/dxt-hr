import 'server-only';
import { notFound } from 'next/navigation';
import { requireCapability } from '../auth/access';
import { employeeClient } from '../employees/data';
import { isUuid } from '../employees/validation';
import { can } from '../permissions';
import { loadTaskOwners } from './owner-pages';
import { OPERATION_COLUMNS,TASK_COLUMNS,HISTORY_COLUMNS,ANNOUNCEMENT_COLUMNS,REGISTRATION_COLUMNS,POST_COLUMNS,TEMPLATE_COLUMNS,DOCUMENT_COLUMNS,operationCapability,type OperationKind,type OperationCase,type OperationTask,type TaskOwner,type OperationHistory,type Announcement,type FamilyRegistration,type FamilyPost,type BirthdayTemplate,type ResignationDocument } from './types';
export interface Person{id:string;name:string;hire_date:string;employment_status:string;title:string}
// Page through PostgREST rather than silently truncating operational history at its row limit.
export async function readRows<T>(table:string,columns:string,filters:Record<string,string|number|boolean>={},order='id'):Promise<T[]>{
 const db=await employeeClient(),rows:T[]=[];
 for(let from=0;;from+=500){let query=db.from(table).select(columns).order(order);if(order!=='id'&&columns.split(',').includes('id'))query=query.order('id');for(const [key,value] of Object.entries(filters))query=query.eq(key,value);const {data,error}=await query.range(from,from+499);if(error)throw new Error('운영 정보를 불러오지 못했습니다.');rows.push(...data as T[]);if(data.length<500)return rows;}
}
export async function operationPeople(){await requireCapability('EMPLOYEE_ACCESS');return readRows<Person>('employee','id,name,hire_date,employment_status,title');}
export async function operationCases(kind:OperationKind){await requireCapability(operationCapability(kind));return readRows<OperationCase>('operation_case',OPERATION_COLUMNS,{kind});}
export async function operationDetail(kind:OperationKind,id:string){await requireCapability(operationCapability(kind));if(!isUuid(id))notFound();const record=(await readRows<OperationCase>('operation_case',OPERATION_COLUMNS,{id,kind}))[0];if(!record)notFound();
 const [tasks,history]=await Promise.all([readRows<OperationTask>('operation_task',TASK_COLUMNS,{case_id:id}),readRows<OperationHistory>('operation_history',HISTORY_COLUMNS,{case_id:id},'occurred_at')]);
 const db=await employeeClient();
 const owners=await loadTaskOwners(tasks.map(task=>task.id),async(ids,from,to)=>{
  const {data,error}=await db.from('operation_task_owner').select('task_id,employee_id').in('task_id',ids).order('task_id').order('employee_id').range(from,to);
  if(error)throw new Error('운영 담당자를 불러오지 못했습니다.');return data as TaskOwner[];
 });
 return {record,tasks,owners,history};
}
export async function resignationDocuments(id:string){await requireCapability('RESIGNATION_REASON_ACCESS');if(!isUuid(id))notFound();return readRows<ResignationDocument>('resignation_document',DOCUMENT_COLUMNS,{case_id:id,ready:true});}
export async function announcements(){await requireCapability('EMPLOYEE_ACCESS');return readRows<Announcement>('announcement',ANNOUNCEMENT_COLUMNS);}
export async function announcement(id:string){await requireCapability('EMPLOYEE_ACCESS');if(!isUuid(id))notFound();const row=(await readRows<Announcement>('announcement',ANNOUNCEMENT_COLUMNS,{id}))[0];if(!row)notFound();return row;}
export async function familyPosts(){await requireCapability('EMPLOYEE_ACCESS');return readRows<FamilyPost>('family_post',POST_COLUMNS,{},'registration_id');}
export async function familyRegistrations(review=false){const principal=await requireCapability(review?'FAMILY_EVENT_REVIEW':'EMPLOYEE_ACCESS');const db=await employeeClient();if(review&&can(principal,'FAMILY_EVENT_REVIEW'))return readRows<FamilyRegistration>('family_registration',REGISTRATION_COLUMNS);
 const {data,error}=await db.rpc('current_employee_id');if(error)throw new Error('직원 정보를 불러오지 못했습니다.');return data?readRows<FamilyRegistration>('family_registration',REGISTRATION_COLUMNS,{employee_id:data}):[];
}
export async function familyRegistration(id:string,review=false){await requireCapability(review?'FAMILY_EVENT_REVIEW':'EMPLOYEE_ACCESS');if(!isUuid(id))notFound();
 const filters:Record<string,string>={id};if(!review){const {data:own,error}=await(await employeeClient()).rpc('current_employee_id');if(error||!own)notFound();filters.employee_id=own;}
 const row=(await readRows<FamilyRegistration>('family_registration',REGISTRATION_COLUMNS,filters))[0];if(!row)notFound();return row;
}
export async function birthdayTemplate(year:number){await requireCapability('SETTINGS_MANAGE');return (await readRows<BirthdayTemplate>('birthday_template',TEMPLATE_COLUMNS,{year},'year'))[0];}
