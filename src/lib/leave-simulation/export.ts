import ExcelJS from 'exceljs';
import type {Report} from './engine';
export async function exportSimulation(report:Report,digest:string){
 const book=new ExcelJS.Workbook();const info=book.addWorksheet('검증 기준');
 info.addRows([['상태','DRY RUN · 실제 반영/승인 아님'],['전망 기준일',report.asOf],['서버 확인일',report.evidenceThrough],['대상연도',report.year],['검증 SHA-256',digest],['정책 근거',report.policyReference||'미확정'],['비례 반올림',report.rounding],...report.warnings.map(s=>['안내',s])]);
 const sheet=book.addWorksheet('직원별 검증');sheet.addRow(['직원','부서','입사일','근속','전년 조정','전년 사용','전년 원장잔여','대휴 원장잔여','이월 원장잔여','회계연도 기본','가산','계산 후보','미부여 후보','입사일 누적','회계연도 누적','비교 차이','검증']);
 for(const r of report.rows)sheet.addRow([r.employee.name,r.employee.department,r.employee.hire_date,r.tenure,r.recorded.granted,r.recorded.used,r.recorded.remaining,r.recorded.substitute,r.recorded.carryover,r.annualBase,r.addition,r.candidate,r.newDays,r.statutoryTotal,r.fiscalTotal,r.difference,r.excluded?'기준일 이전 미입사':r.blockers.join('\n')||'검토 가능 · 승인 아님']);
 const inputs=book.addWorksheet('입력 원본 참조');inputs.addRow(['직원 ID','직원 버전','최종 재직일','재직 근거','적용 판정','적용 근거','비례 분자','비례 분모','비례 근거','기존 부여 대사 근거','이전 누적 부여','당해 기존 부여']);for(const e of report.inputSnapshot.evidence)inputs.addRow([e.employeeId,e.employeeVersion,e.lastEmploymentDate,e.employmentSource,e.applicability,e.applicabilitySource,e.prorationNumerator,e.prorationDenominator,e.prorationSource,e.reconciliationSource,e.priorFiscalGranted,e.alreadyGranted]);
 const proof=book.addWorksheet('근거 상세');proof.addRow(['직원','기간 시작','기간 종료','구분','판정','원본 참조']);for(const r of report.rows)for(const p of r.periods){const e=r.proofs.find(e=>e.key===p.key);proof.addRow([r.employee.name,p.start,p.end,p.kind,e?.result||'UNKNOWN',e?.source||'미확정']);}
 for(const s of book.worksheets){s.views=[{state:'frozen',ySplit:1}];s.getRow(1).font={bold:true};for(const c of s.columns)c.width=22;}
 return Buffer.from(await book.xlsx.writeBuffer());
}
