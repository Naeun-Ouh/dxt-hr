import 'server-only';
import { createHash,randomUUID } from 'node:crypto';
import { operationsService } from '../operations/service';
import { contractDetail } from './data';
import { contractPdf } from './pdf';
import {sealBytes} from './seals';
import {SEAL_COLUMNS,type CompanySeal} from './types';
// Provider API is isolated here; domain records store only path and digest.
export async function finalizeContract(id:string){
 const {c,body,version,signatures}=await contractDetail(id,true);
 if(c.status==='COMPLETED')return;
 if(!c.company_signed_at||!version||!body||signatures.length!==2)throw new Error('Contract not signed');
 const service=operationsService(),company=signatures.find(s=>s.party==='COMPANY');
 let seal:Buffer|undefined;
 if(company?.company_seal_id){const {data,error}=await service.from('company_seal').select(SEAL_COLUMNS).eq('id',company.company_seal_id).single();if(error||!data)throw new Error('Seal unavailable');seal=await sealBytes(data as CompanySeal);}
 const bytes=await contractPdf(c,body,version.body_sha256,signatures,seal),hash=createHash('sha256').update(bytes).digest('hex');
 const objectPath=`${id}/${randomUUID()}.pdf`;
 const {error}=await service.storage.from('employment-contracts').upload(objectPath,bytes,{contentType:'application/pdf',upsert:false});if(error)throw new Error('Contract storage unavailable');
 const {error:finish}=await service.rpc('complete_employment_contract',{p_id:id,p_version:c.current_version,p_path:objectPath,p_hash:hash});if(finish)throw new Error('Contract finalization unavailable');
}
export async function downloadContract(id:string){
 const {c}=await contractDetail(id,true);if(c.status!=='COMPLETED'||!c.pdf_path||!c.pdf_sha256)return null;
 const {data,error}=await operationsService().storage.from('employment-contracts').download(c.pdf_path);if(error||!data)return null;
 const bytes=Buffer.from(await data.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==c.pdf_sha256)return null;
 return bytes;
}
