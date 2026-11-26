import 'server-only';
import {notFound} from 'next/navigation';
import {employeeClient} from '../employees/data';
import {requireCapability} from '../auth/access';
import {readRows} from '../operations/data';
import {isUuid} from '../employees/validation';
import {REQUEST_COLUMNS,LEDGER_COLUMNS,HISTORY_COLUMNS,type LeaveRequest,type Summary,type Ledger,type History,type CalendarEntry} from './types';
export async function leaveRpc<T>(name:string,args:Record<string,unknown>={}):Promise<T>{const {data,error}=await(await employeeClient()).rpc(name,args);if(error)throw error;return data as T;}
export async function ownEmployee(){await requireCapability('EMPLOYEE_ACCESS');return leaveRpc<string|null>('current_employee_id');}
export async function today(){return leaveRpc<string>('leave_today');}
export async function summary(id:string,year:number){await requireCapability('EMPLOYEE_ACCESS');return leaveRpc<Summary>('leave_summary',{p_employee:id,p_year:year});}
export async function requests(employee?:string){await requireCapability('EMPLOYEE_ACCESS');return readRows<LeaveRequest>('leave_request',REQUEST_COLUMNS,employee?{employee_id:employee}:{},'start_date');}
export async function requestDetail(id:string){await requireCapability('EMPLOYEE_ACCESS');if(!isUuid(id))notFound();const r=(await readRows<LeaveRequest>('leave_request',REQUEST_COLUMNS,{id}))[0];if(!r)notFound();return r;}
export async function ledger(id:string,year:number){await requireCapability('EMPLOYEE_ACCESS');const [rows,ownRequests]=await Promise.all([readRows<Ledger>('leave_ledger',LEDGER_COLUMNS,{employee_id:id},'occurred_at'),requests(id)]);const ids=new Set(ownRequests.filter(r=>r.start_date.startsWith(String(year))).map(r=>r.id));return rows.filter(r=>r.year===year||(r.request_id&&ids.has(r.request_id)));}
export async function history(id:string){await requestDetail(id);return readRows<History>('leave_history',HISTORY_COLUMNS,{request_id:id},'occurred_at');}
export async function calendar(month:string){await requireCapability('EMPLOYEE_ACCESS');return leaveRpc<CalendarEntry[]>('leave_calendar',{p_month:month});}
export async function grantEvidence(id:string,year:number){
 await requireCapability('EMPLOYEE_ACCESS');
 const [rows,sources]=await Promise.all([ledger(id,year),readRows<{id:string;legacy:boolean}>('leave_source','id,legacy',{employee_id:id,year,bucket:'ANNUAL'})]);
 return {rows,sources};
}
