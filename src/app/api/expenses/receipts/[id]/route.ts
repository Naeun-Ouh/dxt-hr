import { requireCapability } from '@/lib/auth/access';
import { employeeClient } from '@/lib/employees/data';
import { isUuid } from '@/lib/employees/validation';
import { can } from '@/lib/permissions';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
 const principal=await requireCapability('EMPLOYEE_ACCESS'),{id}=await params;
 const denied=()=>new Response('Not found',{status:404,headers:{'Cache-Control':'private, no-store'}});if(!isUuid(id))return denied();
 const client=await employeeClient();const {data:a,error}=await client.from('expense_attachment').select('id,claim_id,storage_path,filename,mime_type,ready').eq('id',id).maybeSingle();if(error||!a?.ready)return denied();
 const {data:claim}=await client.from('expense_claim').select('employee_id').eq('id',a.claim_id).maybeSingle();const {data:self}=await client.rpc('current_employee_id');
 if(!claim||(claim.employee_id!==self&&!can(principal,'EXPENSE_MANAGE')))return denied();
 // Proxy authenticated storage reads; no public or reusable signed receipt URLs.
 const {data,error:downloadError}=await client.storage.from('expense-evidence').download(a.storage_path);if(downloadError||!data)return denied();
 return new Response(data,{headers:{'Content-Type':a.mime_type,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(a.filename)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
