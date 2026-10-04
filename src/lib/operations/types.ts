export type OperationKind='onboarding'|'offboarding';
export const TASK_LABELS={GMAIL:'Gmail',NOTION:'Notion',M365:'Microsoft 365',DEVICE:'장비 지급',WINDOWS:'Windows 확인',BUSINESS_CARD:'명함',LEAVE_SETUP:'휴가 설정',GUIDE:'사내 안내',SETTLEMENT:'급여/정산 외부 처리 확인'} as const;
export const TASK_STATES={TODO:'대기',IN_PROGRESS:'진행중',DONE:'완료',NOT_APPLICABLE:'해당 없음'} as const;
export const EVENT_CATEGORIES={OWN_MARRIAGE:'본인 결혼',FAMILY_MARRIAGE:'가족 결혼',CHILDBIRTH:'출산',CONDOLENCE:'조의'} as const;
export interface OperationCase{id:string;kind:OperationKind;employee_id:string;resignation_date:string|null;unused_leave_checked:boolean;document_received:boolean;completed_at:string|null;created_at:string;version:number}
export interface OperationTask{id:string;case_id:string;type:keyof typeof TASK_LABELS;status:keyof typeof TASK_STATES;memo:string;version:number}
export interface TaskOwner{task_id:string;employee_id:string}
export interface OperationHistory{id:string;case_id:string;task_id:string|null;action:string;previous_status:string|null;status:string|null;owner_ids:string[]|null;actor_id:string;occurred_at:string}
export interface Announcement{id:string;title:string;body:string;author_id:string;author_name:string;published_at:string|null;version:number}
export interface FamilyRegistration{id:string;employee_id:string;category:keyof typeof EVENT_CATEGORIES;event_date:string;title:string;details:string;created_at:string;version:number}
export interface FamilyPost{registration_id:string;employee_id:string;category:keyof typeof EVENT_CATEGORIES;event_date:string;title:string;body:string;published_at:string;version:number}
export interface BirthdayTemplate{year:number;subject:string;body:string;updated_by:string;version:number}
export interface ResignationDocument{id:string;case_id:string;storage_path:string;filename:string;mime_type:string;byte_size:number;ready:boolean;created_at:string}
export const OPERATION_COLUMNS='id,kind,employee_id,resignation_date,unused_leave_checked,document_received,completed_at,created_at,version';
export const TASK_COLUMNS='id,case_id,type,status,memo,version';
export const HISTORY_COLUMNS='id,case_id,task_id,action,previous_status,status,owner_ids,actor_id,occurred_at';
export const ANNOUNCEMENT_COLUMNS='id,title,body,author_id,author_name,published_at,version';
export const REGISTRATION_COLUMNS='id,employee_id,category,event_date,title,details,created_at,version';
export const POST_COLUMNS='registration_id,employee_id,category,event_date,title,body,published_at,version';
export const TEMPLATE_COLUMNS='year,subject,body,updated_by,version';
export const DOCUMENT_COLUMNS='id,case_id,storage_path,filename,mime_type,byte_size,ready,created_at';
export const operationCapability=(kind:OperationKind)=>kind==='onboarding'?'ONBOARDING_MANAGE' as const:'OFFBOARDING_MANAGE' as const;
