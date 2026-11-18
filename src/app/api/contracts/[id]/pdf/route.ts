import { downloadContract } from '@/lib/contracts/storage';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
 try{const bytes=await downloadContract((await params).id);if(!bytes)return new Response('Not found',{status:404,headers});return new Response(new Uint8Array(bytes),{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="employment-contract.pdf"'}});}catch{return new Response('Not found',{status:404,headers});}
}
