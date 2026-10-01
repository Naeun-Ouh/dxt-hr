import { requireCapability } from '@/lib/auth/access';
import { employeeClient } from '@/lib/employees/data';
import { isUuid } from '@/lib/employees/validation';
import { operationsService } from '@/lib/operations/service';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 await requireCapability('RESIGNATION_REASON_ACCESS');const {id}=await params;
 const denied=()=>new Response('Not found',{status:404,headers:{'Cache-Control':'private, no-store'}});if(!isUuid(id))return denied();
 const client=await employeeClient();const {data:doc,error}=await client.from('resignation_document').select('id,storage_path,filename,mime_type,ready').eq('id',id).maybeSingle();if(error||!doc?.ready)return denied();
 const {error:auditError}=await client.rpc('record_resignation_download',{p_id:id});if(auditError)return denied();
 // No authenticated Storage SELECT grant: even CEO cannot mint reusable signed URLs.
 // This checked server proxy is the sole browser download path.
 try{const {data,error:downloadError}=await operationsService().storage.from('resignation-letters').download(doc.storage_path);if(downloadError||!data)return denied();return new Response(data,{headers:{'Content-Type':doc.mime_type,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}catch{return new Response('Service unavailable',{status:503,headers:{'Cache-Control':'no-store'}});}
}
