'use server';
import { randomUUID } from 'node:crypto';
import { redirect,notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireCapability } from '@/lib/auth/access';
import { employeeClient } from '@/lib/employees/data';
import { isUuid,versionFrom } from '@/lib/employees/validation';
import { encryptValue,decryptValue,parseKeyring } from '@/lib/employees/encryption';
import { assetInput,vaultInput,transferInput } from '@/lib/assets/validation';
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

export async function requestAssetTransfer(assetId:string,assignmentId:string,requestId:string,_state:FormState,form:FormData):Promise<FormState>{
 await requireCapability('EMPLOYEE_ACCESS','/assets/me');
 if(![assetId,assignmentId,requestId].every(isUuid))notFound();
 const db=await employeeClient(),identity=await db.rpc('current_employee_id');
 if(identity.error||!identity.data)notFound();
 const me=identity.data;
 const [asset,assignment]=await Promise.all([
  db.from('asset').select('id').eq('id',assetId).eq('current_holder_id',me),
  db.from('asset_assignment').select('id,state').eq('id',assignmentId).eq('asset_id',assetId).eq('employee_id',me),
 ]);
 if(asset.error||assignment.error) return {error:'장비 정보를 불러오지 못했습니다.'};
 if(!asset.data.length||assignment.data[0]?.state!=='ACTIVE')notFound();
 let input;try{input=transferInput(form);}catch(error){return {error:error instanceof Error?error.message:'입력을 확인해 주세요.'};}
 if(input.recipient===me)return {error:'다른 수신자를 선택해 주세요.'};
 const recipient=await db.from('employee').select('id').eq('id',input.recipient).eq('employment_status','ACTIVE');
 if(recipient.error||!recipient.data.length)return {error:'재직 중인 수신자를 선택해 주세요.'};
 const {error}=await db.rpc('request_asset_transfer',{p_id:requestId,p_asset:assetId,p_assignment:assignmentId,p_recipient:input.recipient,p_date:input.date,p_memo:input.memo});
 if(error)return {error:'인계를 등록하지 못했습니다. 지급일 이후의 인계일과 현재 인계 상태를 확인해 주세요.'};
 revalidatePath('/assets/me');revalidatePath('/admin/assets');redirect('/assets/me?saved=1');
}
export async function resolveAssetTransfer(id:string,action:'CONFIRMED'|'CANCELLED',force:boolean,_state:FormState,_form:FormData):Promise<FormState>{
 void _state;void _form;
 const admin=force||action==='CANCELLED';
 await requireCapability(admin?'ASSET_MANAGE':'EMPLOYEE_ACCESS',admin?'/admin/assets':'/assets/me');
 if(!isUuid(id)||!['CONFIRMED','CANCELLED'].includes(action)||typeof force!=='boolean')notFound();
 const db=await employeeClient();let request=db.from('asset_transfer').select('id,asset_id').eq('id',id);
 if(!admin){const identity=await db.rpc('current_employee_id');if(identity.error||!identity.data)notFound();request=request.eq('recipient_id',identity.data);}
 const transfer=await request;if(transfer.error)return {error:'인계 정보를 불러오지 못했습니다.'};if(!transfer.data.length)notFound();
 const {error}=await db.rpc('resolve_asset_transfer',{p_id:id,p_action:action,p_force:force});
 if(error)return {error:'처리하지 못했습니다. 인계 상태와 수신자의 재직 상태를 확인하고 새로고침해 주세요.'};
 revalidatePath('/assets/me');revalidatePath('/admin/assets');redirect(admin?`/admin/assets/${transfer.data[0].asset_id}?saved=1`:'/assets/me?saved=1');
}
