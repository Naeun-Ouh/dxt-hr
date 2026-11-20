import 'server-only';
import {createHash} from 'node:crypto';
import { notFound } from 'next/navigation';
import { requireCapability } from '../auth/access';
import { employeeClient } from '../employees/data';
import { decryptHr } from '../employees/crypto-server';
import { isUuid } from '../employees/validation';
import { readRows } from '../operations/data';
import { can } from '../permissions';
import { CONTRACT_COLUMNS,VERSION_COLUMNS,SIGNATURE_COLUMNS,EVENT_COLUMNS,TEMPLATE_COLUMNS,type Contract,type ContractVersion,type Signature,type ContractEvent,type Template } from './types';
export async function contractList(admin=false,employeeId?:string){
 await requireCapability(admin?'EMPLOYMENT_CONTRACT_MANAGE':'EMPLOYEE_ACCESS');
 const db=await employeeClient();
 const own=admin?null:(await db.rpc('current_employee_id')).data;
 if(!admin&&!own)return [];
 return readRows<Contract>('employment_contract',CONTRACT_COLUMNS,employeeId?{employee_id:employeeId}:admin?{}:{employee_id:own},'created_at');
}
export async function contractDetail(id:string,privateRequired=false){
 const principal=await requireCapability('EMPLOYEE_ACCESS');if(!isUuid(id))notFound();
 const db=await employeeClient();
 const c=(await readRows<Contract>('employment_contract',CONTRACT_COLUMNS,{id}))[0];
 if(!c)notFound();
 const own=(await db.rpc('current_employee_id')).data===c.employee_id;
 if(!own&&!can(principal,'EMPLOYMENT_CONTRACT_MANAGE'))notFound();
 const privateAccess=can(principal,'EMPLOYMENT_CONTRACT_PRIVATE_ACCESS')||(own&&c.sent_at!==null);
 if(privateRequired&&!privateAccess)notFound();
 const version=privateAccess?(await readRows<ContractVersion>('employment_contract_version',VERSION_COLUMNS,{contract_id:id,version:c.current_version},'version'))[0]:undefined;
 if(privateAccess&&!version)notFound();
 const body=version?decryptHr(version.encrypted_body,`contract:${id}:${version.version}`):undefined;
 if(version&&body!==undefined&&createHash('sha256').update(body).digest('hex')!==version.body_sha256)throw new Error('Contract integrity check failed');
 const signatures=privateAccess?await readRows<Signature>('employment_contract_signature',SIGNATURE_COLUMNS,{contract_id:id},'signed_at'):[];
 const events=await readRows<ContractEvent>('employment_contract_event',EVENT_COLUMNS,{contract_id:id},'occurred_at');
 return {c,version,body,signatures,events,own,privateAccess,principal};
}
export async function contractTemplates(){await requireCapability('EMPLOYMENT_CONTRACT_PRIVATE_ACCESS');return (await readRows<Template>('employment_contract_template',TEMPLATE_COLUMNS)).map(t=>({...t,body:decryptHr(t.encrypted_body,`contract-template:${t.id}`)}));}
