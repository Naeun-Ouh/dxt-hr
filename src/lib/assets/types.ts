export const ASSET_TYPES={NOTEBOOK:'노트북',DESKTOP:'데스크탑',MONITOR:'모니터',EXTERNAL_DRIVE:'외장하드'} as const;
export const ASSET_STATUSES={IN_USE:'사용중',AVAILABLE:'보유',REPAIR:'수리',LOST:'분실',DISPOSED:'폐기'} as const;
export type VaultKind='windows'|'account';
export interface Asset {id:string;type:keyof typeof ASSET_TYPES;manufacturer:string;model:string;serial_number:string;status:keyof typeof ASSET_STATUSES;current_holder_id:string|null;assigned_at:string|null;version:number}
export interface VaultEntry {id:string;kind:VaultKind;name:string;login_id:string;url:string;memo:string;device_asset_id:string|null;assigned_employee_id:string|null;key_suffix:string;version:number}
export const ASSET_COLUMNS='id,type,manufacturer,model,serial_number,status,current_holder_id,assigned_at,version';
export const VAULT_COLUMNS='id,kind,name,login_id,url,memo,device_asset_id,assigned_employee_id,key_suffix,version';
export const ASSIGNMENT_COLUMNS='id,asset_id,employee_id,assigned_at,returned_at,changed_by,state,asset_type,asset_model,serial_number,end_reason';
export const EVENT_COLUMNS='id,asset_id,previous_status,status,previous_holder_id,holder_id,actor_id,occurred_at,event_type,transfer_id';
export const vaultPath=(kind:VaultKind)=>kind==='windows'?'/admin/windows-licenses':'/admin/accounts';
export const manageCapability=(kind:VaultKind)=>kind==='windows'?'WINDOWS_MANAGE' as const:'ACCOUNT_MANAGE' as const;
export const revealCapability=(kind:VaultKind)=>kind==='windows'?'WINDOWS_KEY_REVEAL' as const:'ACCOUNT_PASSWORD_REVEAL' as const;

export interface AssetAssignment {
 id:string;asset_id:string;employee_id:string;assigned_at:string;returned_at:string|null;changed_by:string;
 state:'ACTIVE'|'RETURNED';asset_type:Asset['type'];asset_model:string;serial_number:string;end_reason:string|null;
}
export interface AssetTransfer {
 id:string;asset_id:string;assignment_id:string;sender_id:string;recipient_id:string;sender_name:string;recipient_name:string;
 asset_type:Asset['type'];asset_model:string;serial_number:string;handoff_date:string;memo:string;
 state:'PENDING'|'CONFIRMED'|'CANCELLED';requested_at:string;confirmed_at:string|null;cancelled_at:string|null;forced:boolean;
}
export const TRANSFER_COLUMNS='id,asset_id,assignment_id,sender_id,recipient_id,sender_name,recipient_name,asset_type,asset_model,serial_number,handoff_date,memo,state,requested_at,confirmed_at,cancelled_at,forced';
export const TRANSFER_STATES={PENDING:'인수 확인 대기',CONFIRMED:'인수 확인 완료',CANCELLED:'인계 취소'} as const;
export const ASSET_EVENTS:Record<string,string>={LEGACY_CHANGE:'기존 변경',REGISTERED:'등록',ASSIGNED:'지급',RETURNED:'반납',STATUS_CHANGED:'운영 상태 변경',TRANSFER_REQUESTED:'인계 등록',TRANSFER_CONFIRMED:'인수 확인',TRANSFER_CANCELLED:'인계 취소',ADMIN_CORRECTED:'관리자 보정'};
export const assignmentResult=(reason:string|null)=>reason==='TRANSFER_CONFIRMED'?'인계 완료':reason==='ADMIN_CORRECTED'?'관리자 보정':reason==='RETURNED'?'반납':'종료 (기존 기록)';
