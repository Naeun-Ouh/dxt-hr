import { ACCOUNTS, PURPOSES, type ItemInput, type Purpose } from './types';
import { itemProblems } from './validation';
export const ACCOUNT_CATEGORIES=['복리후생비','차량유지비','여비교통비','지급수수료','운반비','소모품비','통신비','카드접대비','교육훈련비','도서인쇄비','보험료','세금과공과','수도광열비','임차료','비품','기타'];
export const GRID_COLUMNS=['usage_date','expense_type','account_category','merchant','description','amount','trip_context'] as const;
export function blankRow(month:string,id:string):ItemInput {return {id,version:0,usage_date:month+'-01',expense_type:'OTHER',account_category:'기타',merchant:'',description:'',amount:0,payment_method:'PERSONAL_CARD',evidence_type:'개인카드',project_id:null,trip_context:'',notes:'',attachment_id:'',attendees:[]};}
export function gridProblems(row:ItemInput,rows:ItemInput[],month:string) {
 const result=itemProblems(row,rows);
 if(['FUEL','TOLL'].includes(row.expense_type)&&row.legacy_summary&&!row.version)result.push({severity:'ERROR',code:'VEHICLE',message:'차량 합계만 있는 신규 행은 상세에서 편도 금액과 횟수를 입력해 주세요.'});
 if(row.usage_date.slice(0,7)!==month)result.push({severity:'ERROR',code:'DATE',message:'사용일은 선택한 귀속월이어야 합니다.'});
 if(!ACCOUNT_CATEGORIES.includes(row.account_category))result.push({severity:'ERROR',code:'ACCOUNT',message:'계정과목을 목록에서 선택해 주세요.'});
 return result;
}
export function duplicateRow(row:ItemInput,id:string):ItemInput {return {...structuredClone(row),id,version:0};}
export function importRows(rows:ItemInput[],incoming:ItemInput[],mode:'append'|'replace'):ItemInput[]{return [...(mode==='append'?rows:rows.filter(r=>r.version>0)),...incoming];}
export function parsePaste(text:string):string[][] {
 if(text.length>250000||text.includes('\0'))throw new Error('붙여넣기는 500행, 250KB 이내의 일반 텍스트로 입력해 주세요.');
 const rows=text.replace(/\r\n?/g,'\n').replace(/\n$/,'').split('\n').map(r=>r.split('\t'));
 if(rows.length>500||rows.some(r=>r.length>GRID_COLUMNS.length))throw new Error('사용일부터 출장명까지 최대 7열, 500행을 붙여넣을 수 있습니다.');
 return rows;
}
// Paste may change only unsaved rows. Persisted target => append, never overwrite.
export function pasteRows(rows:ItemInput[],text:string,targetId:string,column:number,month:string,uuid:()=>string):ItemInput[]{
 const cells=parsePaste(text);if(cells.some(r=>r.length+column>GRID_COLUMNS.length))throw new Error('붙여넣을 열 범위를 확인해 주세요.');
 const next=structuredClone(rows);let start=next.findIndex(r=>r.id===targetId);if(start<0||next[start].version>0)start=next.length;
 for(let n=0;n<cells.length;n++){
  let index=start+n;if(next[index]?.version>0)throw new Error('저장된 행은 붙여넣기로 덮어쓸 수 없습니다. 빈 행에서 다시 시도해 주세요.');
  if(!next[index]){index=next.length;next.push(blankRow(month,uuid()));}
  cells[n].forEach((value,c)=>{const key=GRID_COLUMNS[column+c];let s=value.trim();
   if(key==='usage_date'){if(/^\d{1,2}-\d{1,2}$/.test(s))s=month.slice(0,4)+'-'+s.split('-').map(v=>v.padStart(2,'0')).join('-');if(/^\d{1,2}$/.test(s))s=month+'-'+s.padStart(2,'0');}
   if(key==='amount')next[index].amount=/^\d+(,\d{3})*$/.test(s)?Number(s.replaceAll(',','')):Number.NaN;
   else if(key==='expense_type')next[index].expense_type=(Object.entries(PURPOSES).find(([v,l])=>s===v||s===l)?.[0]||s) as Purpose;
   else next[index][key]=s;
  });
 }
 if(next.length>500)throw new Error('월별 Grid는 최대 500행입니다.');return next;
}
export function changePurpose(row:ItemInput,type:Purpose):ItemInput {return {...row,expense_type:type,account_category:ACCOUNTS[type],legacy_summary:false,vehicle:['FUEL','TOLL'].includes(type)?row.vehicle||{project_or_trip_name:row.trip_context,origin:'',destination:'',one_way_amount:0,trip_count:1}:undefined,attendees:type==='DINING'?row.attendees:[]};}
export function cleanItem(row:ItemInput):ItemInput {const {id,version,usage_date,expense_type,merchant,description,account_category,amount,evidence_type,payment_method,project_id,trip_context,notes,attachment_id,attendees,vehicle,legacy_summary,import_filename,import_origin}=row;return {id,version,usage_date,expense_type,merchant,description,account_category,amount,evidence_type,payment_method,project_id,trip_context,notes,attachment_id:attachment_id||'',attendees:attendees.map(({employee_id,allocated_amount})=>({employee_id,allocated_amount})),vehicle:vehicle?{project_or_trip_name:vehicle.project_or_trip_name,origin:vehicle.origin,destination:vehicle.destination,one_way_amount:vehicle.one_way_amount,trip_count:vehicle.trip_count}:undefined,legacy_summary,import_filename,import_origin};}
