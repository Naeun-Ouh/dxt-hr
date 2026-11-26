// The caller must supply IDs already selected under its own authorization/RLS scope.
// Bounded URL size and parallelism; each batch retains pagination beyond PostgREST's cap.
export async function expenseBatchPages<T>(input:string[],page:(ids:string[],from:number,to:number)=>Promise<T[]>):Promise<T[]> {
 const ids=[...new Set(input)].sort(),batches:string[][]=[];
 for(let n=0;n<ids.length;n+=100)batches.push(ids.slice(n,n+100));
 const result:T[]=[];
 for(let n=0;n<batches.length;n+=4){
  const groups=await Promise.all(batches.slice(n,n+4).map(async batch=>{
   const rows:T[]=[];
   for(let from=0;;from+=500){const next=await page(batch,from,from+499);rows.push(...next);if(next.length<500)return rows;}
  }));result.push(...groups.flat());
 }
 return result;
}
