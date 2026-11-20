import 'server-only';
import { createHash,randomUUID } from 'node:crypto';
import { operationsService } from '../operations/service';
import { contractDetail } from './data';
import { contractPdf } from './pdf';
// Provider API is isolated here; domain records store only path and digest.
export async function finalizeContract(id:string){
 const {c,body,version,signatures}=await contractDetail(id,true);
 if(c.status==='COMPLETED')return;
 if(!c.company_signed_at||!version||!body||signatures.length!==2)throw new Error('Contract not signed');
 const bytes=await contractPdf(c,body,version.body_sha256,signatures),hash=createHash('sha256').update(bytes).digest('hex');
 const objectPath=`${id}/${randomUUID()}.pdf`,service=operationsService();
 const {error}=await service.storage.from('employment-contracts').upload(objectPath,bytes,{contentType:'application/pdf',upsert:false});if(error)throw new Error('Contract storage unavailable');
 const {error:finish}=await service.rpc('complete_employment_contract',{p_id:id,p_version:c.current_version,p_path:objectPath,p_hash:hash});if(finish)throw new Error('Contract finalization unavailable');
}
export async function downloadContract(id:string){
 const {c}=await contractDetail(id,true);if(c.status!=='COMPLETED'||!c.pdf_path||!c.pdf_sha256)return null;
 const {data,error}=await operationsService().storage.from('employment-contracts').download(c.pdf_path);if(error||!data)return null;
 const bytes=Buffer.from(await data.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==c.pdf_sha256)return null;
 return bytes;
}
