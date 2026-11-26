import 'server-only';
import {requireCapability} from '../auth/access';
import {employeeClient} from '../employees/data';
import {readRows} from '../operations/data';
import {CASE_COLUMNS,EVIDENCE_COLUMNS,REVIEW_COLUMNS,type CarryoverCase,type CarryoverEvidence,type CarryoverReview} from './types';
export async function carryoverWorkspace(admin=false){await requireCapability(admin?'LEAVE_MANAGE':'EMPLOYEE_ACCESS');const db=await employeeClient();const [{data:owner,error},{data:today,error:dateError}]=await Promise.all([db.rpc('current_employee_id'),db.rpc('leave_today')]);if(error||dateError)throw new Error('이월 검토 정보를 불러오지 못했습니다.');
 const cases=admin?await readRows<CarryoverCase>('leave_carryover_case',CASE_COLUMNS):owner?await readRows<CarryoverCase>('leave_carryover_case',CASE_COLUMNS,{employee_id:owner}):[];
 const [evidence,reviews,people]=await Promise.all([admin?readRows<CarryoverEvidence>('leave_carryover_evidence',EVIDENCE_COLUMNS):Promise.resolve([]),admin?readRows<CarryoverReview>('leave_carryover_review_event',REVIEW_COLUMNS):Promise.resolve([]),admin?readRows<{id:string;name:string;company_email:string}>('employee','id,name,company_email'):Promise.resolve([])]);return {cases,evidence,reviews,people,today:String(today)};
}
