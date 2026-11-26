import {createHash} from 'node:crypto';
import {currentPrincipal} from '@/lib/auth/access';
import {can} from '@/lib/permissions';
import {simulationData} from '@/lib/leave-simulation/data';
import {parseCriteria} from '@/lib/leave-simulation/input';
import {simulate} from '@/lib/leave-simulation/engine';
import {exportSimulation} from '@/lib/leave-simulation/export';
export const dynamic='force-dynamic';export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function POST(request:Request){
 const principal=await currentPrincipal();if(!principal||!can(principal,'LEAVE_MANAGE'))return Response.json({error:'접근할 수 없습니다.'},{status:404,headers});
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'요청을 확인해 주세요.'},{status:403,headers});
 try{
  const reader=request.body?.getReader();if(!reader)throw new Error();let length=0;const chunks:Uint8Array[]=[];for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>1024*1024){await reader.cancel();throw new Error();}chunks.push(value);}
  const criteria=parseCriteria(JSON.parse(Buffer.concat(chunks).toString('utf8')));const data=await simulationData();const report=simulate(data.people,data.ledger,criteria,data.evidenceThrough);
  const digest=createHash('sha256').update(JSON.stringify({criteria,data})).digest('hex');
  const url=new URL(request.url);
  if(url.searchParams.get('format')==='xlsx'){
   if(request.headers.get('x-preview-sha256')!==digest)return Response.json({error:'기준 또는 직원·원장이 변경되었습니다. 다시 실행해 주세요.'},{status:409,headers});
   return new Response(new Uint8Array(await exportSimulation(report,digest)),{headers:{...headers,'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="leave-simulation.xlsx"'}});
  }
  return Response.json({report,digest},{headers});
 }catch{return Response.json({error:'검증 기준과 직원 근거 형식을 확인해 주세요.'},{status:400,headers});}
}
