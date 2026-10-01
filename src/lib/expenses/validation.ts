import { isUuid, validDate } from '../employees/validation';
import { ACCOUNTS, PURPOSES, type Claim, type ItemInput, type Problem, type Purpose } from './types';
export const DUPLICATE='비슷한 경비 내역이 있어요 👀 같은 날짜에 비슷한 금액의 경비가 이미 등록되어 있습니다. 중복 등록이 아닌지 한 번만 확인해주세요. 문제가 없다면 그대로 제출하셔도 됩니다.';
export function localDate(value:string) { return /^\d{4}-\d{2}-\d{2}$/.test(value)?value:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(value)); }
export function today() { return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()); }
export function monthAge(month:string,now=today()) { return (Number(now.slice(0,4))-Number(month.slice(0,4)))*12+Number(now.slice(5,7))-Number(month.slice(5,7)); }
export function deadline(month:string) { const d=new Date(`${month.slice(0,7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth()+1); d.setUTCDate(1+(7-d.getUTCDay())%7); return d.toISOString().slice(0,10); }
export function editable(c:Claim,now=today()) { return ['DRAFT','SUBMITTED'].includes(c.status)&&!c.locked_at&&(!c.payment_date||now<=c.payment_date); }
export function itemProblems(item:ItemInput, existing:ItemInput[]=[], now=today()):Problem[] {
 const out:Problem[]=[]; const add=(severity:Problem['severity'],code:string,message:string)=>out.push({severity,code,message,origin:item.import_origin});
 if(!validDate(item.usage_date)||item.usage_date>now) add('ERROR','DATE','사용일을 올바르게 입력해 주세요. 미래 사용일은 등록할 수 없습니다.');
 if(!Object.hasOwn(PURPOSES,item.expense_type)) add('ERROR','TYPE','경비 유형을 선택해 주세요.');
 for(const [key,max] of [['merchant',200],['description',500],['account_category',100]] as const) if(!item[key]?.trim()||item[key].length>max) add('ERROR','REQUIRED','사용처와 품목 등 필수 항목을 확인해 주세요.');
 if(!Number.isSafeInteger(item.amount)||item.amount<1||item.amount>1000000000) add('ERROR','AMOUNT','금액은 1원 이상 정수로 입력해 주세요.');
 if(!['PERSONAL_CARD','CASH'].includes(item.payment_method)||!['개인카드','현금영수증','간이영수증'].includes(item.evidence_type)) add('ERROR','PAYMENT','개인카드/현금 결제수단과 증빙 종류를 선택해 주세요.');
 if(item.project_id&&!isUuid(item.project_id)) add('ERROR','PROJECT','프로젝트를 목록에서 선택해 주세요.');
 if(item.notes.length>2000||item.trip_context.length>200) add('ERROR','LENGTH','비고는 2000자, 출장명은 200자 이내로 입력해 주세요.');
 if(item.expense_type==='OVERTIME'&&!item.project_id&&item.amount>10000) add('WARNING','OVERTIME','야근식대 기준 10,000원을 초과했습니다. 금액을 확인한 뒤 수정해주세요.');
 if(item.expense_type==='DINING') {
  if(!item.attendees.length||new Set(item.attendees.map(a=>a.employee_id)).size!==item.attendees.length||item.attendees.some(a=>!isUuid(a.employee_id)||!Number.isInteger(a.allocated_amount)||a.allocated_amount<1||a.allocated_amount>30000)||item.attendees.reduce((sum,a)=>sum+a.allocated_amount,0)>item.amount) add('ERROR','DINING','참석자 전원과 각 월 한도 사용액(1~30,000원)을 확인해 주세요. 합계는 경비 금액 이하여야 합니다.');
  if(item.amount>item.attendees.length*30000) add('WARNING','DINING_TOTAL','참석자 합산 월 지원 기준을 초과했습니다. 금액을 확인한 뒤 그대로 제출할 수 있습니다.');
 }
 if(['FUEL','TOLL'].includes(item.expense_type)&&item.legacy_summary) add('WARNING','LEGACY_VEHICLE_SUMMARY','기존 양식의 차량 합계를 가져왔습니다. 상세 내역이 없어 금액과 증빙을 확인해 주세요.');
 if(['FUEL','TOLL'].includes(item.expense_type)&&!item.legacy_summary) {
  const v=item.vehicle;
  if(!v||[v.origin,v.destination,v.project_or_trip_name].some(s=>!s?.trim()||s.length>200)||!Number.isInteger(v.one_way_amount)||v.one_way_amount<1||v.one_way_amount>100000000||!Number.isInteger(v.trip_count)||v.trip_count<1||v.trip_count>1000||item.amount!==v.one_way_amount*v.trip_count) add('ERROR','VEHICLE','출장명, 출발지·도착지, 편도 금액과 횟수를 확인해 주세요.');
 }
 if(existing.some(x=>x.id!==item.id&&x.usage_date===item.usage_date&&x.merchant.trim().toLowerCase()===item.merchant.trim().toLowerCase()&&x.amount===item.amount)) add('WARNING','DUPLICATE',DUPLICATE);
 if(/교육.*주차|주차.*교육/.test(item.description+' '+item.notes)) add('WARNING','PARKING','교육 주차비는 기존 정책상 지원되지 않습니다. 비용 항목을 확인해 주세요.');
 return out;
}
export function claimProblems(month:string,reason:string,now=today()):Problem[] {
 const result:Problem[]=[];
 if(monthAge(month,now)>=2&&!reason.trim()) result.push({severity:'ERROR',code:'RETRO_REASON',message:'2개월 이상 소급 청구하는 사유를 입력해 주세요.'});
 if(now>deadline(month)) result.push({severity:'WARNING',code:'LATE',message:'제출 마감이 지났습니다. 내역을 확인한 뒤 제출할 수 있습니다.'});
 return result;
}
export function fromForm(form:FormData):ItemInput {
 const text=(name:string)=>String(form.get(name)||'').trim();
 const type=text('expense_type') as Purpose;
 const vehicle=['FUEL','TOLL'].includes(type)?{project_or_trip_name:text('trip_context'),origin:text('origin'),destination:text('destination'),one_way_amount:Number(text('one_way_amount')),trip_count:Number(text('trip_count'))}:undefined;
 return {id:text('id'),version:Number(text('version')),usage_date:text('usage_date'),expense_type:type,merchant:text('merchant'),description:text('description'),account_category:ACCOUNTS[type]||'기타',amount:vehicle?vehicle.one_way_amount*vehicle.trip_count:Number(text('amount')),payment_method:text('payment_method'),evidence_type:text('evidence_type'),project_id:text('project_id')||null,trip_context:text('trip_context'),notes:text('notes'),attachment_id:text('attachment_id'),vehicle,attendees:type==='DINING'?form.getAll('attendees').map(id=>({employee_id:String(id),allocated_amount:Number(text(`allocation_${id}`))})):[]};
}
