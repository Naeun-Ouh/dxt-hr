import 'server-only';
import {notFound} from 'next/navigation';
import {requireCapability} from '../auth/access';
import {can} from '../permissions';
import {isUuid} from '../employees/validation';
import {employeeClient} from '../employees/data';
import {readRows,type Person} from './data';
import {OPERATION_COLUMNS,operationCapability,type OperationCase} from './types';
import {loadLifecycleTasks,type LifecycleTask} from './lifecycle';
import type {ContractStatus} from '../contracts/types';
import type {DocumentType} from '../hr-documents/types';
export async function lifecycleData(employeeId?:string){
 const principal=await requireCapability('ONBOARDING_MANAGE');
 if(employeeId&&!isUuid(employeeId))notFound();
 const filters:Record<string,string>=employeeId?{employee_id:employeeId}:{};
 const [records,people,day]=await Promise.all([readRows<OperationCase>('operation_case',OPERATION_COLUMNS,filters),readRows<Person>('employee','id,name,hire_date,employment_status,title',employeeId?{id:employeeId}:{}),(await employeeClient()).rpc('leave_today')]);
 if(day.error)throw new Error('기준일을 불러오지 못했습니다.');
 const scoped=records.filter(r=>can(principal,operationCapability(r.kind)));
 if(employeeId&&!people.length)notFound();
 // Reuse RLS-protected operational tables; never fetch task memo or private document content.
 const ids=new Set(scoped.map(r=>r.id));
 const db=await employeeClient();
 const tasks=await loadLifecycleTasks([...ids],async(caseIds,from,to)=>{const {data,error}=await db.from('operation_task').select('id,case_id,type,status').in('case_id',caseIds).order('id').range(from,to);if(error)throw new Error('체크리스트를 불러오지 못했습니다.');return data as LifecycleTask[];});
 if(!employeeId)return {principal,records:scoped,people,tasks:tasks.filter(t=>ids.has(t.case_id)),today:String(day.data)};
 const [assets,transfers,contracts,documents]=await Promise.all([
  can(principal,'ASSET_MANAGE')?readRows<{id:string;model:string;serial_number:string}>('asset','id,model,serial_number',{current_holder_id:employeeId}):[],
  can(principal,'ASSET_MANAGE')?readRows<{id:string;asset_id:string;state:string;sender_id:string;recipient_id:string}>('asset_transfer','id,asset_id,state,sender_id,recipient_id',{sender_id:employeeId,state:'PENDING'}):[],
  can(principal,'EMPLOYMENT_CONTRACT_MANAGE')?readRows<{id:string;status:ContractStatus}>('employment_contract','id,status',{employee_id:employeeId}):[],
  can(principal,'PRIVATE_HR_ACCESS')?readRows<{id:string;document_type:DocumentType;archived_at:string|null}>('employee_hr_document','id,document_type,archived_at',{employee_id:employeeId,ready:true}):[],
 ]);
 return {principal,records:scoped,people,tasks:tasks.filter(t=>ids.has(t.case_id)),today:String(day.data),detail:{assets,transfers,contracts,documents:documents.filter(d=>!d.archived_at)}};
}
