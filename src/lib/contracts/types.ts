export const CONTRACT_COLUMNS='id,employee_id,employee_snapshot,template_id,status,current_version,created_by,created_at,sent_at,first_viewed_at,employee_signed_at,company_signed_at,completed_at,pdf_path,pdf_sha256';
export const VERSION_COLUMNS='contract_id,version,encrypted_body,body_sha256,created_by,created_at';
export const SIGNATURE_COLUMNS='contract_id,version,party,actor_id,signed_at,body_sha256,evidence,auth_session_id,authenticated_email,auth_provider';
export const EVENT_COLUMNS='id,contract_id,action,actor_id,occurred_at';
export const TEMPLATE_COLUMNS='id,name,encrypted_body,active,created_by,created_at';
export type ContractStatus='DRAFT'|'READY_TO_SEND'|'SENT'|'VIEWED'|'EMPLOYEE_SIGNED'|'COMPLETED'|'CANCELLED'|'DECLINED';
export const STATUS_LABELS:Record<ContractStatus,string>={DRAFT:'작성 중',READY_TO_SEND:'발송 준비',SENT:'서명 요청',VIEWED:'직원 열람',EMPLOYEE_SIGNED:'직원 서명 완료',COMPLETED:'완료',CANCELLED:'취소',DECLINED:'서명 거절'};
export interface Contract {id:string;employee_id:string;employee_snapshot:{name:string;department:string|null;title:string;email:string;hire_date:string};template_id:string|null;status:ContractStatus;current_version:number;created_by:string;created_at:string;sent_at:string|null;first_viewed_at:string|null;employee_signed_at:string|null;company_signed_at:string|null;completed_at:string|null;pdf_path:string|null;pdf_sha256:string|null}
export interface ContractVersion {contract_id:string;version:number;encrypted_body:string;body_sha256:string;created_by:string;created_at:string}
export interface Signature {contract_id:string;version:number;party:'EMPLOYEE'|'COMPANY';actor_id:string;signed_at:string;body_sha256:string;evidence:string;auth_session_id:string|null;authenticated_email:string|null;auth_provider:string|null}
export interface ContractEvent {id:string;contract_id:string;action:string;actor_id:string|null;occurred_at:string}
export interface Template {id:string;name:string;encrypted_body:string;active:boolean;created_by:string;created_at:string}
export const seoulTime=(value:string|null)=>value?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'medium'}).format(new Date(value)):'—';
