import {previewSeal} from '@/lib/contracts/seals';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
 try{return new Response(new Uint8Array(await previewSeal((await params).id)),{headers:{...headers,'Content-Type':'image/png','Content-Disposition':'inline; filename="company-seal.png"'}});}catch{return new Response('Not found',{status:404,headers});}
}
