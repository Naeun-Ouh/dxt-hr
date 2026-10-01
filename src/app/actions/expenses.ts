'use server';
import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireCapability } from '@/lib/auth/access';
import { employeeClient } from '@/lib/employees/data';
import { isUuid, versionFrom } from '@/lib/employees/validation';
import { expenseDetail, expenseOptions, expenseRows } from '@/lib/expenses/data';
import { CLAIM_COLUMNS, type Claim, type ExpenseState, type ItemInput } from '@/lib/expenses/types';
import { claimProblems, editable, fromForm, itemProblems } from '@/lib/expenses/validation';
import { parseWorkbook } from '@/lib/expenses/workbook';
function failure(e:unknown):ExpenseState {
 const code=e&&typeof e==='object'&&'code'in e?e.code:'';
 return {error:code==='40001'?'다른 변경이 있습니다. 새로고침 후 다시 시도해 주세요.':e instanceof Error?e.message:'저장할 수 없습니다. 권한·잠금 상태·참석자의 남은 월 한도를 확인해 주세요.'};
}
async function ownClaim(id:string) {
 if(!isUuid(id))throw new Error('경비를 찾을 수 없습니다.');
 const client=await employeeClient();const {data:self,error}=await client.rpc('current_employee_id');if(error||!self)throw new Error('직원 계정 연결이 필요합니다.');
 const claims=await expenseRows<Claim>('expense_claim',CLAIM_COLUMNS,{id,employee_id:self});if(!claims[0]||!editable(claims[0]))throw new Error('수정 가능한 본인 경비가 아닙니다.');return claims[0];
}
async function receiptFile(file:FormDataEntryValue|null) {
 if(!(file instanceof File)||!file.size)return null;
 if(file.size>10485760||file.name.length>200||!['application/pdf','image/png','image/jpeg'].includes(file.type))throw new Error('증빙은 10MB 이하 PDF, PNG, JPG 파일로 첨부해 주세요.');
 const bytes=Buffer.from(await file.arrayBuffer());
 const valid=file.type==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':file.type==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(!valid)throw new Error('증빙 파일 형식을 확인해 주세요.');return {file,bytes};
}
async function attach(claimId:string,receipt:NonNullable<Awaited<ReturnType<typeof receiptFile>>>) {
 await ownClaim(claimId);const client=await employeeClient();const {file,bytes}=receipt;
 const {data:id,error}=await client.rpc('reserve_expense_attachment',{p_claim:claimId,p_filename:file.name,p_mime:file.type,p_size:file.size});if(error)throw error;
 const {error:uploadError}=await client.storage.from('expense-evidence').upload(`${claimId}/${id}`,bytes,{contentType:file.type,upsert:false});if(uploadError)throw new Error('증빙 업로드에 실패했습니다. 다시 시도해 주세요.');
 const {error:finishError}=await client.rpc('finish_expense_attachment',{p_id:id});if(finishError)throw finishError;return id as string;
}
export async function saveExpense(claimId:string|null,itemId:string|null,_state:ExpenseState,form:FormData):Promise<ExpenseState> {
 await requireCapability('EMPLOYEE_ACCESS');let target=claimId;
 try {
  if(form.has('employee_id')||form.has('user_id'))throw new Error('제출자 변경은 허용되지 않습니다.');
  const item=fromForm(form),reason=String(form.get('late_reason')||'').trim();item.id=itemId||randomUUID();item.version=versionFrom(form);
  if((itemId&&(!isUuid(itemId)||item.version<1))||(!itemId&&item.version!==0))throw new Error('입력값을 확인해 주세요.');
  const problems=[...itemProblems(item),...claimProblems(item.usage_date.slice(0,7),reason)];
  if(problems.some(p=>p.severity==='ERROR'))return {error:problems.filter(p=>p.severity==='ERROR').map(p=>p.message).join(' ')};
  const receipt=await receiptFile(form.get('receipt'));if(!receipt&&!item.attachment_id)throw new Error('영수증 또는 증빙을 첨부해 주세요.');
  const client=await employeeClient();
  if(target){const c=await ownClaim(target);if(c.usage_month.slice(0,7)!==item.usage_date.slice(0,7))throw new Error('사용월은 변경할 수 없습니다.');if(itemId){const {data:found}=await client.from('expense_item').select('id').eq('id',itemId).eq('claim_id',target).maybeSingle();if(!found)throw new Error('경비를 찾을 수 없습니다.');}}
  else {const {data,error}=await client.rpc('ensure_expense_claim',{p_month:item.usage_date.slice(0,7)+'-01'});if(error)throw error;target=data as string;}
  await ownClaim(target!);if(receipt)item.attachment_id=await attach(target!,receipt);
  const {error}=await client.rpc('save_expense_items',{p_claim:target,p_items:[item],p_reason:reason});if(error)throw error;
 }catch(e){return failure(e);}
 revalidatePath('/','layout');redirect(`/expenses/${target}?saved=1`);
}
export async function changeExpenseStatus(claimId:string,action:string,_state:ExpenseState,form:FormData):Promise<ExpenseState> {
 await requireCapability(action==='SUBMIT'?'EMPLOYEE_ACCESS':'EXPENSE_MANAGE');
 try {
  if(!isUuid(claimId)||!['SUBMIT','LOCK','PAY'].includes(action))throw new Error('요청을 확인해 주세요.');
  const client=await employeeClient();if(action==='SUBMIT')await ownClaim(claimId);
  const {error}=await client.rpc(action==='SUBMIT'?'submit_expense_claim':'manage_expense_claim',action==='SUBMIT'?{p_claim:claimId,p_version:versionFrom(form),p_reason:String(form.get('late_reason')||'').trim()}:{p_claim:claimId,p_version:versionFrom(form),p_action:action});if(error)throw error;
 }catch(e){return failure(e);}
 revalidatePath('/','layout');redirect(`${action==='SUBMIT'?'/expenses':'/admin/expenses'}/${claimId}?saved=1`);
}
export async function importExpenses(_state:ExpenseState,form:FormData):Promise<ExpenseState> {
 await requireCapability('EMPLOYEE_ACCESS');let target:string|null=null;
 try {
  if(form.has('employee_id')||form.has('items'))throw new Error('원본 Excel 파일로 검증해 주세요.');
  const file=form.get('workbook'),month=String(form.get('month')||''),reason=String(form.get('late_reason')||'').trim();
  if(!(file instanceof File)||!file.size||file.size>5242880||!file.name.toLowerCase().endsWith('.xlsx')||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('사용월과 5MB 이하 xlsx 파일을 선택해 주세요.');
  const options=await expenseOptions();if(!options.selfId)throw new Error('직원 계정 연결이 필요합니다.');
  const preview=await parseWorkbook(Buffer.from(await file.arrayBuffer()),file.name,month,String(form.get('vehicle_date')||''),options.employees.filter(e=>e.employment_status==='ACTIVE'));
  preview.problems.push(...claimProblems(month,reason));
  const receipt=await receiptFile(form.get('receipt'));if(!receipt)preview.problems.push({severity:'ERROR',code:'EVIDENCE',message:'전체 경비의 영수증·지도·통행료 증빙을 PDF 또는 이미지로 첨부해 주세요.'});
  const client=await employeeClient();const claims=await expenseRows<Claim>('expense_claim',CLAIM_COLUMNS,{employee_id:options.selfId,usage_month:month+'-01'});
  if(claims[0]){if(!editable(claims[0]))preview.problems.push({severity:'ERROR',code:'LOCKED',message:'지급 기간이 잠겨 있어 등록할 수 없습니다.'});const detail=await expenseDetail(claims[0].id);for(const i of preview.items)preview.problems.push(...itemProblems(i,detail.items).filter(p=>p.code==='DUPLICATE'));}
  if(!preview.problems.some(p=>p.severity==='ERROR')) {
   const {data:available,error:availabilityError}=await client.rpc('expense_dining_available',{p_month:month+'-01',p_items:preview.items});
   if(availabilityError||available!==true)preview.problems.push({severity:'ERROR',code:'DINING_ALLOWANCE',message:'참석자의 남은 월 한도를 초과했습니다. 한도 사용액을 확인해 주세요.'});
  }
  if(form.get('intent')!=='register'||preview.problems.some(p=>p.severity==='ERROR'))return {preview};
  const {data,error}=await client.rpc('ensure_expense_claim',{p_month:month+'-01'});if(error)throw error;target=data as string;await ownClaim(target);
  const attachmentId=await attach(target,receipt!);const items:ItemInput[]=preview.items.map(i=>({...i,attachment_id:attachmentId}));
  const {error:saveError}=await client.rpc('save_expense_items',{p_claim:target,p_items:items,p_reason:reason});if(saveError)return {...failure(saveError),preview};
 }catch(e){return failure(e);}
 revalidatePath('/','layout');redirect(`/expenses/${target}?saved=1`);
}
