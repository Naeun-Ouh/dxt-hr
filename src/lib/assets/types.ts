export const ASSET_TYPES={NOTEBOOK:'노트북',DESKTOP:'데스크탑',MONITOR:'모니터',EXTERNAL_DRIVE:'외장하드'} as const;
export const ASSET_STATUSES={IN_USE:'사용중',AVAILABLE:'보유',REPAIR:'수리',LOST:'분실',DISPOSED:'폐기'} as const;
export type VaultKind='windows'|'account';
export interface Asset {id:string;type:keyof typeof ASSET_TYPES;manufacturer:string;model:string;serial_number:string;status:keyof typeof ASSET_STATUSES;current_holder_id:string|null;assigned_at:string|null;version:number}
export interface VaultEntry {id:string;kind:VaultKind;name:string;login_id:string;url:string;memo:string;device_asset_id:string|null;assigned_employee_id:string|null;key_suffix:string;version:number}
export const ASSET_COLUMNS='id,type,manufacturer,model,serial_number,status,current_holder_id,assigned_at,version';
export const VAULT_COLUMNS='id,kind,name,login_id,url,memo,device_asset_id,assigned_employee_id,key_suffix,version';
export const ASSIGNMENT_COLUMNS='id,asset_id,employee_id,assigned_at,returned_at,changed_by';
export const EVENT_COLUMNS='id,asset_id,previous_status,status,previous_holder_id,holder_id,actor_id,occurred_at';
export const vaultPath=(kind:VaultKind)=>kind==='windows'?'/admin/windows-licenses':'/admin/accounts';
export const manageCapability=(kind:VaultKind)=>kind==='windows'?'WINDOWS_MANAGE' as const:'ACCOUNT_MANAGE' as const;
export const revealCapability=(kind:VaultKind)=>kind==='windows'?'WINDOWS_KEY_REVEAL' as const:'ACCOUNT_PASSWORD_REVEAL' as const;
