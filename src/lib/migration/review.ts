import { dryRun, readMapping, readRows, workbookRows } from './dry-run';
export const SOURCE_LIMIT=3*1024*1024;
export const MAPPING_LIMIT=512*1024;
export const BODY_LIMIT=4*1024*1024;
export type ReviewReport=ReturnType<typeof dryRun>;
/** No persistence: the caller must authorize before reading the request. */
export async function previewMigration(source:Buffer,filename:string,mappingText:string,employeeIds:ReadonlySet<string>):Promise<ReviewReport>{
 if(source.length===0||source.length>SOURCE_LIMIT||Buffer.byteLength(mappingText)>MAPPING_LIMIT)throw new Error('INVALID_INPUT');
 const mapping=readMapping(JSON.parse(mappingText));
 if(Object.values(mapping.employees).some(id=>!employeeIds.has(id)))throw new Error('INVALID_INPUT');
 if(filename.toLowerCase().endsWith('.xlsx')){const parsed=await workbookRows(source,mapping);return dryRun(source,parsed.rows,mapping,parsed.diagnostics);}
 if(!filename.toLowerCase().endsWith('.json'))throw new Error('INVALID_INPUT');
 return dryRun(source,readRows(JSON.parse(source.toString('utf8'))),mapping);
}
export async function boundedBody(request:Request):Promise<Uint8Array>{
 if(Number(request.headers.get('content-length'))>BODY_LIMIT)throw new Error('INVALID_INPUT');
 const reader=request.body?.getReader();if(!reader)throw new Error('INVALID_INPUT');
 const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>BODY_LIMIT){await reader.cancel();throw new Error('INVALID_INPUT');}chunks.push(next.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
