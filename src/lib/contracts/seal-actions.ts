'use server';
import {randomUUID} from 'node:crypto';
import {revalidatePath} from 'next/cache';
import {requireCapability} from '../auth/access';
import {employeeClient} from '../employees/data';
import {operationsService} from '../operations/service';
import {isUuid} from '../employees/validation';
import {normalizeSeal,SEAL_MAX_BYTES} from './seal-image';
export interface SealResult {error?:string;success?:string}
export async function uploadCompanySeal(_state:SealResult,form:FormData):Promise<SealResult>{
 await requireCapability('EMPLOYMENT_CONTRACT_MANAGE');
 try{
  const company=String(form.get('company')||'').trim(),representative=String(form.get('representative')||'').trim(),expected=String(form.get('expected')||'');
  const file=form.get('seal');
  if(!company||!representative||company.length>100||representative.length>100||/[\x00-\x1f\x7f]/.test(company+representative)||expected&&!isUuid(expected)||!(file instanceof File)||file.size>SEAL_MAX_BYTES)throw new Error('Invalid upload');
  const {bytes,hash}=await normalizeSeal(Buffer.from(await file.arrayBuffer())),id=randomUUID(),db=await employeeClient();
  const {error:reserve}=await db.rpc('reserve_company_seal',{p_id:id,p_company:company,p_representative:representative,p_hash:hash});if(reserve)throw reserve;
  const {error:upload}=await operationsService().storage.from('company-seals').upload(`${id}/seal.png`,bytes,{contentType:'image/png',upsert:false});if(upload)throw upload;
  const {error:activate}=await db.rpc('activate_company_seal',{p_id:id,p_expected:expected||null});if(activate)throw activate;
  revalidatePath('/admin/contracts','layout');return {success:'새 직인이 활성화되었습니다. 이후 회사 서명부터 적용됩니다.'};
 }catch{return {error:'직인을 저장하지 못했습니다. 1MB 이하 PNG와 입력 정보를 확인하고, 다른 관리자가 변경했다면 새로고침해 주세요.'};}
}
export async function deactivateCompanySeal(_state:SealResult,form:FormData):Promise<SealResult>{
 await requireCapability('EMPLOYMENT_CONTRACT_MANAGE');
 const id=String(form.get('expected')||'');if(!isUuid(id))return {error:'새로고침 후 다시 시도해 주세요.'};
 const {error}=await (await employeeClient()).rpc('deactivate_company_seal',{p_expected:id});
 if(error)return {error:'직인 상태가 변경되었습니다. 새로고침해 주세요.'};
 revalidatePath('/admin/contracts','layout');return {success:'직인 사용을 중지했습니다. 기존 계약은 유지됩니다.'};
}
