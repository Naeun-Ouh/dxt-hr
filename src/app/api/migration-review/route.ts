import { currentPrincipal } from '@/lib/auth/access';
import { can } from '@/lib/permissions';
import { readRows } from '@/lib/operations/data';
import { boundedBody, previewMigration } from '@/lib/migration/review';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function POST(request:Request){
 const principal=await currentPrincipal();
 if(!principal||!can(principal,'PRIVATE_HR_ACCESS'))return Response.json({error:'접근할 수 없습니다.'},{status:404,headers});
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'요청을 확인해 주세요.'},{status:403,headers});
 try{
  const bytes=await boundedBody(request);
  const form=await new Response(bytes.buffer as ArrayBuffer,{headers:{'Content-Type':request.headers.get('content-type')??''}}).formData();
  const source=form.get('source'),mapping=form.get('mapping');
  if(!(source instanceof File)||typeof mapping!=='string'||form.getAll('source').length!==1||form.getAll('mapping').length!==1)throw new Error('INVALID_INPUT');
  const employees=await readRows<{id:string}>('employee','id');
  const report=await previewMigration(Buffer.from(await source.arrayBuffer()),source.name,mapping,new Set(employees.map(e=>e.id)));
  return Response.json(report,{headers});
 }catch{return Response.json({error:'원본 형식, 크기, 매핑 및 직원 연결을 확인해 주세요.'},{status:400,headers});}
}
