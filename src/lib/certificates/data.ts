import 'server-only';
import {notFound} from 'next/navigation';
import {requireCapability} from '../auth/access';
import {can} from '../permissions';
import {employeeClient} from '../employees/data';
import {readRows} from '../operations/data';
import {isUuid} from '../employees/validation';
import {CERTIFICATE_COLUMNS,type Certificate} from './types';
export async function certificates(admin=false){await requireCapability(admin?'HR_CERTIFICATE_MANAGE':'EMPLOYEE_ACCESS');const db=await employeeClient();const {data:owner,error}=await db.rpc('current_employee_id');if(error)throw new Error('직원 조회 실패');return admin?readRows<Certificate>('hr_certificate',CERTIFICATE_COLUMNS,{},'requested_at'):owner?readRows<Certificate>('hr_certificate',CERTIFICATE_COLUMNS,{employee_id:owner},'requested_at'):[];}
export async function certificate(id:string){const principal=await requireCapability('EMPLOYEE_ACCESS');if(!isUuid(id))notFound();const row=(await readRows<Certificate>('hr_certificate',CERTIFICATE_COLUMNS,{id}))[0];if(!row)notFound();const db=await employeeClient();const {data:owner,error}=await db.rpc('current_employee_id');if(error||(!can(principal,'HR_CERTIFICATE_MANAGE')&&row.employee_id!==owner))notFound();return row;}
