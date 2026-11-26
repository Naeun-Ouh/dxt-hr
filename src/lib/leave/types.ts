export const UNITS={FULL_DAY:'연차',AM_HALF:'오전 반차',PM_HALF:'오후 반차'} as const;
export type Unit=keyof typeof UNITS;
export const STATES={PENDING:'대기',APPROVED:'승인',REJECTED:'거절',CANCELLED:'취소'} as const;
export const BUCKETS={SUBSTITUTE:"대체휴가",CARRYOVER:"이월연차",ANNUAL:"당해연차",BIRTHDAY:"생일 반차"} as const;
export type Bucket=keyof typeof BUCKETS;
export interface Source{id:string;year:number;bucket:Bucket;valid_from:string|null;valid_until:string|null;validity_confirmed:boolean;receiving_year:number|null;usable_balance:number;note:string;balance:number;version:number}
export interface LeaveRequest{birthday_project_id:string|null;birthday_exception:boolean;kind:"ANNUAL"|"BIRTHDAY";benefit_year:number|null;exception_reason:string;id:string;employee_id:string;start_date:string;end_date:string;unit:Unit;days:number;reason:string;past_reason:string;status:keyof typeof STATES;version:number;created_at:string;decided_by:string|null;decided_at:string|null}
export interface Summary{as_of:string;historical_balance:number;buckets:Record<Bucket,number>;employee_id:string;year:number;version:number;balance:number;adjusted:number;used:number}
export interface Ledger{source_id:string;reversal_of:string|null;id:string;employee_id:string;year:number;bucket:string;amount_delta:number;event_type:'ADJUSTMENT'|'DEDUCTION'|'REVERSAL';request_id:string|null;actor_id:string;note:string;occurred_at:string}
export interface History{id:string;request_id:string;action:string;actor_id:string;note:string;occurred_at:string}
export interface CalendarEntry{work_dates?:string[]|null;name:string;start_date:string;end_date:string;unit:Unit}
export const REQUEST_COLUMNS='birthday_project_id,birthday_exception,kind,benefit_year,exception_reason,id,employee_id,start_date,end_date,unit,days,reason,past_reason,status,version,created_at,decided_by,decided_at';
export const LEDGER_COLUMNS='source_id,reversal_of,id,employee_id,year,bucket,amount_delta,event_type,request_id,actor_id,note,occurred_at';
export const HISTORY_COLUMNS='id,request_id,action,actor_id,note,occurred_at';
export const EVENT_LABELS:Record<string,string>={ADJUSTMENT:'관리자 조정',DEDUCTION:'사용 차감',REVERSAL:'취소 반환',SUBMITTED:'신청',AUTO_APPROVED:'팀장 자동 승인',APPROVED:'승인',REJECTED:'거절',CANCELLED:'취소'};
