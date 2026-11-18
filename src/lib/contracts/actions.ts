'use server';
import { createHash,randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireCapability } from '../auth/access';
import { employeeClient } from '../employees/data';
import { encryptHr } from '../employees/crypto-server';
import { isUuid } from '../employees/validation';
import { can } from '../permissions';
import { contractDetail } from './data';
import { finalizeContract } from './storage';
export interface ContractResult {error?:string;success?:string;id?:string}
const digest=(body:string)=>createHash('sha256').update(body,'utf8').digest('hex');
const bodyFrom=(form:FormData)=>{const value=String(form.get('body')||'').trim();if(!value||value.length>30000||/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value))throw new Error('Invalid body');return value;};
export async function saveTemplate(_state:ContractResult,form:FormData):Promise<ContractResult>{
 await requireCapability('EMPLOYMENT_CONTRACT_PRIVATE_ACCESS');
 try{const id=randomUUID(),body=bodyFrom(form),name=String(form.get('name')||'').trim();if(!name||name.length>120)throw new Error('Invalid name');const db=await employeeClient();const {error}=await db.rpc('create_contract_template',{p_id:id,p_name:name,p_body:encryptHr(body,`contract-template:${id}`)});if(error)throw error;revalidatePath('/admin/contracts');return {success:'새 양식 버전이 저장되었습니다.'};}catch{return {error:'양식을 저장하지 못했습니다. 입력과 권한을 확인해 주세요.'};}
}
export async function createContracts(_state:ContractResult,form:FormData):Promise<ContractResult>{
 await requireCapability('EMPLOYMENT_CONTRACT_PRIVATE_ACCESS');
 try{const body=bodyFrom(form),ids=[...new Set(form.getAll('employee_id').map(String))];if(!ids.length||ids.length>100||ids.some(id=>!isUuid(id)))throw new Error('Invalid employees');const items=ids.map(employee_id=>{const id=randomUUID();return {id,employee_id,body:encryptHr(body,`contract:${id}:1`),hash:digest(body)};});const template=String(form.get('template_id')||'');if(template&&!isUuid(template))throw new Error('Invalid template');const db=await employeeClient();const {error}=await db.rpc('create_employment_contracts',{p_items:items,p_template:template||null});if(error)throw error;revalidatePath('/admin/contracts');return {success:`${items.length}건을 작성했습니다. 각 계약을 미리보기한 후 발송해 주세요.`,id:items[0].id};}catch{return {error:'계약을 생성하지 못했습니다. 직원 선택과 본문을 확인해 주세요.'};}
}
export async function contractAction(_state:ContractResult,form:FormData):Promise<ContractResult>{
 const principal=await requireCapability('EMPLOYEE_ACCESS');const id=String(form.get('id')||''),version=Number(form.get('version')),action=String(form.get('action')||'');
 if(!isUuid(id)||!Number.isSafeInteger(version)||version<1)return {error:'유효하지 않은 계약입니다.'};
 const {c,own}=await contractDetail(id);
 try{
 const db=await employeeClient();let rpc:string,args:Record<string,unknown>={p_id:id,p_version:version};
 if(action==='EMPLOYEE_SIGN'||action==='COMPANY_SIGN'){
  if(action==='EMPLOYEE_SIGN'&&!own)throw new Error('Forbidden');if(action==='COMPANY_SIGN'&&!can(principal,'EMPLOYMENT_CONTRACT_COMPANY_SIGN'))throw new Error('Forbidden');
  if(form.get('consent')!=='on')throw new Error('Consent required');
  rpc=action==='EMPLOYEE_SIGN'?'sign_employee_contract':'sign_company_contract';args={...args,p_hash:String(form.get('hash')||''),p_consent:true};
 }else if(action==='REVISE'){
  if(!can(principal,'EMPLOYMENT_CONTRACT_PRIVATE_ACCESS'))throw new Error('Forbidden');const body=bodyFrom(form);rpc='revise_employment_contract';args={...args,p_body:encryptHr(body,`contract:${id}:${version+1}`),p_hash:digest(body)};
 }else if(action==='FINALIZE'){
  if(!can(principal,'EMPLOYMENT_CONTRACT_COMPANY_SIGN'))throw new Error('Forbidden');await finalizeContract(id);revalidatePath('/');return {success:'완료 PDF가 보관되었습니다.'};
 }else{
  if(action==='VIEWED'||action==='DECLINED'){if(!own)throw new Error('Forbidden');}else if(!can(principal,'EMPLOYMENT_CONTRACT_MANAGE'))throw new Error('Forbidden');
  if(!['VIEWED','DECLINED','READY_TO_SEND','SENT','CANCELLED'].includes(action))throw new Error('Invalid action');rpc='transition_employment_contract';args={...args,p_action:action};
 }
 const {error}=await db.rpc(rpc,args);if(error)throw error;
 if(action==='COMPANY_SIGN'){try{await finalizeContract(id);}catch{revalidatePath('/');return {error:'회사 서명은 저장되었습니다. PDF 보관 재시도를 눌러 주세요.'};}}
 revalidatePath('/','layout');return {success:action==='SENT'?'내 계약 화면에 서명 요청을 등록했습니다.':`처리되었습니다. (${c.employee_snapshot.name})`};
 }catch{return {error:'처리하지 못했습니다. 권한·계약 버전을 확인하고 새로고침해 주세요.'};}
}
