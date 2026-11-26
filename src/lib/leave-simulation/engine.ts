// Pure, write-free review model. Unknown evidence is never equivalent to zero.
export type Person={id:string;name:string;department:string;hire_date:string;employment_status:string;version:number};
export type Entry={id:string;employee_id:string;year:number;bucket:string;event_type:string;amount_delta:number;source_id:string;occurred_at:string};
export type Period={key:string;start:string;end:string;grantDate:string;kind:'MONTH'|'YEAR'|'FISCAL'|'LOW_MONTH';years:number};
export type Proof={key:string;result:'UNKNOWN'|'QUALIFIED'|'NOT_QUALIFIED';source:string};
export type Evidence={employeeId:string;employeeVersion:number;lastEmploymentDate:string;employmentSource:string;applicability:'UNKNOWN'|'APPLIES'|'NOT_APPLIES';applicabilitySource:string;periods:Proof[];prorationNumerator:number|null;prorationDenominator:number|null;prorationSource:string;reconciliationSource:string;priorFiscalGranted:number|null;alreadyGranted:number|null};
export type Criteria={asOf:string;year:number;policyReference:string;rounding:'UNKNOWN'|'EXACT'|'CEIL_HALF'|'CEIL_DAY';evidence:Evidence[]};
export type Row={employee:Person;tenure:number;periods:Period[];proofs:Proof[];annualBase:number|null;addition:number|null;candidate:number|null;newDays:number|null;statutoryTotal:number|null;fiscalTotal:number|null;difference:number|null;recorded:{granted:number;used:number;remaining:number;substitute:number;carryover:number;targetAdjustments:number};blockers:string[];excluded:boolean};
export type Report={evidenceThrough:string;asOf:string;year:number;rows:Row[];applyAuthorized:false;policyReference:string;rounding:Criteria['rounding'];inputSnapshot:Criteria;warnings:string[]};
const iso=(d:Date)=>d.toISOString().slice(0,10);
export function validDay(s:string){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&Number(s.slice(0,4))>=1900&&Number(s.slice(0,4))<=2100&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&iso(new Date(s+'T00:00:00Z'))===s;}
export const monthAfter=(s:string)=>plus(s,1);
const before=(s:string)=>iso(new Date(Date.parse(s+'T00:00:00Z')-86400000));
function plus(s:string,months:number){const d=new Date(s+'T00:00:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return iso(d);}
export function tenure(hire:string,asOf:string){let y=Number(asOf.slice(0,4))-Number(hire.slice(0,4));if(plus(hire,y*12)>asOf)y--;return Math.max(0,y);}
export const annualDays=(years:number)=>Math.min(25,15+Math.max(0,Math.floor((years-1)/2)));
export function requiredPeriods(hire:string,asOf:string,year:number):Period[]{
 if(!validDay(hire)||!validDay(asOf)||hire>asOf)return [];
 const periods:Period[]=[];
 for(let m=1;m<=11;m++){const grantDate=plus(hire,m);if(grantDate>asOf)break;const start=plus(hire,m-1),end=before(grantDate);periods.push({key:`MONTH:${start}:${end}`,start,end,grantDate,kind:'MONTH',years:0});}
 for(let y=1;y<=Math.min(100,tenure(hire,asOf));y++){const grantDate=plus(hire,y*12),start=plus(hire,(y-1)*12),end=before(grantDate);periods.push({key:`YEAR:${start}:${end}`,start,end,grantDate,kind:'YEAR',years:y});}
 const start=hire>`${year-1}-01-01`?hire:`${year-1}-01-01`,end=`${year-1}-12-31`;
 if(start<=end)periods.push({key:`FISCAL:${start}:${end}`,start,end,grantDate:`${year}-01-01`,kind:'FISCAL',years:tenure(hire,`${year}-01-01`)});
 return periods;
}
export function blankEvidence(p:Person):Evidence{return {employeeId:p.id,employeeVersion:p.version,lastEmploymentDate:'',employmentSource:'',applicability:'UNKNOWN',applicabilitySource:'',periods:[],prorationNumerator:null,prorationDenominator:null,prorationSource:'',reconciliationSource:'',priorFiscalGranted:null,alreadyGranted:null};}
const round=(v:number,r:Criteria['rounding'])=>r==='CEIL_HALF'?Math.ceil(v*2)/2:r==='CEIL_DAY'?Math.ceil(v):v;
export function simulate(people:Person[],ledger:Entry[],criteria:Criteria,evidenceThrough=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())):Report{
 if(!validDay(evidenceThrough)||!validDay(criteria.asOf)||!Number.isInteger(criteria.year)||criteria.year<2000||criteria.year>2100||criteria.asOf.slice(0,4)!==String(criteria.year)||criteria.evidence.length>500||new Set(criteria.evidence.map(e=>e.employeeId)).size!==criteria.evidence.length)throw new Error('INVALID_CRITERIA');
 if(new Set(people.map(p=>p.id)).size!==people.length||criteria.evidence.some(e=>!people.some(p=>p.id===e.employeeId)))throw new Error('INVALID_EMPLOYEE');
 const rows=people.map(employee=>{
  const e=criteria.evidence.find(e=>e.employeeId===employee.id)||blankEvidence(employee),blockers:string[]=[];
  if(criteria.asOf>evidenceThrough)blockers.push('미래 기준일 전망입니다. 실제 확인일까지 완료되지 않은 출근은 확정할 수 없습니다.');
  if(e.employeeVersion!==employee.version)blockers.push('직원 정보가 변경되었습니다. 새로고침 후 근거를 다시 확인하세요.');
  const last=e.lastEmploymentDate;let end=criteria.asOf;
  if(employee.employment_status!=='ACTIVE'&&!last)blockers.push('퇴사자의 최종 재직일 근거가 없습니다.');
  if(last){if(!validDay(last)||last<employee.hire_date||!e.employmentSource.trim())blockers.push('최종 재직일과 원본 근거를 확인하세요.');else if(last<end)end=last;}
  const validHire=validDay(employee.hire_date),excluded=validHire&&employee.hire_date>criteria.asOf;
  if(!validHire)blockers.push('입사일이 유효하지 않습니다.');
  if(e.applicability==='UNKNOWN'||!e.applicabilitySource.trim())blockers.push('법 적용 대상·소정근로시간 근거가 미확정입니다.');
  if(e.applicability==='NOT_APPLIES')blockers.push('일반 법정 산정 대상이 아닙니다. 별도 정책 검토가 필요합니다.');
  if(employee.hire_date.endsWith('-02-29'))blockers.push('윤일 입사 기산일의 확정 근거가 필요합니다.');
  const periods=validHire?requiredPeriods(employee.hire_date,end,criteria.year):[],proofs=e.periods;
  if(new Set(proofs.map(p=>p.key)).size!==proofs.length)blockers.push('중복되거나 기준일과 맞지 않는 출근 근거가 있습니다.');
  const qualifies=(p:Period)=>{const proof=proofs.find(q=>q.key===p.key);return proof&&proof.source.trim()&&proof.result!=='UNKNOWN'&&p.end<criteria.asOf&&p.end<evidenceThrough?proof.result:null;};
  const monthlyFallback=(p:Period)=>{let total:number|null=0;for(let m=0;m<12;m++){const start=plus(p.start,m),grantDate=plus(p.start,m+1),end=before(grantDate);if(end>p.end)break;const child:Period={key:`LOW_MONTH:${p.key}:${start}`,start,end,grantDate,kind:'LOW_MONTH',years:0};if(!periods.some(q=>q.key===child.key))periods.push(child);const q=qualifies(child);if(!q)total=null;else if(total!==null&&q==='QUALIFIED')total++;}return total;};
  let statutoryTotal:number|null=0;
  for(const p of periods.filter(p=>p.kind==='MONTH'||p.kind==='YEAR')){
   const q=qualifies(p);let contribution:number|null=null;
   if(!q)blockers.push(`${p.start}~${p.end} ${p.kind==='MONTH'?'개근':'출근율'} 근거 미확정`);
   else if(p.kind==='MONTH')contribution=q==='QUALIFIED'?1:0;
   else if(q==='QUALIFIED')contribution=annualDays(p.years);
   else{contribution=monthlyFallback(p);if(contribution===null)blockers.push(`${p.start}~${p.end} 80% 미만: 해당 기간 월별 개근 근거 미확정`);}
   statutoryTotal=statutoryTotal===null||contribution===null?null:statutoryTotal+contribution;
  }
  const f=periods.find(p=>p.kind==='FISCAL');let annualBase:number|null=null,addition:number|null=null,candidate:number|null=null;
  if(!excluded&&f){const q=qualifies(f);if(!q)blockers.push('직전 회계연도 출근율 근거 미확정');else if(q==='NOT_QUALIFIED'){const months=monthlyFallback(f);if(months===null)blockers.push('회계연도 출근율 80% 미만: 월별 개근 근거 미확정');else{annualBase=months;addition=0;candidate=months;}}else if(employee.hire_date>`${criteria.year-1}-01-01`){
    if(e.prorationNumerator===null||e.prorationDenominator===null||e.prorationDenominator<=0||e.prorationNumerator<0||e.prorationNumerator>e.prorationDenominator||!e.prorationSource.trim()||criteria.rounding==='UNKNOWN')blockers.push('중도입사 비례 분자·분모·반올림·원본 근거 미확정');
    else{annualBase=round(15*e.prorationNumerator/e.prorationDenominator,criteria.rounding);addition=0;candidate=annualBase;}
   }else{annualBase=15;addition=annualDays(f.years)-15;candidate=annualBase+addition;}}
  else if(!excluded&&validHire&&employee.hire_date>=`${criteria.year}-01-01`){annualBase=0;addition=0;candidate=0;}
  const monthlyCurrent=periods.filter(p=>p.kind==='MONTH'&&p.grantDate.startsWith(String(criteria.year)));
  for(const p of monthlyCurrent){const q=qualifies(p);if(!q)candidate=null;else if(candidate!==null&&q==='QUALIFIED')candidate++;}
  if(last&&last<`${criteria.year}-01-01`){candidate=0;annualBase=0;addition=0;}
  if(!criteria.policyReference.trim())blockers.push('회계연도 산정·근속 가산 적용 정책의 승인 근거 미확정');
  if(proofs.some(p=>!periods.some(q=>q.key===p.key)))blockers.push('현재 기준에 포함되지 않는 출근 근거가 있습니다.');
  const entries=ledger.filter(l=>l.employee_id===employee.id&&new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(l.occurred_at))<=criteria.asOf),prior=entries.filter(l=>l.year===criteria.year-1),sum=(items:Entry[])=>items.reduce((n,l)=>n+Number(l.amount_delta),0);
  const annual=prior.filter(l=>l.bucket==='ANNUAL');
  const recorded={granted:sum(annual.filter(l=>l.event_type==='ADJUSTMENT')),used:-sum(annual.filter(l=>l.event_type!=='ADJUSTMENT')),remaining:sum(annual),substitute:sum(prior.filter(l=>l.bucket==='SUBSTITUTE')),carryover:sum(prior.filter(l=>l.bucket==='CARRYOVER')),targetAdjustments:sum(entries.filter(l=>l.year===criteria.year&&l.bucket==='ANNUAL'&&l.event_type==='ADJUSTMENT'))};
  if(!e.reconciliationSource.trim()||e.priorFiscalGranted===null||e.alreadyGranted===null)blockers.push('기존 부여·이관 원본 대사 근거 미확정: 중복 부여 검증 불가');
  const priorRecordedGrants=sum(entries.filter(l=>l.year<criteria.year&&l.bucket==='ANNUAL'&&l.event_type==='ADJUSTMENT'));
  if(e.priorFiscalGranted!==null&&e.priorFiscalGranted!==priorRecordedGrants)blockers.push('이전 누적 부여와 원장 조정 합계가 다릅니다. 이관 원본을 대사하세요.');
  if(e.alreadyGranted!==null&&e.alreadyGranted!==recorded.targetAdjustments)blockers.push('대상연도 기존 부여와 원장 조정 합계가 다릅니다.');
  if(e.alreadyGranted!==null&&candidate!==null&&e.alreadyGranted>candidate)blockers.push('기존 부여가 산정 후보보다 많습니다. 자동 회수하지 않습니다.');
  if(!validHire||e.applicability!=='APPLIES'||employee.hire_date.endsWith('-02-29')||employee.employment_status!=='ACTIVE'&&!last){candidate=null;statutoryTotal=null;}
  if(Number(employee.hire_date.slice(8))>28&&periods.some(p=>p.kind==='MONTH')){blockers.push('월말 입사의 월별 기산일 정책을 확인해야 합니다.');statutoryTotal=null;if(monthlyCurrent.length)candidate=null;}
  if(employee.hire_date<'2017-05-30'){blockers.push('과거 법령 전환 전 입사: 누적 발생분은 당시 원본·적용 규정 검토가 필요합니다.');statutoryTotal=null;}
  const fiscalTotal=e.priorFiscalGranted!==null&&candidate!==null?e.priorFiscalGranted+candidate:null;
  const difference=statutoryTotal!==null&&fiscalTotal!==null?fiscalTotal-statutoryTotal:null;
  if(difference!==null&&difference<0)blockers.push('입사일 기준 누적 발생분보다 부족합니다. 추가 검토가 필요합니다.');
  return {employee,tenure:validHire?tenure(employee.hire_date,end):0,periods,proofs,annualBase,addition,candidate,newDays:!blockers.length&&candidate!==null&&e.alreadyGranted!==null&&e.reconciliationSource.trim()?Math.max(0,candidate-e.alreadyGranted):null,statutoryTotal,fiscalTotal,difference,recorded,blockers:[...new Set(blockers)],excluded};
 });
 return {evidenceThrough,asOf:criteria.asOf,year:criteria.year,rows,applyAuthorized:false,policyReference:criteria.policyReference,rounding:criteria.rounding,inputSnapshot:structuredClone(criteria),warnings:['읽기 전용 시뮬레이션이며 실제 지급·승인·급여 정산이 아닙니다.','출근 인정 기간은 원본으로 확인해야 합니다. 단순 근무일 달력으로 출근율을 추정하지 않습니다.','이월·대휴 원장 잔액은 신규 지급 예정액이 아닙니다. 확인된 별도 절차로 검토하세요.','기존 조정 합계는 Wanted Space 원본 부여량을 증명하지 않습니다. 원본 없는 20건을 생성하지 않습니다.']};
}
