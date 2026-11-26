import type {ContractStatus} from './types';
export interface ContractEntry{id:string;name:string;email:string;status:ContractStatus;version:number;createdAt:string;sentAt:string|null;dueDate:string|null;companySignedAt:string|null}
export const seoulDate=(value:string)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
export const overdue=(row:Pick<ContractEntry,'status'|'dueDate'|'companySignedAt'>,today:string)=>Boolean(row.dueDate&&row.dueDate<today&&!row.companySignedAt&&['SENT','VIEWED','EMPLOYEE_SIGNED'].includes(row.status));
export function matchesContract(row:ContractEntry,filter:string,today:string,admin:boolean){
 if(!filter)return true;
 const groups:Record<string,string[]>={REVIEW:admin?['DRAFT','READY_TO_SEND']:['SENT','VIEWED'],SIGNING:['SENT','VIEWED'],COMPANY:['EMPLOYEE_SIGNED'],ARCHIVE:['COMPLETED'],PAST:['CANCELLED','DECLINED']};
 return filter==='OVERDUE'?overdue(row,today):groups[filter]?groups[filter].includes(row.status):row.status===filter;
}
