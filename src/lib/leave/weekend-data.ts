import 'server-only';
import {notFound} from 'next/navigation';
import {requireCapability} from '../auth/access';
import {isUuid} from '../employees/validation';
import {readRows} from '../operations/data';
import {leaveRpc,ownEmployee,today} from './data';
import {WEEKEND_COLUMNS,type WeekendWork} from './weekend';
export async function weekendRecord(id:string){await requireCapability('EMPLOYEE_ACCESS');if(!isUuid(id))notFound();const row=(await readRows<WeekendWork>('weekend_work',WEEKEND_COLUMNS,{id}))[0];if(!row)notFound();return row;}
export async function weekendData(review:boolean){
 await requireCapability(review?'TEAM_LEAVE_APPROVE':'EMPLOYEE_ACCESS');const self=await ownEmployee();
 const rows=review?await readRows<WeekendWork>('weekend_work',WEEKEND_COLUMNS,{},'work_date'):self?await readRows<WeekendWork>('weekend_work',WEEKEND_COLUMNS,{employee_id:self},'work_date'):[];
 const allowed:Record<string,boolean>={};if(review)await Promise.all([...new Set(rows.map(r=>r.employee_id))].map(async id=>{allowed[id]=await leaveRpc<boolean>('weekend_work_reviewer',{p_employee:id});}));
 return {rows,self,allowed,today:await today()};
}
