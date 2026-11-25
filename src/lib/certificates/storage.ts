import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import {requireCapability} from '../auth/access';
import {employeeClient} from '../employees/data';
import {operationsService} from '../operations/service';
import {sealBytes} from '../contracts/seals';
import {certificate} from './data';
import {certificatePdf} from './pdf';
import {assertCertificatePdfSize} from './limits';
export async function issueCertificate(id:string){
 await requireCapability('HR_CERTIFICATE_MANAGE');const c=await certificate(id);if(c.status==='ISSUED')return;
 if(c.status!=='APPROVED'||!c.seal_id)throw new Error('승인 상태를 확인해 주세요.');
 const service=operationsService();const {data:seal,error}=await service.from('company_seal').select('storage_path,sha256').eq('id',c.seal_id).single();if(error||!seal)throw new Error('직인을 확인해 주세요.');
 const bytes=await certificatePdf(c,await sealBytes(seal));assertCertificatePdfSize(bytes.byteLength);const hash=createHash('sha256').update(bytes).digest('hex'),objectPath=`${id}/${randomUUID()}.pdf`;
 const {error:upload}=await service.storage.from('hr-certificates').upload(objectPath,bytes,{contentType:'application/pdf',upsert:false});if(upload)throw new Error('PDF 저장 실패. 발급 재시도를 이용해 주세요.');
 const {error:finish}=await service.rpc('finish_hr_certificate',{p_id:id,p_path:objectPath,p_hash:hash});if(finish)throw new Error('PDF 발급 재시도를 이용해 주세요.');
}
export async function downloadCertificate(id:string){
 const c=await certificate(id);if(c.status!=='ISSUED'||!c.pdf_path||!c.pdf_sha256)return null;
 const {data,error}=await operationsService().storage.from('hr-certificates').download(c.pdf_path);if(error||!data)return null;
 assertCertificatePdfSize(data.size);const bytes=Buffer.from(await data.arrayBuffer());assertCertificatePdfSize(bytes.byteLength);if(createHash('sha256').update(bytes).digest('hex')!==c.pdf_sha256)return null;
 const db=await employeeClient();const {error:audit}=await db.rpc('record_hr_certificate_download',{p_id:id});if(audit)return null;return bytes;
}
