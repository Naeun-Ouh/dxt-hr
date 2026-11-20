import 'server-only';
import { notFound } from 'next/navigation';
import { requireCapability } from '../auth/access';
import { employeeClient } from '../employees/data';
import { isUuid } from '../employees/validation';
import { ASSET_COLUMNS,ASSIGNMENT_COLUMNS,TRANSFER_COLUMNS,type AssetAssignment,type AssetTransfer,VAULT_COLUMNS,manageCapability,vaultPath,type Asset,type VaultEntry,type VaultKind } from './types';
export async function assets(own=false):Promise<Asset[]>{
 await requireCapability(own?'EMPLOYEE_ACCESS':'ASSET_MANAGE',own?'/assets/me':'/admin/assets');
 const db=await employeeClient();let request=db.from('asset').select(ASSET_COLUMNS).order('serial_number');
 if(own){const {data,error}=await db.rpc('current_employee_id');if(error)throw new Error('장비 정보를 불러오지 못했습니다.');if(!data)return [];request=request.eq('current_holder_id',data);}
 const {data,error}=await request;if(error)throw new Error('장비 정보를 불러오지 못했습니다.');return data as Asset[];
}
export async function assetRecord(id:string,own=false){if(!isUuid(id))notFound();const found=(await assets(own)).find(a=>a.id===id);if(!found)notFound();return found;}
export async function vaultEntries(kind:VaultKind):Promise<VaultEntry[]>{await requireCapability(manageCapability(kind),vaultPath(kind));const {data,error}=await(await employeeClient()).from('vault_entry').select(VAULT_COLUMNS).eq('kind',kind).order('name');if(error)throw new Error('목록을 불러오지 못했습니다.');return data as VaultEntry[];}
export async function assetEmployees(){await requireCapability('ASSET_MANAGE');const {data,error}=await(await employeeClient()).from('employee').select('id,name,employment_status').order('name');if(error)throw new Error('직원 정보를 불러오지 못했습니다.');return data as {id:string;name:string;employment_status:string}[];}

// Explicit own filters apply even to managers visiting the personal screen. RLS is the second boundary.
export async function myAssetRecords(id?:string){
 await requireCapability('EMPLOYEE_ACCESS','/assets/me');
 if(id&&!isUuid(id))notFound();
 const db=await employeeClient(),identity=await db.rpc('current_employee_id');
 if(identity.error)throw new Error('장비 정보를 불러오지 못했습니다.');
 const me=identity.data as string|null;
 if(!me){if(id)notFound();return {me,assets:[] as Asset[],assignments:[] as AssetAssignment[],transfers:[] as AssetTransfer[]};}
 let assigned=db.from('asset_assignment').select(ASSIGNMENT_COLUMNS).eq('employee_id',me).order('assigned_at',{ascending:false});
 let outgoing=db.from('asset_transfer').select(TRANSFER_COLUMNS).eq('sender_id',me).order('requested_at',{ascending:false});
 let incoming=db.from('asset_transfer').select(TRANSFER_COLUMNS).eq('recipient_id',me).order('requested_at',{ascending:false});
 let current=db.from('asset').select(ASSET_COLUMNS).eq('current_holder_id',me).order('serial_number');
 if(id){assigned=assigned.eq('asset_id',id);outgoing=outgoing.eq('asset_id',id);incoming=incoming.eq('asset_id',id);current=current.eq('id',id);}
 const [a,o,i,c]=await Promise.all([assigned,outgoing,incoming,current]);
 if(a.error||o.error||i.error||c.error)throw new Error('장비 이력을 불러오지 못했습니다.');
 const assignments=a.data as AssetAssignment[],transfers=[...o.data,...i.data] as AssetTransfer[];
 if(id&&!assignments.length&&!transfers.length)notFound();
 return {me,assets:c.data as Asset[],assignments,transfers};
}
export async function transferRecipients(){
 await requireCapability('EMPLOYEE_ACCESS','/assets/me');
 const {data,error}=await(await employeeClient()).from('employee').select('id,name,employment_status').eq('employment_status','ACTIVE').order('name');
 if(error)throw new Error('직원 정보를 불러오지 못했습니다.');
 return data as {id:string;name:string;employment_status:string}[];
}
