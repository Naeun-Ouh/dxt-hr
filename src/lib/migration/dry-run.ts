import { createHash } from 'node:crypto';
import { assetInput } from '../assets/validation';
import { isUuid, validDate } from '../employees/validation';
import { itemProblems } from '../expenses/validation';
import { parseWorkbook } from '../expenses/workbook';
import type { ItemInput } from '../expenses/types';

/** Offline review artifacts only: deliberately no database/storage/auth client. */
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
function canonical(value: unknown): string {
 if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
 if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
 return JSON.stringify(value) ?? 'null';
}
export type SourceRow = { key:string; sheet:string; row:number; employeeKey?:string; asset?:Record<string,string>; expense?:ItemInput; history?:{employeeKey:string;start:string;end:string|null}[] };
export type Mapping = {
 version:string; reviewedSourceSha256:string; asOf:string;
 employees:Record<string,string>;
 expected:{records:number;expenseAmount:number;assets:number;historyPeriods:number};
 exclusions:{key:string;sheet:string;row:number;reason:'SAMPLE'|'SUMMARY'|'OUT_OF_SCOPE';amount:number}[];
 workbook?:{month:string;vehicleDate:string;rows:Record<string,{key:string;employeeKey:string}>;attendees:{key:string;email:string}[]};
};
export type Diagnostic = {severity:'ERROR'|'WARNING';code:string;rowKey?:string};
const fail=()=>{throw new Error('INVALID_INPUT');};
function object(v:unknown): v is Record<string,unknown> { return !!v&&typeof v==='object'&&!Array.isArray(v); }
function string(v:unknown,max=200):v is string {return typeof v==='string'&&v.trim().length>0&&v.length<=max;}
function integer(v:unknown):v is number {return Number.isSafeInteger(v)&&Number(v)>=0;}
function location(v:Record<string,unknown>) {return string(v.key)&&string(v.sheet)&&integer(v.row)&&v.row>0;}
function keys(v:Record<string,unknown>,allowed:string[]) {if(Object.keys(v).some(k=>!allowed.includes(k)))fail();}
export function readMapping(value:unknown):Mapping {
 if(!object(value))return fail();
 keys(value,['version','reviewedSourceSha256','asOf','employees','expected','exclusions','workbook']);
 if(!string(value.version,100)||typeof value.reviewedSourceSha256!=='string'||!/^[a-f0-9]{64}$/.test(value.reviewedSourceSha256)||typeof value.asOf!=='string'||!validDate(value.asOf)||!object(value.employees)||!object(value.expected)||!Array.isArray(value.exclusions))return fail();
 if(Object.entries(value.employees).some(([k,v])=>!string(k)||typeof v!=='string'||!isUuid(v)))return fail();
 const expected=value.expected;keys(expected,['records','expenseAmount','assets','historyPeriods']);
 if(['records','expenseAmount','assets','historyPeriods'].some(k=>!integer(expected[k]))||Number(value.expected.records)>10000)return fail();
 for(const e of value.exclusions){if(!object(e)||!location(e)||!['SAMPLE','SUMMARY','OUT_OF_SCOPE'].includes(String(e.reason))||!integer(e.amount))return fail();keys(e,['key','sheet','row','reason','amount']);}
 if(value.workbook!==undefined){const w=value.workbook;if(!object(w)||!string(w.month)||!validDate(`${w.month}-01`)||typeof w.vehicleDate!=='string'||!validDate(w.vehicleDate)||!w.vehicleDate.startsWith(w.month+'-')||!object(w.rows)||!Array.isArray(w.attendees))return fail();keys(w,['month','vehicleDate','rows','attendees']);for(const r of Object.values(w.rows)){if(!object(r)||!string(r.key)||!string(r.employeeKey))return fail();keys(r,['key','employeeKey']);}for(const a of w.attendees){if(!object(a)||!string(a.key)||!string(a.email))return fail();keys(a,['key','email']);}}
 return value as Mapping;
}
export function readRows(value:unknown):SourceRow[] {
 if(!Array.isArray(value)||value.length>10000)return fail();
 for(const r of value){if(!object(r)||!location(r)||Boolean(r.asset)===Boolean(r.expense))return fail();keys(r,['key','sheet','row','employeeKey','asset','expense','history']);if(r.employeeKey!==undefined&&!string(r.employeeKey))return fail();if(r.asset&&!object(r.asset))return fail();if(r.expense&&!object(r.expense))return fail();if(r.history!==undefined&&(!Array.isArray(r.history)||r.history.some(h=>!object(h)||!string(h.employeeKey)||typeof h.start!=='string'||(h.end!==null&&typeof h.end!=='string'))))return fail();}
 return value as SourceRow[];
}
export async function workbookRows(bytes:Buffer,mapping:Mapping) {
 const w=mapping.workbook;if(!w)return fail();
 const employees=w.attendees.map(a=>({id:mapping.employees[a.key]??'',name:'',company_email:a.email}));
 if(employees.some(e=>!isUuid(e.id)))return fail();
 const parsed=await parseWorkbook(bytes,'source.xlsx',w.month,w.vehicleDate,employees);
 const diagnostics:Diagnostic[]=[];
 // Revalidate date/duplicate business rules below with the pinned asOf date and deterministic IDs.
 const recomputedCodes=new Set(['DATE','TYPE','CARD','REQUIRED','AMOUNT','PAYMENT','PROJECT','LENGTH','OVERTIME','DINING','DINING_TOTAL','LEGACY_VEHICLE_SUMMARY','VEHICLE','DUPLICATE','PARKING']);
 for(const p of parsed.problems)if(!recomputedCodes.has(p.code)||p.code==='CARD')diagnostics.push({severity:p.severity,code:`WORKBOOK_${p.code}`,rowKey:p.origin?sha256(p.origin):undefined});
 const origins=new Set<string>();
 const rows=parsed.items.map(i=>{
  const origin=i.import_origin??'';origins.add(origin);const m=w.rows[origin];
  if(!m)diagnostics.push({severity:'ERROR',code:'UNMAPPED_WORKBOOK_ROW',rowKey:sha256(origin)});
  const match=/^(.*)!(\d+)(?: .*)?$/.exec(origin);if(!match)fail();
  return {key:m?.key??`unmapped:${origin}`,sheet:match![1],row:Number(match![2]),employeeKey:m?.employeeKey,expense:{...i,id:sha256(origin),import_filename:undefined}};
 });
 for(const origin of Object.keys(w.rows))if(!origins.has(origin))diagnostics.push({severity:'ERROR',code:'MISSING_WORKBOOK_ROW',rowKey:sha256(origin)});
 return {rows,diagnostics};
}
export function dryRun(bytes:Buffer,rows:SourceRow[],mapping:Mapping,initial:Diagnostic[]=[]) {
 const sourceHash=sha256(bytes),mappingHash=sha256(canonical(mapping));
 const diagnostics:Diagnostic[]=[...initial];
 const add=(code:string,rowKey?:string,severity:Diagnostic['severity']='ERROR')=>diagnostics.push({code,rowKey,severity});
 if(sourceHash!==mapping.reviewedSourceSha256)add('SOURCE_HASH_MISMATCH');
 const seen=new Set<string>(),serials=new Map<string,string[]>(),expenseKeys=new Map<string,string[]>();
 const prepared=rows.map(r=>{
  const key=sha256(canonical([sourceHash,r.key]));
  const provenance={sheet:r.sheet,row:r.row};
  if(seen.has(r.key))add('DUPLICATE_KEY',key);seen.add(r.key);
  const employee=r.employeeKey&&Object.hasOwn(mapping.employees,r.employeeKey)?mapping.employees[r.employeeKey]:null;
  if(r.employeeKey&&!employee)add('EMPLOYEE_MAPPING',key);
  let amount=0,historyPeriods=0,serialHash:string|undefined;
  if(r.asset){
   const a=r.asset;
   if(Object.keys(a).some(k=>!['type','status','manufacturer','model','serial_number'].includes(k)))add('ASSET_FIELDS',key);
   try{const f=new FormData();for(const [k,v] of Object.entries(a)){if(typeof v!=='string')throw Error();f.set(k,v);}if(employee)f.set('current_holder_id',employee);assetInput(f);}catch{add('ASSET_INVALID',key);}
   const sn=String(a.serial_number??'').trim().toUpperCase();serialHash=sha256(sn);serials.set(sn,[...(serials.get(sn)??[]),key]);
   const history=r.history??[];historyPeriods=history.length;
   let end:string|null|undefined;let active=0;
   for(const h of history){
    if(!Object.hasOwn(mapping.employees,h.employeeKey)||!validDate(h.start)||h.start>mapping.asOf||(h.end!==null&&(!validDate(h.end)||h.end<h.start||h.end>mapping.asOf))||(end!==undefined&&(end===null||h.start<end)))add('HISTORY_INVALID',key);
    if(h.end===null){active++;if(mapping.employees[h.employeeKey]!==employee)add('HISTORY_HOLDER_MISMATCH',key);}end=h.end;
   }
   if(active>1)add('MULTIPLE_ACTIVE_HOLDERS',key);
   if(employee&&!history.length)add('HISTORY_NOT_PROVIDED',key,'WARNING');
   if(history.length&&Boolean(employee)!==Boolean(active))add('HISTORY_HOLDER_MISMATCH',key);
  }else if(r.expense){
   if(!employee)add('EMPLOYEE_MAPPING',key);
   const i=r.expense;
   if(employee&&typeof i.merchant==='string'){const duplicate=sha256(canonical([employee,i.usage_date,i.merchant.trim().toLowerCase(),i.amount]));expenseKeys.set(duplicate,[...(expenseKeys.get(duplicate)??[]),key]);}
   try{for(const p of itemProblems({...i,id:key},[],mapping.asOf))add(p.code,key,p.severity);}catch{add('EXPENSE_INVALID',key);}
   if(integer(i.amount))amount=i.amount;else add('AMOUNT',key);
   // No implicit identity resolution for attendee/project/card foreign references.
   if(i.project_id||i.payment_card_id||i.attachment_id)add('UNREVIEWED_FOREIGN_REFERENCE',key);
   if(!Array.isArray(i.attendees)||i.attendees.some(a=>!Object.values(mapping.employees).includes(a.employee_id)))add('ATTENDEE_MAPPING',key);
  }
  return {key,provenance,kind:r.asset?'ASSET':'EXPENSE',contentHash:sha256(canonical(r)),serialHash,amount,historyPeriods};
 });
 for(const found of expenseKeys.values())if(found.length>1)for(const key of found)add('DUPLICATE',key,'WARNING');
 for(const found of serials.values())if(found.length>1)for(const key of found)add('DUPLICATE_SERIAL',key);
 for(const e of mapping.exclusions){if(seen.has(e.key))add('EXCLUSION_KEY_COLLISION',sha256(canonical([sourceHash,e.key])));seen.add(e.key);}
 const totals={records:rows.length+mapping.exclusions.length,assets:rows.filter(r=>r.asset).length,expenseAmount:prepared.reduce((s,r)=>s+r.amount,0)+mapping.exclusions.reduce((s,r)=>s+r.amount,0),historyPeriods:prepared.reduce((s,r)=>s+r.historyPeriods,0)};
 for(const field of ['records','assets','expenseAmount','historyPeriods'] as const)if(totals[field]!==mapping.expected[field])add(`RECONCILIATION_${field.toUpperCase()}`);
 if(!Number.isSafeInteger(totals.expenseAmount))add('AMOUNT_OVERFLOW');
 const rejected=new Set(diagnostics.filter(d=>d.severity==='ERROR'&&d.rowKey).map(d=>d.rowKey));
 const records=prepared.map(r=>({...r,decision:rejected.has(r.key)?'REJECTED':'REVIEW_CANDIDATE'}));
 const uniqueDiagnostics=[...new Map(diagnostics.map(d=>[canonical(d),d])).values()].sort((a,b)=>canonical(a).localeCompare(canonical(b),'en'));
 return {format:'dxt-legacy-dry-run-v1',mode:'DRY_RUN',applySupported:false,sourceSha256:sourceHash,mappingSha256:mappingHash,mappingVersion:mapping.version,asOf:mapping.asOf,
  reviewStatus:uniqueDiagnostics.some(d=>d.severity==='ERROR')?'BLOCKED':'READY_FOR_REVIEW',
  totals,expected:mapping.expected,counts:{candidates:records.filter(r=>r.decision==='REVIEW_CANDIDATE').length,rejected:records.filter(r=>r.decision==='REJECTED').length,excluded:mapping.exclusions.length},
  records,exclusions:mapping.exclusions.map(e=>({key:sha256(canonical([sourceHash,e.key])),sheet:e.sheet,row:e.row,reason:e.reason,amount:e.amount})),diagnostics:uniqueDiagnostics};
}
