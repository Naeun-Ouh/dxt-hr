import {validDate,ValidationError,isUuid} from '../employees/validation';
import {UNITS,type Unit} from './types';
export function workingDays(start:string,end:string,unit:string):number{
 if(!validDate(start)||!validDate(end)||end<start||start.slice(0,4)!==end.slice(0,4)||!Object.hasOwn(UNITS,unit)||(unit!=='FULL_DAY'&&start!==end))return 0;
 let n=0;for(let d=Date.parse(start);d<=Date.parse(end);d+=86400000){const day=new Date(d).getUTCDay();if(day!==0&&day!==6)n++;}
 return unit==='FULL_DAY'?n:n?0.5:0;
}
export function leaveInput(form:FormData,today:string){
 const start=String(form.get('start_date')||''),end=String(form.get('end_date')||''),unit=String(form.get('unit')||'');
 const reason=String(form.get('reason')||'').trim(),past=String(form.get('past_reason')||'').trim();
 const fields:Record<string,string>={};
 if(!workingDays(start,end,unit))fields.start_date='같은 연도의 평일을 선택해 주세요. 반차는 하루만 신청할 수 있습니다.';
 if(start<today&&!past)fields.past_reason='미리 신청하지 못한 사유를 입력해 주세요.';
 if(reason.length>2000||past.length>2000)fields.reason='사유는 2,000자 이내로 입력해 주세요.';
 if(Object.keys(fields).length)throw new ValidationError(fields);
 return {p_start:start,p_end:end,p_unit:unit as Unit,p_reason:reason,p_past_reason:past};
}
export function decisionItems(values:FormDataEntryValue[]){
 if(!values.length||values.length>100)throw new ValidationError({selection:'처리할 신청을 1~100건 선택해 주세요.'});
 const items=values.map(value=>{const [id,version]=String(value).split(':');if(!isUuid(id)||!/^\d{1,9}$/.test(version)||Number(version)<1)throw new ValidationError({selection:'선택 항목을 확인하고 새로고침해 주세요.'});return {id,version:Number(version)};});
 if(new Set(items.map(i=>i.id)).size!==items.length)throw new ValidationError({selection:'중복 선택을 확인해 주세요.'});
 return items;
}
