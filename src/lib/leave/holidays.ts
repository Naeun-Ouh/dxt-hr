import 'server-only';
import {requireCapability} from '@/lib/auth/access';
import {readRows} from '@/lib/operations/data';
export interface Holiday {id:string;day:string;name:string;kind:'STATUTORY'|'SUBSTITUTE'|'COMPANY';active:boolean;version:number;year:number}
export interface HolidayYear {year:number;version:number;source:string;source_version:string;verified_at:string}
export async function holidayData(){await requireCapability('EMPLOYEE_ACCESS');const [years,holidays]=await Promise.all([readRows<HolidayYear>('holiday_year','year,version,source,source_version,verified_at',{},'year'),readRows<Holiday>('holiday_calendar','id,day,name,kind,active,version,year',{},'day')]);return {years,holidays};}
