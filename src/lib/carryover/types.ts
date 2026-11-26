export const CASE_COLUMNS='id,employee_id,year,state,project_end,version,captured_at,reviewed_at';
export const EVIDENCE_COLUMNS='id,case_id,version,mode,snapshot,actor_id,captured_at';
export const REVIEW_COLUMNS='id,case_id,version,state,note,actor_id,occurred_at';
export const REVIEW_STATES={NEEDS_REVIEW:'근거 검토 중',CONFIRMED:'이월 후보 확인',NOT_ELIGIBLE:'후보 비대상'} as const;
export interface CarryoverCase{id:string;employee_id:string;year:number;state:keyof typeof REVIEW_STATES;project_end:string;version:number;captured_at:string;reviewed_at:string|null}
export interface CarryoverEvidence{id:string;case_id:string;version:number;mode:'NOV30_SNAPSHOT'|'MANUAL_RECONCILIATION';snapshot:{as_of:string;source_reference?:string;verified_project_end?:string;assignments?:{assignment_id:string;project_id:string;project_name:string;customer_name:string;assignment_start:string;assignment_end:string;project_end:string}[]};actor_id:string;captured_at:string}
export interface CarryoverReview{id:string;case_id:string;version:number;state:keyof typeof REVIEW_STATES;note:string;actor_id:string;occurred_at:string}
export function carryoverGuidance(c:CarryoverCase){if(c.state==='NOT_ELIGIBLE')return '현재 검토 결과 비대상입니다. 정정이 필요하면 관리자에게 문의하세요.';return c.project_end<=`${c.year}-12-31`?'프로젝트 종료 후 남은 휴가를 우선 사용해 주세요. 실제 12월 31일 잔여분만 별도 대조합니다.':'연말까지 프로젝트가 이어집니다. 실제 12월 31일 잔여분을 별도 대조합니다.';}
