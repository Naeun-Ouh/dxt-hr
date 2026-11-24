import {test,expect} from '@playwright/test';
import {loginAs,tokenFor} from './fixtures';
import {today} from '../../src/lib/expenses/validation';
const date=new Date(today()+'T00:00:00Z');date.setUTCMonth(date.getUTCMonth()-2,1);const month=date.toISOString().slice(0,7);
const pdf=(name:string)=>({name,mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nmonthly synthetic evidence\n%%EOF')});
test('real amount typing, DatePicker, reload, monthly two-file upload and auto-save submission',async({page,context})=>{
 await loginAs(context,'employee');await page.goto(`/expenses?month=${month}`);
 await page.getByRole('button',{name:'+ 행 추가',exact:true}).click();
 const date=page.getByLabel('1행 사용일',{exact:true});await expect(date).toHaveAttribute('type','date');await expect(date).toHaveAttribute('min',month+'-01');await date.fill(month+'-02');await date.focus();await page.screenshot({path:'docs/screenshots/issue26-date-picker.png',fullPage:true});
 await page.getByLabel('1행 사용처',{exact:true}).fill('입력 회귀 식당');await page.getByLabel('1행 사용내역',{exact:true}).fill('월별 증빙 테스트');
 await page.getByLabel('소급 청구 사유 (2개월 이상 필수)').fill('테스트 소급 청구');
 const amount=page.getByLabel('1행 금액',{exact:true});await amount.click();await amount.pressSequentially('271818');await amount.press('Enter');await expect(amount).toHaveValue('271818');await page.screenshot({path:'docs/screenshots/issue26-amount-editing.png',fullPage:true});await page.getByLabel('1행 사용처',{exact:true}).click();await expect(amount).toHaveValue('271,818');
 await page.getByRole('button',{name:'일괄 저장',exact:true}).click();await expect(page.getByRole('status')).toHaveText('저장 완료');await page.reload();await expect(amount).toHaveValue('271,818');await expect(date).toHaveValue(month+'-02');
 await page.getByRole('button',{name:'경비 제출',exact:true}).click();await page.getByRole('button',{name:'확인 후 제출'}).click();await expect(page.locator('.form-error[role=alert]')).toContainText('최소 1개');await page.getByRole('button',{name:'돌아가기',exact:true}).click();
 await expect(page.getByLabel('파일 선택 (여러 개)')).toHaveAttribute('multiple','');await page.getByLabel('파일 선택 (여러 개)').setInputFiles([pdf('월별-1.pdf'),pdf('월별-2.pdf')]);await page.getByRole('button',{name:/^파일 업로드/}).click();await expect(page.locator('.expense-file-list li')).toHaveCount(2);await expect(page.locator('.expense-file-list')).toContainText('월별-1.pdf');await expect(page.locator('.expense-file-list')).toContainText('월별-2.pdf');
 const link=await page.locator('.expense-file-list li').filter({hasText:'월별-1.pdf'}).getByRole('link').getAttribute('href');const download=await context.request.get(link!);expect(download.status()).toBe(200);expect(download.headers()['cache-control']).toBe('private, no-store');
 await page.getByLabel('1행 사용내역',{exact:true}).fill('제출 시 자동 저장');await page.getByRole('button',{name:'경비 제출',exact:true}).click();await page.getByRole('button',{name:'확인 후 제출'}).click();await expect(page.getByRole('status')).toContainText('제출 완료');await page.reload();await expect(page.getByLabel('1행 사용내역',{exact:true})).toHaveValue('제출 시 자동 저장');await expect(amount).toHaveValue('271,818');
 await page.screenshot({path:'docs/screenshots/issue26-monthly-attachments.png',fullPage:true});
 // Existing amounts select/replace, comma paste stays in this row, invalid text cannot zero or save.
 await amount.click();await amount.pressSequentially('12345');await amount.press('Tab');await expect(amount).toHaveValue('12,345');
 await amount.focus();await amount.evaluate(el=>{const data=new DataTransfer();data.setData('text/plain','273,218');el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true}));});await amount.press('Tab');await expect(amount).toHaveValue('273,218');await expect(page.locator('.expense-grid tbody tr')).toHaveCount(1);
 await amount.fill('bad');await amount.press('Tab');await expect(amount).not.toHaveValue('0');await expect(page.getByRole('button',{name:'일괄 저장',exact:true})).toBeDisabled();await amount.fill('273218');await amount.press('Tab');await page.getByRole('button',{name:'일괄 저장',exact:true}).click();await expect(page.getByRole('status')).toHaveText('저장 완료');await page.reload();await expect(amount).toHaveValue('273,218');
 // Submitted claims retain attachment replacement/removal within payment window.
 await page.getByRole('button',{name:'월별-1.pdf 삭제',exact:true}).click();await expect(page.locator('.expense-file-list li')).toHaveCount(1);expect((await context.request.get(link!)).status()).toBe(404);
 await page.getByLabel('파일 선택 (여러 개)').setInputFiles([pdf('추가.pdf'),{name:'invalid.png',mimeType:'image/png',buffer:Buffer.from('invalid signature')}]);await page.getByRole('button',{name:/^파일 업로드/}).click();await expect(page.locator('.expense-file-list li')).toHaveCount(2);await expect(page.locator('.expense-attachments [role=alert]')).toContainText('파일 형식');
});
test('compact local search, filter counts/reset, native date bounds and computed amounts',async({page,context})=>{
 await loginAs(context,'employee');await page.goto(`/expenses?month=${month}`);let writes=0;page.on('request',r=>{if(r.headers()['next-action'])writes++;});
 await expect(page.getByLabel('계정과목 필터')).toHaveCount(0);await page.getByLabel('경비 검색').fill('자동 저장');await expect(page.locator('.expense-grid tbody tr')).toHaveCount(1);await page.getByLabel('경비 검색').fill('없는 사용처');await expect(page.locator('.expense-grid tbody tr')).toHaveCount(0);await page.getByRole('button',{name:'초기화',exact:true}).click();
 await page.getByRole('button',{name:'필터 ▾',exact:true}).click();await page.getByLabel('계정과목 필터').selectOption('기타');await page.getByLabel('최소 금액').fill('1000');await expect(page.getByRole('button',{name:'필터 2 ▾'})).toBeVisible();await page.screenshot({path:'docs/screenshots/issue26-compact-filters.png',fullPage:true});await page.getByRole('button',{name:'초기화',exact:true}).click();await expect(page.getByRole('button',{name:'필터 ▾',exact:true})).toBeVisible();
 await page.getByLabel('1행 사용일',{exact:true}).fill('2020-01-01');await expect(page.getByRole('button',{name:'일괄 저장',exact:true})).toBeDisabled();await page.getByRole('button',{name:'변경 취소 / 초기화'}).click();
 await page.getByRole('button',{name:'+ 행 추가',exact:true}).click();await page.getByLabel('2행 경비 유형',{exact:true}).selectOption('TOLL');await expect(page.getByLabel('2행 금액',{exact:true})).toHaveAttribute('readonly','');expect(writes).toBe(0);
});
test('cross-user monthly file list/download/upload/delete/move and anonymous operations fail closed',async({page,context})=>{
 await loginAs(context,'employee');await page.goto(`/expenses?month=${month}`);
 const claim='60000000-0000-4000-8000-000000000002',id='80000000-0000-4000-8000-000000000002';const headers={Authorization:`Bearer ${tokenFor('employee')}`};
 const list=await context.request.get(`http://localhost:54329/rest/v1/expense_attachment?claim_id=eq.${claim}&select=id`,{headers});expect(await list.json()).toEqual([]);
 expect((await context.request.get(`/api/expenses/receipts/${id}`)).status()).toBe(404);
 expect((await context.request.get(`http://localhost:54329/storage/v1/object/authenticated/expense-evidence/${claim}/${id}`,{headers})).status()).toBe(403);
 for(const [fn,data] of [['reserve_expense_attachment',{p_claim:claim,p_filename:'x.pdf',p_mime:'application/pdf',p_size:20}],['remove_expense_attachment',{p_claim:claim,p_id:id}],['finish_expense_attachment',{p_id:id}]] as const){expect((await context.request.post(`http://localhost:54329/rest/v1/rpc/${fn}`,{headers,data})).status()).toBe(400);expect((await context.request.post(`http://localhost:54329/rest/v1/rpc/${fn}`,{data})).status()).toBe(401);}
 // Changed session cannot use a previously rendered employee upload/delete action.
 await page.getByLabel('파일 선택 (여러 개)').setInputFiles(pdf('forged.pdf'));await loginAs(context,'leader');await page.getByRole('button',{name:/^파일 업로드/}).click();await expect(page.locator('.expense-attachments [role=alert]')).toContainText('본인 경비');
 await page.locator('.expense-file-list button').first().click();await expect(page.locator('.form-error[role=alert]')).toContainText('본인 경비');
});
test('elapsed payment period disables monthly controls and rejects HTTP attachment mutations',async({page,context})=>{
 const date=new Date(today()+'T00:00:00Z');date.setUTCMonth(date.getUTCMonth()-4,1);await loginAs(context,'employee');await page.goto(`/expenses?month=${date.toISOString().slice(0,7)}`);
 await expect(page.getByLabel('월별 첨부파일')).toContainText('elapsed.pdf');await expect(page.getByLabel('파일 선택 (여러 개)')).toHaveCount(0);await expect(page.getByRole('button',{name:'elapsed.pdf 삭제'})).toHaveCount(0);
 const headers={Authorization:`Bearer ${tokenFor('employee')}`},claim='61000000-0000-4000-8000-000000000026',id='81000000-0000-4000-8000-000000000026';
 for(const [fn,data] of [['reserve_expense_attachment',{p_claim:claim,p_filename:'x.pdf',p_mime:'application/pdf',p_size:20}],['remove_expense_attachment',{p_claim:claim,p_id:id}],['finish_expense_attachment',{p_id:id}]] as const)expect((await context.request.post(`http://localhost:54329/rest/v1/rpc/${fn}`,{headers,data})).status()).toBe(400);
});
