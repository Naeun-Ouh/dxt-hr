export const WEEKEND_COLUMNS='id,employee_id,work_date,start_minute,end_minute,break_minutes,net_minutes,indicative_days,project_id,reason,status,version,created_at,decided_at,decided_by';
export type WeekendWork={id:string;employee_id:string;work_date:string;start_minute:number;end_minute:number;break_minutes:number;net_minutes:number;indicative_days:number;project_id:string|null;reason:string;status:'PENDING'|'APPROVED'|'REJECTED'|'CANCELLED';version:number;created_at:string;decided_at:string|null;decided_by:string|null};
export const weekendTime=(minute:number)=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
export const indicativeDays=(minutes:number)=>minutes>=480?1:minutes>=240?0.5:0;
export function minuteValue(value:FormDataEntryValue|null){if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))throw Error('INVALID_TIME');const [h,m]=value.split(':').map(Number);return h*60+m;}
