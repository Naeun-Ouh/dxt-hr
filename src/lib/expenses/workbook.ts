import { inflateRawSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import { randomUUID } from 'node:crypto';
import { ACCOUNTS, PURPOSES, type ItemInput, type Preview, type Purpose } from './types';
import { itemProblems } from './validation';
const clean=(v:unknown)=>String(v??'').replace(/\s/g,'');
// Inspect ZIP central-directory sizes before decompression. No macros, embedded packages or external links.
function checkArchive(bytes:Buffer) {
 if(bytes.length<22||bytes.length>5*1024*1024||bytes.readUInt32LE(0)!==0x04034b50) throw new Error('5MB 이하의 xlsx 파일을 선택해 주세요.');
 let total=0,count=0;
 for(let i=0;i<bytes.length-46;i++) if(bytes.readUInt32LE(i)===0x02014b50) {
  const size=bytes.readUInt32LE(i+24),nameLength=bytes.readUInt16LE(i+28),extra=bytes.readUInt16LE(i+30),comment=bytes.readUInt16LE(i+32);
  const name=bytes.subarray(i+46,i+46+nameLength).toString(); total+=size;count++;
  const compressed=bytes.readUInt32LE(i+20),local=bytes.readUInt32LE(i+42),method=bytes.readUInt16LE(i+10);
  if(local+30>bytes.length||bytes.readUInt32LE(local)!==0x04034b50||![0,8].includes(method))throw new Error('지원하지 않는 Excel 압축 구조입니다.');
  const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);
  if(start+compressed>bytes.length)throw new Error('불완전한 Excel 파일입니다.');
  // Validate actual decompression too: forged ZIP size declarations must not bypass limits.
  const expanded=method===0?bytes.subarray(start,start+compressed):inflateRawSync(bytes.subarray(start,start+compressed),{maxOutputLength:20*1024*1024});
  if(expanded.length!==size)throw new Error('Excel 압축 크기가 일치하지 않습니다.');
  if(size>20*1024*1024||total>30*1024*1024||count>2000||/vbaProject|externalLinks|embeddings/i.test(name)) throw new Error('지원하지 않는 Excel 구조 또는 너무 큰 파일입니다. 공식 템플릿을 이용해 주세요.');
  i+=45+nameLength+extra+comment;
 }
 if(!count) throw new Error('Excel 파일 구조를 확인해 주세요.');
}
function scalar(cell:ExcelJS.Cell):string|number|Date {
 const v=cell.value;
 if(v==null)return '';
 if(typeof v==='string'||typeof v==='number'||v instanceof Date)return v;
 if(typeof v==='object'&&'richText' in v)return v.richText.map(x=>x.text).join('');
 throw new Error('입력 셀의 수식·링크·오류 값은 지원하지 않습니다. 값으로 붙여넣어 주세요.');
}
function dateValue(value:unknown,month:string):string {
 if(value instanceof Date)return value.toISOString().slice(0,10);
 if(typeof value==='number') { if(value>=1&&value<=31)return `${month}-${String(value).padStart(2,'0')}`;return new Date(Date.UTC(1899,11,30)+value*86400000).toISOString().slice(0,10); }
 const s=String(value??'').trim();
 if(/^\d{1,2}$/.test(s))return `${month}-${s.padStart(2,'0')}`;
 const m=/^(?:(\d{4})[.\-/])?(\d{1,2})[.\-/](\d{1,2})\.?$/.exec(s);
 return m?`${m[1]||month.slice(0,4)}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:s;
}
const numberValue=(v:unknown)=>typeof v==='number'?v:/^\d[\d,]*$/.test(String(v))?Number(String(v).replaceAll(',','')):NaN;
function purpose(value:string):Purpose { return (Object.entries(PURPOSES).find(([,label])=>clean(label)===clean(value))?.[0]||(/야근|식대/.test(value)?'OVERTIME':/회식/.test(value)?'DINING':/주유|유류/.test(value)?'FUEL':/통행|톨/.test(value)?'TOLL':'OTHER')) as Purpose; }
function base(month:string):ItemInput { return {id:randomUUID(),version:0,usage_date:`${month}-01`,expense_type:'OTHER',merchant:'',description:'',account_category:'기타',amount:0,evidence_type:'개인카드',payment_method:'PERSONAL_CARD',project_id:null,trip_context:'',notes:'',attachment_id:'',attendees:[]}; }
export async function parseWorkbook(bytes:Buffer,filename:string,month:string,vehicleDate:string,employees:{id:string;name:string;company_email:string}[]):Promise<Preview> {
 const result:Preview={filename,month,items:[],problems:[]};
 const error=(message:string,origin?:string)=>result.problems.push({severity:'ERROR',code:'SCHEMA',message,origin});
 try {
  checkArchive(bytes); const book=new ExcelJS.Workbook(); await book.xlsx.load(bytes as unknown as Parameters<typeof book.xlsx.load>[0]);
  const sheet=book.getWorksheet('지출결의서'), travel=book.getWorksheet('주유비,통행비');
  if(!sheet||!travel)throw new Error('지출결의서 및 주유비,통행비 두 시트가 필요합니다.');
  if(book.worksheets.some(s=>s.rowCount>1000||s.columnCount>50))throw new Error('시트는 1000행·50열 이내로 입력해 주세요.');
  // Normalized template metadata; a month in the legacy title is also checked when present.
  sheet.eachRow(row=>{if(clean(row.getCell(1).text)==='사용월'&&row.getCell(2).text.slice(0,7)!==month)error('파일의 사용월과 선택한 사용월이 다릅니다.');});
  for(let n=1;n<=Math.min(sheet.rowCount,12);n++) {
   const row=sheet.getRow(n);if(row.values&&row.getCell(1).text.includes('일자'))break;
   row.eachCell(cell=>{const title=/(\d{4})\s*년\s*(\d{1,2})\s*월/.exec(cell.text);if(title&&`${title[1]}-${title[2].padStart(2,'0')}`!==month)error('기존 양식의 보고 월과 선택한 사용월이 다릅니다.',`지출결의서!${n}`);});
  }
  const rowLabels=(row:ExcelJS.Row)=>{
   const labels:Record<string,number>={};
   row.eachCell((cell,col)=>{if(!cell.isMerged||cell.master.address===cell.address)labels[clean(cell.text)]=col;});
   return labels;
  };
  const vehicleHeader=(labels:Record<string,number>)=>
   Boolean(labels['횟수']&&(labels['편도주유비']||labels['편도통행비']||(labels['유형']&&labels['편도금액'])));
  const exampleRow=(row:ExcelJS.Row)=>Object.keys(rowLabels(row)).some(label=>/^(?:sample|example|샘플|예시)(?:[:：].*)?$/i.test(label));
  const inputEnd=(row:ExcelJS.Row)=>exampleRow(row)||Object.keys(rowLabels(row)).some(label=>/^(?:합계|총계|계)$/.test(label)||/^(?:작성방법|복사|붙여넣기)/.test(label));
  // Select the first input header once. Never restart at an example/repeated header.
  let vehicleHeaderRow=0;
  for(let n=1;n<=travel.rowCount;n++) {
   const row=travel.getRow(n);
   if(exampleRow(row))break;
   if(vehicleHeader(rowLabels(row))){vehicleHeaderRow=n;break;}
  }
  const labels=vehicleHeaderRow?rowLabels(travel.getRow(vehicleHeaderRow)):{};
  const legacyVehicleLayout=Boolean(vehicleHeaderRow&&!labels['유형']);
  if(!vehicleHeaderRow)error('차량 시트의 편도 금액·횟수 열을 찾을 수 없습니다.');
  else {
   let inputLimit=travel.rowCount+1;
   for(let n=vehicleHeaderRow+1;n<=travel.rowCount;n++) {
    const row=travel.getRow(n);
    if(inputEnd(row)||vehicleHeader(rowLabels(row))){inputLimit=n;break;}
   }
   if(!legacyVehicleLayout) {
    for(let n=vehicleHeaderRow+1;n<inputLimit;n++) {
     const r=travel.getRow(n);if(!r.hasValues)continue;
     try {
      const get=(key:string)=>labels[key]?scalar(r.getCell(labels[key])):'';
      if(!get('유형')&&!get('프로젝트명/출장명'))continue;
      const i=base(month),type=purpose(String(get('유형')));if(!['FUEL','TOLL'].includes(type))throw new Error('차량 상세 유형은 주유비 또는 통행비여야 합니다.');
      i.expense_type=type;i.usage_date=dateValue(get('사용일')||vehicleDate,month);i.merchant=String(get('업체명')||get('프로젝트명/출장명'));i.description=PURPOSES[type];i.account_category=ACCOUNTS[type];i.trip_context=String(get('프로젝트명/출장명'));
      i.vehicle={project_or_trip_name:i.trip_context,origin:String(get('출발지')),destination:String(get('도착지')),one_way_amount:numberValue(get('편도금액')),trip_count:numberValue(get('횟수'))};i.amount=i.vehicle.one_way_amount*i.vehicle.trip_count;i.import_origin=`주유비,통행비!${n}`;result.items.push(i);
     }catch(e){error((e as Error).message,`주유비,통행비!${n}`);}
    }
   } else {
    // Both side-by-side blocks share the same bounded real input area.
    for(const [label,col] of Object.entries(labels)) {
     if(!/^편도(주유비|통행비)$/.test(label))continue;
     const type:Purpose=label.includes('주유')?'FUEL':'TOLL';
     for(let n=vehicleHeaderRow+1;n<inputLimit;n++) {
      const r=travel.getRow(n),context=r.getCell(col-3).text.trim();
      if(!context&&!r.getCell(col-2).text&&!r.getCell(col-1).text)continue;
      try {
       const i=base(month);i.expense_type=type;i.usage_date=vehicleDate;i.merchant=context;i.description=PURPOSES[type];i.account_category=ACCOUNTS[type];i.trip_context=context;
       i.vehicle={project_or_trip_name:context,origin:String(scalar(r.getCell(col-2))),destination:String(scalar(r.getCell(col-1))),one_way_amount:numberValue(scalar(r.getCell(col))),trip_count:numberValue(scalar(r.getCell(col+1)))};
       i.amount=i.vehicle.one_way_amount*i.vehicle.trip_count;i.import_origin=`주유비,통행비!${n} (${PURPOSES[type]})`;result.items.push(i);
      }catch(e){error((e as Error).message,`주유비,통행비!${n}`);}
     }
    }
   }
  }
  let headers:Record<string,number>|undefined;
  sheet.eachRow((row,n)=>{
   const labels:Record<string,number>={};row.eachCell((cell,col)=>{if(!cell.isMerged||cell.master.address===cell.address)labels[clean(cell.text)]=col;});
   if((labels['일자']||labels['사용일'])&&labels['업체명']&&labels['합계']) {headers=labels;return;}
   if(!headers)return;
   try {
    const get=(key:string)=>headers![key]?scalar(row.getCell(headers![key])):'';
    const description=String(get('품목')),merchant=String(get('업체명'));
    if(/^(합계|총계|계)$/.test(description)||/합계|총계/.test(String(row.getCell(1).text)))return;
    if(!description&&!merchant)return;
    const type=purpose(String(get('유형')||description));
    if(['FUEL','TOLL'].includes(type)) {
     if(result.items.some(i=>i.expense_type===type&&i.vehicle))return;
     // Actual legacy rows 12–13 are prefilled examples/manual summaries, not evidence of usage.
     if(legacyVehicleLayout){result.problems.push({severity:'WARNING',code:'LEGACY_SUMMARY_IGNORED',message:'기존 양식의 차량 요약은 가져오지 않습니다. 두 번째 시트의 실제 입력 영역에 사용 내역을 입력해 주세요.',origin:`지출결의서!${n}`});return;}
    }

    const i=base(month);Object.assign(i,{usage_date:dateValue(get('일자')||get('사용일'),month),expense_type:type,merchant,description,account_category:String(get('계정과목')||ACCOUNTS[type]),amount:numberValue(get('합계')),evidence_type:String(get('증빙종류')||''),notes:String(get('비고')||''),import_origin:`지출결의서!${n}`});
    if(['FUEL','TOLL'].includes(type)){i.legacy_summary=true;if(!i.merchant)i.merchant=PURPOSES[type];}
    i.payment_method=get('결제수단')==='현금'?'CASH':i.evidence_type==='개인카드'?'PERSONAL_CARD':'CASH';
    if(type==='DINING') {
     const entries=String(get('참석자(이메일:한도사용액)')).split(';').filter(Boolean);
     i.attendees=entries.map(entry=>{const [email,amount]=entry.split(':');const matches=employees.filter(e=>e.company_email.toLowerCase()===email.trim().toLowerCase());if(matches.length!==1)throw new Error('회식 참석자는 직원 이메일과 한도 사용액으로 입력해 주세요.');return {employee_id:matches[0].id,allocated_amount:numberValue(amount)};});
    }
    result.items.push(i);
   }catch(e){error((e as Error).message,`지출결의서!${n}`);}
  });
  if(!headers)error('일자·업체명·품목·계정과목·합계·증빙종류 열을 확인해 주세요.');
  if(!result.items.length)error('등록할 경비가 없습니다.');
  if(result.items.length>500)error('한 번에 500건까지 등록할 수 있습니다.');
  for(const i of result.items){i.import_filename=filename;result.problems.push(...itemProblems(i,result.items));if(i.usage_date.slice(0,7)!==month)error('사용일이 선택한 사용월에 포함되지 않습니다.',i.import_origin);}
 }catch(e){error((e as Error).message||'Excel 파일을 읽을 수 없습니다.');}
 return result;
}
export async function templateWorkbook(month:string) {
 const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('지출결의서');
 sheet.addRow(['사용월',month]);sheet.addRow(['안내','회식 참석자는 이메일:한도사용액을 세미콜론으로 구분합니다. 증빙은 업로드 화면에서 별도 첨부합니다.']);
 sheet.addRow(['일자','업체명','품목','계정과목','합계','증빙종류','비고','유형','결제수단','참석자(이메일:한도사용액)']);
 const travel=book.addWorksheet('주유비,통행비');travel.addRow(['유형','사용일','프로젝트명/출장명','출발지','도착지','편도금액','횟수','업체명']);
 for(const s of book.worksheets){s.columns.forEach(c=>c.width=24);s.views=[{state:'frozen',ySplit:s===sheet?3:1}];}
 return Buffer.from(await book.xlsx.writeBuffer());
}
export async function exportWorkbook(rows:Record<string,string|number>[]) {
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('경비 내역');
 if(rows.length){sheet.columns=Object.keys(rows[0]).map(key=>({header:key,key,width:22}));rows.forEach(r=>sheet.addRow(r));sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:sheet.columnCount}};}
 else sheet.addRow(['제출된 경비가 없습니다.']);
 sheet.views=[{state:'frozen',ySplit:1}];return Buffer.from(await book.xlsx.writeBuffer());
}
