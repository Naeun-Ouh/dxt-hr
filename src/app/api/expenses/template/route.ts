import { requireCapability } from '@/lib/auth/access';
import { templateWorkbook } from '@/lib/expenses/workbook';
import { today } from '@/lib/expenses/validation';
export async function GET(request:Request) {
 await requireCapability('EMPLOYEE_ACCESS');const value=new URL(request.url).searchParams.get('month');const month=value&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value)?value:today().slice(0,7);
 return new Response(new Uint8Array(await templateWorkbook(month)),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="DXT_Expense_Template.xlsx"','Cache-Control':'private, no-store'}});
}
