import { expenseData, expenseDetail, expenseOptions } from '@/lib/expenses/data';
import { exportWorkbook } from '@/lib/expenses/workbook';
import { itemProblems, localDate, claimProblems } from '@/lib/expenses/validation';
import { PURPOSES, STATUS } from '@/lib/expenses/types';
export async function GET(request:Request) {
 const data=await expenseData(true),options=await expenseOptions(),query=new URL(request.url).searchParams;
 const rows:Record<string,string|number>[]=[];
 for(const c of data.claims.filter(c=>c.status!=='DRAFT'&&(!query.get('month')||c.usage_month.slice(0,7)===query.get('month'))&&(!query.get('employee')||c.employee_id===query.get('employee')))) {
  const detail=await expenseDetail(c.id,true),employee=options.employees.find(e=>e.id===c.employee_id);
  for(const i of detail.items)rows.push({'직원':employee?.name||c.employee_id,'이메일':employee?.company_email||'','사용월':c.usage_month.slice(0,7),'사용일':i.usage_date,'유형':PURPOSES[i.expense_type],'업체명':i.merchant,'품목':i.description,'계정과목':i.account_category,'금액':i.amount,'결제수단':i.payment_method==='PERSONAL_CARD'?'개인카드':'현금','증빙종류':i.evidence_type,'증빙파일':detail.attachments.find(a=>a.id===i.attachment_id)?.filename||'','증빙참조':`/api/expenses/receipts/${i.attachment_id}`,'프로젝트ID':i.project_id||'','출장명':i.trip_context,'출발지':i.vehicle?.origin||'','도착지':i.vehicle?.destination||'','편도금액':i.vehicle?.one_way_amount||'','횟수':i.vehicle?.trip_count||'','참석자/한도사용액':i.attendees.map(a=>`${options.employees.find(e=>e.id===a.employee_id)?.name||a.employee_id}: ${a.allocated_amount}`).join('; '),'비고':i.notes,'소급사유':c.late_reason,'검증': [...itemProblems(i,detail.items),...claimProblems(c.usage_month,c.late_reason,c.submitted_at?localDate(c.submitted_at):undefined)].map(p=>`${p.severity}: ${p.message}`).join('\n'),'상태':STATUS[c.status],'제출일':c.submitted_at||'','지급예정일':c.payment_date||'','잠금일':c.locked_at||'','원본파일':i.import_filename||'','원본행':i.import_origin||'','가져온시각':i.imported_at||''});
 }
 return new Response(new Uint8Array(await exportWorkbook(rows)),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="DXT_Expenses.xlsx"','Cache-Control':'private, no-store'}});
}
