import type {Transaction} from '@electric-sql/pglite';
import type {IncomingMessage,ServerResponse} from 'node:http';
const enabled=process.env.DXT_PERF_HARNESS==='1';
type Aggregate={count:number,totalMs:number,errors:number};
let generation=0;
let http:Record<string,Aggregate>={},sql:Aggregate={count:0,totalMs:0,errors:0};
function add(target:Aggregate,start:number,error:boolean){target.count++;target.totalMs+=performance.now()-start;if(error)target.errors++;}
export function measureRequest(request:IncomingMessage,response:ServerResponse,path:string){
 if(!enabled)return;
 // Only fixed categories are retained: never URL, filters, payload, identifiers or credentials.
 const category=path.startsWith('/auth/')?'auth':path==='/rest/v1/app_memberships'?'membership':path.startsWith('/rest/v1/rpc/')?'rpc':path.startsWith('/rest/v1/')?'rest':path.startsWith('/storage/')?'storage':null;
 if(!category)return;
 const epoch=generation,start=performance.now();response.once('finish',()=>{if(epoch!==generation)return;add(http[category]??=( {count:0,totalMs:0,errors:0}),start,response.statusCode>=400);});
}
export function controlMetrics(request:IncomingMessage,response:ServerResponse,path:string){
 if(!enabled||path!=='/_performance')return false;
 if(request.headers['x-dxt-perf-control']!=='synthetic-only'){response.writeHead(403);response.end('{}');return true;}
 if(request.method==='POST'){generation++;http={};sql={count:0,totalMs:0,errors:0};}
 response.setHeader('Content-Type','application/json');response.end(JSON.stringify({http,adapterSql:sql}));return true;
}
export function measureTransaction(tx:Transaction):Transaction{
 if(!enabled)return tx;
 const epoch=generation;
 return new Proxy(tx,{get(target,key){if(key!=='query')return Reflect.get(target,key);return async(...args:Parameters<Transaction['query']>)=>{const start=performance.now();let failed=false;try{return await target.query(...args);}catch(error){failed=true;throw error;}finally{if(epoch===generation)add(sql,start,failed);}};}});
}
