import type {ItemInput} from './types';
export const ROUTE_COLUMNS='id,employee_id,origin,destination,alias,fuel_amount,toll_amount,active,version';
export type RouteValues={origin:string;destination:string;alias:string;fuel_amount:number|null;toll_amount:number|null;active:boolean};
export type RoutePreset=RouteValues&{id:string;employee_id:string;version:number};
export type ExpenseCategory='ALL'|'GENERAL'|'FUEL'|'TOLL';
export const EXPENSE_TABS={ALL:'전체',GENERAL:'일반 경비',FUEL:'유류비',TOLL:'통행료'} as const;
export function inCategory(row:ItemInput,category:ExpenseCategory){return category==='ALL'||(category==='GENERAL'?!['FUEL','TOLL'].includes(row.expense_type):row.expense_type===category);}
export function routeValues(value:unknown):RouteValues{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['origin','destination','alias','fuel_amount','toll_amount','active'].includes(k)))throw new Error('경로 입력 형식을 확인해 주세요.');
 const v=value as RouteValues;
 if(typeof v.origin!=='string'||!v.origin.trim()||v.origin.trim().length>200||typeof v.destination!=='string'||!v.destination.trim()||v.destination.trim().length>200||typeof v.alias!=='string'||v.alias.length>100||typeof v.active!=='boolean'||[v.fuel_amount,v.toll_amount].some(n=>n!==null&&(!Number.isSafeInteger(n)||n<1||n>100000000)))throw new Error('출발지·도착지와 선택한 편도 금액을 확인해 주세요.');
 return {...v,origin:v.origin.trim(),destination:v.destination.trim(),alias:v.alias.trim()};
}
export function applyRoute(row:ItemInput,preset:RoutePreset):ItemInput{
 if(!['FUEL','TOLL'].includes(row.expense_type)||!preset.active)throw new Error('사용 가능한 이동 경로를 선택해 주세요.');
 const vehicle={project_or_trip_name:row.trip_context,trip_count:1,one_way_amount:0,...row.vehicle,origin:preset.origin,destination:preset.destination};
 const amount=row.expense_type==='FUEL'?preset.fuel_amount:preset.toll_amount;
 if(amount!==null)vehicle.one_way_amount=amount;
 return {...row,vehicle,amount:vehicle.one_way_amount*vehicle.trip_count,legacy_summary:false};
}
