export type BenefitKind='WEEKEND'|'CARRYOVER';
export interface BenefitPlan {kind:BenefitKind;reference:string;source:string|null;employee_id:string;year:number;days:number;valid_from:string;valid_until:string;as_of:string;policy:string;versions:Record<string,number>;details:Record<string,string|number|null>}
export interface BenefitCandidate {key:string;kind:BenefitKind;reference:string;source:string|null;employee:string;label:string}
export interface BenefitOperation {id:string;employee_id:string;kind:BenefitKind;to_source:string;days:number;reason:string;occurred_at:string;plan:BenefitPlan}
export interface BenefitHistory extends BenefitOperation {employee:string;version:number|null;reversed:boolean}
export interface BenefitResult {error?:string;success?:string;plan?:BenefitPlan;operationId?:string}

export interface ApprovedWork {id:string;employee_id:string;work_date:string;indicative_days:number;version:number;employee:string;accountVersion:number|null}
