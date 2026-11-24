import 'server-only';
import {createHash} from 'node:crypto';
import {operationsService} from '../operations/service';
// Private object adapter. No public or signed URL, no upsert, no client path.
export async function uploadHrObject(path:string,bytes:Buffer,mime:string){
 const {error}=await operationsService().storage.from('employee-hr-documents').upload(path,bytes,{contentType:mime,upsert:false});
 if(error)throw new Error('파일 저장에 실패했습니다.');
}
export async function readHrObject(doc:{storage_path:string;sha256:string;byte_size:number}){
 const {data,error}=await operationsService().storage.from('employee-hr-documents').download(doc.storage_path);
 if(error||!data)throw new Error('파일을 찾을 수 없습니다.');
 const bytes=Buffer.from(await data.arrayBuffer());
 if(bytes.length!==doc.byte_size||createHash('sha256').update(bytes).digest('hex')!==doc.sha256)throw new Error('파일 무결성 확인에 실패했습니다.');
 return bytes;
}
