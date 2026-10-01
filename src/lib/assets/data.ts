import 'server-only';
import { notFound } from 'next/navigation';
import { requireCapability } from '../auth/access';
import { employeeClient } from '../employees/data';
import { isUuid } from '../employees/validation';
import { ASSET_COLUMNS,VAULT_COLUMNS,manageCapability,vaultPath,type Asset,type VaultEntry,type VaultKind } from './types';
export async function assets(own=false):Promise<Asset[]>{
 await requireCapability(own?'EMPLOYEE_ACCESS':'ASSET_MANAGE',own?'/assets/me':'/admin/assets');
 const db=await employeeClient();let request=db.from('asset').select(ASSET_COLUMNS).order('serial_number');
 if(own){const {data,error}=await db.rpc('current_employee_id');if(error)throw new Error('장비 정보를 불러오지 못했습니다.');if(!data)return [];request=request.eq('current_holder_id',data);}
 const {data,error}=await request;if(error)throw new Error('장비 정보를 불러오지 못했습니다.');return data as Asset[];
}
export async function assetRecord(id:string,own=false){if(!isUuid(id))notFound();const found=(await assets(own)).find(a=>a.id===id);if(!found)notFound();return found;}
export async function vaultEntries(kind:VaultKind):Promise<VaultEntry[]>{await requireCapability(manageCapability(kind),vaultPath(kind));const {data,error}=await(await employeeClient()).from('vault_entry').select(VAULT_COLUMNS).eq('kind',kind).order('name');if(error)throw new Error('목록을 불러오지 못했습니다.');return data as VaultEntry[];}
export async function assetEmployees(){await requireCapability('ASSET_MANAGE');const {data,error}=await(await employeeClient()).from('employee').select('id,name,employment_status').order('name');if(error)throw new Error('직원 정보를 불러오지 못했습니다.');return data as {id:string;name:string;employment_status:string}[];}
