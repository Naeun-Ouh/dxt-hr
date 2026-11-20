import 'server-only';
import {notFound} from 'next/navigation';
import {createHash} from 'node:crypto';
import {requireCapability} from '../auth/access';
import {readRows} from '../operations/data';
import {operationsService} from '../operations/service';
import {isUuid} from '../employees/validation';
import {SEAL_COLUMNS,type CompanySeal} from './types';
export async function companySeals(){await requireCapability('EMPLOYMENT_CONTRACT_MANAGE');return readRows<CompanySeal>('company_seal',SEAL_COLUMNS,{ready:true},'uploaded_at');}
// Internal adapter. Call only after contract/private or seal-manager authorization.
export async function sealBytes(seal:Pick<CompanySeal,'storage_path'|'sha256'>){
 const {data,error}=await operationsService().storage.from('company-seals').download(seal.storage_path);
 if(error||!data)throw new Error('Seal unavailable');
 const bytes=Buffer.from(await data.arrayBuffer());
 if(createHash('sha256').update(bytes).digest('hex')!==seal.sha256)throw new Error('Seal integrity check failed');
 return bytes;
}
export async function previewSeal(id:string){
 await requireCapability('EMPLOYMENT_CONTRACT_MANAGE');if(!isUuid(id))notFound();
 const seal=(await readRows<CompanySeal>('company_seal',SEAL_COLUMNS,{id,ready:true}))[0];if(!seal)notFound();return sealBytes(seal);
}
