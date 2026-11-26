import 'server-only';
import {requireCapability} from '../auth/access';
import {readRows} from '../operations/data';
import {leaveRpc} from '../leave/data';
import type {Person,Entry} from './engine';
export async function simulationData(){
 await requireCapability('LEAVE_MANAGE');
 const [employees,organizations,ledger,evidenceThrough]=await Promise.all([
  readRows<Omit<Person,'department'>&{department_id:string|null}>('employee','id,name,department_id,hire_date,employment_status,version',{},'id'),
  readRows<{id:string;name:string}>('organization','id,name',{},'id'),
  readRows<Entry>('leave_ledger','id,employee_id,year,bucket,event_type,amount_delta,source_id,occurred_at',{},'id'),leaveRpc<string>('leave_today'),
 ]);
 const names=new Map(organizations.map(o=>[o.id,o.name]));
 return {evidenceThrough,people:employees.map(p=>({id:p.id,name:p.name,department:p.department_id?names.get(p.department_id)||'부서 확인 필요':'미지정',hire_date:p.hire_date,employment_status:p.employment_status,version:p.version})),ledger};
}
