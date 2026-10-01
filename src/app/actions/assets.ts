'use server';
import { randomUUID } from 'node:crypto';
import { redirect,notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireCapability } from '@/lib/auth/access';
import { employeeClient } from '@/lib/employees/data';
import { isUuid,versionFrom } from '@/lib/employees/validation';
import { encryptValue,decryptValue,parseKeyring } from '@/lib/employees/encryption';
import { assetInput,vaultInput } from '@/lib/assets/validation';
import { manageCapability,revealCapability,vaultPath,type VaultKind } from '@/lib/assets/types';
import type { FormState } from '@/lib/employees/types';
function kindCheck(kind:string):asserts kind is VaultKind{if(kind!=='windows'&&kind!=='account')notFound();}
function keyring(){return parseKeyring(process.env.VAULT_ENCRYPTION_KEYS,process.env.VAULT_ENCRYPTION_ACTIVE_KEY);}
export async function saveAsset(id:string|null,_state:FormState,form:FormData):Promise<FormState>{
 await requireCapability('ASSET_MANAGE','/admin/assets');if(id&&!isUuid(id))notFound();const recordId=id||randomUUID();
 let values;try{values=assetInput(form);}catch(error){return {error:error instanceof Error?error.message:'입력을 확인해 주세요.'};}
 try{const {error}=await(await employeeClient()).rpc('save_asset',{p_id:recordId,p_values:values,p_expected_version:versionFrom(form)});if(error)return {error:'저장하지 못했습니다. 중복 S/N, 보유자 또는 최신 변경 내용을 확인하고 다시 시도해 주세요.'};}catch{return {error:'저장하지 못했습니다. 다시 시도해 주세요.'};}
 revalidatePath('/admin/assets');revalidatePath('/assets/me');redirect(`/admin/assets/${recordId}?saved=1`);
}
export async function saveVault(kind:VaultKind,id:string|null,_state:FormState,form:FormData):Promise<FormState>{
 kindCheck(kind);await requireCapability(manageCapability(kind),vaultPath(kind));if(id&&!isUuid(id))notFound();const recordId=id||randomUUID();
 let input;try{input=vaultInput(form,kind,!id);}catch(error){return {error:error instanceof Error?error.message:'입력을 확인해 주세요.'};}
 try{const ciphertext=input.secret?encryptValue(input.secret,`vault:${kind}:${recordId}`,keyring()):null;
 const {error}=await(await employeeClient()).rpc('save_vault_entry',{p_id:recordId,p_kind:kind,p_values:input.values,p_ciphertext:ciphertext,p_expected_version:versionFrom(form)});if(error)return {error:'저장하지 못했습니다. 최신 변경 내용과 연결 항목을 확인해 주세요.'};}catch{return {error:'저장하지 못했습니다. 암호화 설정과 연결 상태를 확인해 주세요.'};}
 revalidatePath(vaultPath(kind));redirect(`${vaultPath(kind)}/${recordId}?saved=1`);
}
export async function revealVault(kind:VaultKind,id:string):Promise<{value?:string;error?:string}>{
 kindCheck(kind);await requireCapability(revealCapability(kind),vaultPath(kind));if(!isUuid(id))notFound();
 try{const {data,error}=await(await employeeClient()).rpc('reveal_vault_entry',{p_id:id,p_kind:kind});if(error||typeof data!=='string')return {error:'비밀값을 확인할 수 없습니다.'};return {value:decryptValue(data,`vault:${kind}:${id}`,keyring())};}catch{return {error:'비밀값을 확인할 수 없습니다.'};}
}
export async function deleteAssetRecord(kind:'asset'|VaultKind,id:string,_state:FormState,form:FormData):Promise<FormState>{
 if(kind!=='asset')kindCheck(kind);await requireCapability(kind==='asset'?'ASSET_MANAGE':manageCapability(kind));if(!isUuid(id))notFound();
 try{const {error}=await(await employeeClient()).rpc(kind==='asset'?'delete_asset':'delete_vault_entry',{p_id:id,p_expected_version:versionFrom(form),...(kind==='asset'?{}:{p_kind:kind})});if(error)return {error:'삭제하지 못했습니다. 지급·변경 이력 또는 연결된 기록이 있는 장비는 보존하며, 최신 버전을 확인해 주세요.'};}catch{return {error:'삭제하지 못했습니다.'};}
 const path=kind==='asset'?'/admin/assets':vaultPath(kind);revalidatePath(path);redirect(path);
}
