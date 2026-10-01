import 'server-only';
import { notFound } from 'next/navigation';
import { requireCapability } from '../auth/access';
import { employeeClient } from '../employees/data';
import { isUuid } from '../employees/validation';
import { can } from '../permissions';
import { OPERATION_COLUMNS,TASK_COLUMNS,HISTORY_COLUMNS,ANNOUNCEMENT_COLUMNS,REGISTRATION_COLUMNS,POST_COLUMNS,TEMPLATE_COLUMNS,DOCUMENT_COLUMNS,operationCapability,type OperationKind,type OperationCase,type OperationTask,type TaskOwner,type OperationHistory,type Announcement,type FamilyRegistration,type FamilyPost,type BirthdayTemplate,type ResignationDocument } from './types';
export interface Person{id:string;name:string;hire_date:string;employment_status:string;title:string}
// Page through PostgREST rather than silently truncating operational history at its row limit.
export async function readRows<T>(table:string,columns:string,filters:Record<string,string|number|boolean>={},order='id'):Promise<T[]>{
 const db=await employeeClient(),rows:T[]=[];
 for(let from=0;;from+=500){let query=db.from(table).select(columns).order(order);for(const [key,value] of Object.entries(filters))query=query.eq(key,value);const {data,error}=await query.range(from,from+499);if(error)throw new Error('운영 정보를 불러오지 못했습니다.');rows.push(...data as T[]);if(data.length<500)return rows;}
}
export async function operationPeople(){await requireCapability('EMPLOYEE_ACCESS');return readRows<Person>('employee','id,name,hire_date,employment_status,title');}
export async function operationCases(kind:OperationKind){await requireCapability(operationCapability(kind));return readRows<OperationCase>('operation_case',OPERATION_COLUMNS,{kind});}
export async function operationDetail(kind:OperationKind,id:string){await requireCapability(operationCapability(kind));if(!isUuid(id))notFound();const record=(await readRows<OperationCase>('operation_case',OPERATION_COLUMNS,{id,kind}))[0];if(!record)notFound();
 const [tasks,history]=await Promise.all([readRows<OperationTask>('operation_task',TASK_COLUMNS,{case_id:id}),readRows<OperationHistory>('operation_history',HISTORY_COLUMNS,{case_id:id},'occurred_at')]);
 const owners:TaskOwner[]=[];for(const task of tasks)owners.push(...await readRows<TaskOwner>('operation_task_owner','task_id,employee_id',{task_id:task.id},'employee_id'));
 return {record,tasks,owners,history};
}
export async function resignationDocuments(id:string){await requireCapability('RESIGNATION_REASON_ACCESS');if(!isUuid(id))notFound();return readRows<ResignationDocument>('resignation_document',DOCUMENT_COLUMNS,{case_id:id,ready:true});}
export async function announcements(){await requireCapability('EMPLOYEE_ACCESS');return readRows<Announcement>('announcement',ANNOUNCEMENT_COLUMNS);}
export async function announcement(id:string){if(!isUuid(id))notFound();const row=(await announcements()).find(a=>a.id===id);if(!row)notFound();return row;}
export async function familyPosts(){await requireCapability('EMPLOYEE_ACCESS');return readRows<FamilyPost>('family_post',POST_COLUMNS,{},'registration_id');}
export async function familyRegistrations(review=false){const principal=await requireCapability(review?'FAMILY_EVENT_REVIEW':'EMPLOYEE_ACCESS');const db=await employeeClient();if(review&&can(principal,'FAMILY_EVENT_REVIEW'))return readRows<FamilyRegistration>('family_registration',REGISTRATION_COLUMNS);
 const {data,error}=await db.rpc('current_employee_id');if(error)throw new Error('직원 정보를 불러오지 못했습니다.');return data?readRows<FamilyRegistration>('family_registration',REGISTRATION_COLUMNS,{employee_id:data}):[];
}
export async function familyRegistration(id:string,review=false){if(!isUuid(id))notFound();const row=(await familyRegistrations(review)).find(e=>e.id===id);if(!row)notFound();return row;}
export async function birthdayTemplate(year:number){await requireCapability('SETTINGS_MANAGE');return (await readRows<BirthdayTemplate>('birthday_template',TEMPLATE_COLUMNS,{year},'year'))[0];}
