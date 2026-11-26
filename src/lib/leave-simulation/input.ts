import {validDay,type Criteria,type Evidence} from './engine';
const text=(v:unknown,max=300)=>typeof v==='string'&&v.length<=max;
const amount=(v:unknown)=>v===null||typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100000;
export function parseCriteria(raw:unknown):Criteria{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('INVALID_INPUT');
 const c=raw as Criteria;
 if(Object.keys(c).some(k=>!['asOf','year','policyReference','rounding','evidence'].includes(k))||!text(c.asOf)||!validDay(c.asOf)||!Number.isInteger(c.year)||!text(c.policyReference)||!['UNKNOWN','EXACT','CEIL_HALF','CEIL_DAY'].includes(c.rounding)||!Array.isArray(c.evidence)||c.evidence.length>500)throw new Error('INVALID_CRITERIA');
 for(const e of c.evidence){if(!e||typeof e!=='object'||Object.keys(e).some(k=>!['employeeId','employeeVersion','lastEmploymentDate','employmentSource','applicability','applicabilitySource','periods','prorationNumerator','prorationDenominator','prorationSource','reconciliationSource','priorFiscalGranted','alreadyGranted'].includes(k))||!text(e.employeeId,36)||!Number.isSafeInteger(e.employeeVersion)||!text(e.lastEmploymentDate,10)||!text(e.employmentSource)||!['UNKNOWN','APPLIES','NOT_APPLIES'].includes(e.applicability)||!text(e.applicabilitySource)||!text(e.prorationSource)||!text(e.reconciliationSource)||![e.prorationNumerator,e.prorationDenominator,e.priorFiscalGranted,e.alreadyGranted].every(amount)||!Array.isArray(e.periods)||e.periods.length>1500||e.periods.some(p=>!p||!text(p.key,100)||!text(p.source)||!['UNKNOWN','QUALIFIED','NOT_QUALIFIED'].includes(p.result)||Object.keys(p).some(k=>!['key','result','source'].includes(k))))throw new Error('INVALID_EVIDENCE');}
 return c;
}
export function safeEvidence(e:Evidence){return structuredClone(e);}
