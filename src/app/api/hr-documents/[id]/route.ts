import {currentPrincipal} from '@/lib/auth/access';
import {employeeClient} from '@/lib/employees/data';
import {can} from '@/lib/permissions';
import {isUuid} from '@/lib/employees/validation';
import {readHrObject} from '@/lib/hr-documents/storage';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",'Referrer-Policy':'no-referrer'};
 const denied=()=>new Response('Not found',{status:404,headers});
 try{
  const principal=await currentPrincipal(),{id}=await params;if(!principal||!isUuid(id))return denied();
  const client=await employeeClient();
  const {data:doc,error}=await client.from('employee_hr_document').select('id,employee_id,document_type,archived_at,filename,mime_type,storage_path,sha256,byte_size').eq('id',id).eq('ready',true).maybeSingle();
  if(error||!doc)return denied();
  if(!can(principal,'PRIVATE_HR_ACCESS')){const {data:own,error:identity}=await client.rpc('current_employee_id');if(identity||own!==doc.employee_id||doc.document_type==='OTHER_HR'||doc.archived_at)return denied();}
  const download=new URL(request.url).searchParams.get('download')==='1';
  const {error:audit}=await client.rpc('access_hr_document',{p_id:id,p_action:download?'DOWNLOAD':'VIEW'});if(audit)return denied();
  const bytes=await readHrObject(doc);
  return new Response(new Uint8Array(bytes),{headers:{...headers,'Content-Type':doc.mime_type,'Content-Disposition':`${download?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(doc.filename)}`}});
 }catch{return denied();}
}
