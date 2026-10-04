import { cronAuthorized } from '@/lib/operations/mail';
import { runCompanyMail } from '@/lib/operations/mail-server';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function GET(request:Request){
 const headers={'Cache-Control':'no-store'};
 if(!cronAuthorized(request.headers.get('authorization'),process.env.CRON_SECRET))return Response.json({error:'Unauthorized'},{status:401,headers});
 try{const result=await runCompanyMail();return Response.json(result,{status:result.configured&&!result.uncertain?200:503,headers});}catch{return Response.json({error:'Mail service unavailable'},{status:503,headers});}
}
