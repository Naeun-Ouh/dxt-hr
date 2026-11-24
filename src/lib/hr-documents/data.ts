import 'server-only';
import {notFound} from 'next/navigation';
import {requireCapability} from '../auth/access';
import {can} from '../permissions';
import {employeeClient} from '../employees/data';
import {isUuid} from '../employees/validation';
import {DOCUMENT_COLUMNS,type HrDocument} from './types';
export async function documentScope(employeeId:string){
 const principal=await requireCapability('EMPLOYEE_ACCESS');
 if(!isUuid(employeeId))notFound();
 const client=await employeeClient(),manage=can(principal,'PRIVATE_HR_ACCESS');
 const {data:own,error}=await client.rpc('current_employee_id');
 if(!manage&&(error||own!==employeeId))notFound();
 return {client,manage};
}
export async function hrDocuments(employeeId:string,history=false){
 const {client,manage}=await documentScope(employeeId);
 if(history&&!manage)notFound();
 let query=client.from('employee_hr_document').select(DOCUMENT_COLUMNS).eq('employee_id',employeeId).eq('ready',true).order('uploaded_at',{ascending:false});
 if(!history)query=query.is('archived_at',null);
 if(!manage)query=query.neq('document_type','OTHER_HR');
 const {data,error}=await query;if(error)throw new Error('인사서류를 불러올 수 없습니다.');
 return {documents:data as HrDocument[],manage};
}
