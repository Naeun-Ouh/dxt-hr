// Issue #15: retained tombstone for stale schedules; never loads credentials or runs a worker.
export const dynamic='force-dynamic';
export async function GET(){
 return Response.json({disabled:true,reason:'Automatic company mail is deferred'},{status:410,headers:{'Cache-Control':'no-store'}});
}
