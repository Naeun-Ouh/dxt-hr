import { test,expect } from '@playwright/test';
import ExcelJS from 'exceljs';
import { loginAs,tokenFor } from './fixtures';
import { today } from '../../src/lib/expenses/validation';
import { templateWorkbook } from '../../src/lib/expenses/workbook';
const claim='60000000-0000-4000-8000-000000000001',otherClaim='60000000-0000-4000-8000-000000000002';
const item='70000000-0000-4000-8000-000000000001',otherItem='70000000-0000-4000-8000-000000000002';
const receipt='80000000-0000-4000-8000-000000000001',otherReceipt='80000000-0000-4000-8000-000000000002';
const month=today().slice(0,7),pdf={name:'evidence.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nexpense proof\n%%EOF')};
test('own expenses, private evidence and every specialist boundary deny guessed identifiers',async({page,context})=>{
 for(const user of ['employee','leader','it','division']) {
  await loginAs(context,user);
  const response=await page.goto(`/expenses/${otherClaim}?employee_id=10000000-0000-4000-8000-000000000002`);expect(response!.status()).toBe(404);expect(await response!.text()).not.toContain('동료 비공개 식당');
  expect((await context.request.get(`/api/expenses/receipts/${otherReceipt}`)).status()).toBe(404);
  expect((await page.goto(`/expenses/items/${otherItem}/edit?claim=${otherClaim}`))!.status()).toBe(404);
  expect((await page.goto('/admin/expenses'))!.status()).toBe(404);
  const exportResponse=await context.request.get('/api/expenses/export');expect(exportResponse.status()).toBe(404);
  const direct=await context.request.get(`http://localhost:54329/storage/v1/object/authenticated/expense-evidence/${otherClaim}/${otherReceipt}`,{headers:{Authorization:`Bearer ${tokenFor(user)}`}});expect(direct.status()).toBe(403);
 }
 await loginAs(context,'employee');await page.goto('/expenses?employee_id=10000000-0000-4000-8000-000000000002');await expect(page.getByText('동료 비공개 식당')).toHaveCount(0);
 const own=await context.request.get(`/api/expenses/receipts/${receipt}`);expect(own.status()).toBe(200);expect(own.headers()['cache-control']).toContain('no-store');
 const rsc=await context.request.get(`/expenses/${otherClaim}`,{headers:{RSC:'1'}});expect(await rsc.text()).not.toContain('동료 비공개 식당');
 await page.screenshot({path:'docs/screenshots/phase5-my-expenses.png',fullPage:true});
});
test('direct entry uploads evidence, shows policy and duplicate warnings, edits and calculates vehicle totals',async({page,context})=>{
 await loginAs(context,'employee');await page.goto('/expenses/new');
 await page.getByLabel('사용일',{exact:true}).fill(month+'-01');await page.getByLabel('사용처',{exact:true}).fill('본죽 잠실점');await page.getByLabel('품목 / 사용 목적').fill('야근 식사');await page.getByLabel('금액 (원)',{exact:true}).fill('12000');
 await expect(page.getByText('야근식대 기준 10,000원을 초과했습니다. 금액을 확인한 뒤 수정해주세요.')).toBeVisible();
 await page.getByLabel('영수증 / 증빙 *',{exact:true}).setInputFiles(pdf);await page.screenshot({path:'docs/screenshots/phase5-entry.png',fullPage:true});
 await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByRole('status')).toHaveText('저장했습니다.');await expect(page.getByText(/비슷한 경비 내역이 있어요/).first()).toBeVisible();
 await page.goto(`/expenses/items/${item}/edit?claim=${claim}`);await page.getByLabel('경비 유형').selectOption('FUEL');await page.getByLabel('프로젝트명 / 출장명').fill('삼성바이오로직스 출장');await page.getByLabel('출발지',{exact:true}).fill('구로역');await page.getByLabel('도착지',{exact:true}).fill('송도');await page.getByLabel('편도 금액 (원)').fill('5036');await page.getByLabel('횟수',{exact:true}).fill('20');await expect(page.getByText('₩100,720',{exact:true})).toBeVisible();
 await page.screenshot({path:'docs/screenshots/phase5-vehicle.png',fullPage:true});await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByRole('status')).toHaveText('저장했습니다.');await expect(page.getByText(/₩5,036 × 20회 = ₩100,720/)).toBeVisible();
 await page.setViewportSize({width:390,height:844});await page.goto('/expenses/new');expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await page.screenshot({path:'docs/screenshots/phase5-entry-mobile.png',fullPage:true});
});
test('forged submitter, cross-user edit replay and administrator action replay fail closed',async({page,context})=>{
 await loginAs(context,'employee');await page.goto(`/expenses/items/${item}/edit?claim=${claim}`);
 await page.locator('#expense-form').evaluate(form=>{const input=document.createElement('input');input.name='employee_id';input.value='10000000-0000-4000-8000-000000000002';form.appendChild(input);});await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.locator('.form-error[role=alert]')).toContainText('제출자 변경');
 await page.goto(`/expenses/items/${item}/edit?claim=${claim}`);await loginAs(context,'expense');await page.getByLabel('사용처',{exact:true}).fill('다른 직원의 변조');await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.locator('.form-error[role=alert]')).toContainText('수정 가능한 본인 경비가 아닙니다');
 await loginAs(context,'employee');await page.goto(`/expenses/${claim}`);await expect(page.getByText('다른 직원의 변조')).toHaveCount(0);
 const rpc=await context.request.post('http://localhost:54329/rest/v1/rpc/save_expense_items',{headers:{Authorization:`Bearer ${tokenFor('employee')}`},data:{p_claim:otherClaim,p_items:[{id:otherItem,version:1}],p_reason:''}});expect(rpc.status()).toBe(400);
});
test('Excel preview blocks errors and imports both sheets atomically with shared evidence',async({page,context})=>{
 await loginAs(context,'employee');const template=await context.request.get('/api/expenses/template');expect(template.status()).toBe(200);
 const book=new ExcelJS.Workbook();await book.xlsx.load(await templateWorkbook(month) as never);
 book.getWorksheet('지출결의서')!.addRow(['invalid','브라우저 식당','야근 식대','복리후생비',14000,'개인카드','','야근 식대','개인카드']);book.getWorksheet('주유비,통행비')!.addRow(['통행비',month+'-01','Excel 출장','서울','송도',2400,20,'하이패스']);
 await page.goto('/expenses/upload');await page.getByLabel('Excel 파일 (.xlsx)').setInputFiles({name:'expense.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(await book.xlsx.writeBuffer())});await page.getByLabel('전체 경비 증빙 (PDF / PNG / JPG)').setInputFiles(pdf);await page.getByRole('button',{name:'파일 검증'}).click();await expect(page.getByRole('button',{name:'검증 결과 확인 후 등록'})).toBeDisabled();await expect(page.getByText(/사용일을 올바르게/)).toBeVisible();await page.screenshot({path:'docs/screenshots/phase5-validation.png',fullPage:true});
 book.getWorksheet('지출결의서')!.getCell('A4').value=month+'-01';await page.getByLabel('Excel 파일 (.xlsx)').setInputFiles({name:'expense.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(await book.xlsx.writeBuffer())});await page.getByRole('button',{name:'파일 검증'}).click();await expect(page.getByRole('button',{name:'검증 결과 확인 후 등록'})).toBeEnabled();await page.getByRole('button',{name:'검증 결과 확인 후 등록'}).click();await expect(page.getByRole('status')).toHaveText('저장했습니다.');await expect(page.getByText(/₩2,400 × 20회 = ₩48,000/)).toBeVisible();await expect(page.getByText('야근 식대 · 브라우저 식당')).toBeVisible();
});
test('dining attendees consume a shared monthly allowance and exhausted reuse is blocked',async({page,context})=>{
 await loginAs(context,'expense');await page.goto(`/expenses/items/${otherItem}/edit?claim=${otherClaim}`);await page.getByLabel('경비 유형').selectOption('DINING');await page.getByLabel('금액 (원)',{exact:true}).fill('40000');await page.getByRole('checkbox',{name:/이동료/}).check();await page.getByLabel('이동료 한도 사용액').fill('30000');await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByRole('status')).toHaveText('저장했습니다.');await expect(page.getByText(/참석자 합산 월 지원 기준을 초과/)).toBeVisible();
 await page.screenshot({path:'docs/screenshots/phase5-dining.png',fullPage:true});
 await loginAs(context,'employee');await page.goto('/expenses/new');await page.getByLabel('경비 유형').selectOption('DINING');await page.getByLabel('사용처',{exact:true}).fill('다른 회식');await page.getByLabel('품목 / 사용 목적').fill('회식');await page.getByLabel('금액 (원)',{exact:true}).fill('10000');await page.getByRole('checkbox',{name:/이동료/}).check();await page.getByLabel('이동료 한도 사용액').fill('10000');await page.getByLabel('영수증 / 증빙 *',{exact:true}).setInputFiles(pdf);await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.locator('.form-error[role=alert]')).toContainText('남은 월 한도');
 const book=new ExcelJS.Workbook();await book.xlsx.load(await templateWorkbook(month) as never);book.getWorksheet('지출결의서')!.addRow([month+'-01','회식 식당','회식','복리후생비',10000,'개인카드','','회식','개인카드','expense@example.test:10000']);
 await page.goto('/expenses/upload');await page.getByLabel('Excel 파일 (.xlsx)').setInputFiles({name:'dining.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(await book.xlsx.writeBuffer())});await page.getByLabel('전체 경비 증빙 (PDF / PNG / JPG)').setInputFiles(pdf);await page.getByRole('button',{name:'파일 검증'}).click();await expect(page.getByText('참석자의 남은 월 한도를 초과했습니다. 한도 사용액을 확인해 주세요.')).toBeVisible();await expect(page.getByRole('button',{name:'검증 결과 확인 후 등록'})).toBeDisabled();
});
test('monthly submission, admin filters/export, action replay and payment lock complete the flow',async({page,context})=>{
 await loginAs(context,'employee');await page.goto(`/expenses/${claim}`);await page.getByRole('button',{name:'월 경비 제출'}).click();await expect(page.getByRole('status')).toHaveText('저장했습니다.');
 await loginAs(context,'expense');await page.goto(`/admin/expenses?month=${month}`);await expect(page.getByRole('row').filter({hasText:'김테스트'})).toContainText('제출완료');await expect(page.getByRole('button',{name:/반려|승인/})).toHaveCount(0);await page.screenshot({path:'docs/screenshots/phase5-admin.png',fullPage:true});
 const response=await context.request.get(`/api/expenses/export?month=${month}`);expect(response.status()).toBe(200);const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await response.body() as never);expect(workbook.worksheets[0].rowCount).toBeGreaterThan(2);expect(workbook.worksheets[0].getRow(1).values).toContain('증빙참조');
 await page.goto(`/admin/expenses/${claim}`);await loginAs(context,'it');await page.route('**/admin/expenses/**',async route=>{if(!route.request().headers()['next-action'])return route.continue();const response=await route.fetch();expect(await response.text()).toContain('NEXT_HTTP_ERROR_FALLBACK;404');await route.fulfill({response});});await page.getByRole('button',{name:'지급 완료 처리'}).click();await expect(page.getByRole('heading',{name:'페이지를 찾을 수 없습니다'})).toBeVisible();await page.unroute('**/admin/expenses/**');
 await loginAs(context,'expense');await page.goto(`/admin/expenses/${claim}`);await page.getByRole('button',{name:'지급 완료 처리'}).click();await expect(page.getByRole('status')).toHaveText('저장했습니다.');
 await loginAs(context,'employee');await page.goto(`/expenses/${claim}`);await expect(page.getByText('지급 기간이 잠겼습니다. 경비와 증빙은 읽기 전용입니다.')).toBeVisible();await expect(page.getByRole('link',{name:'수정',exact:true})).toHaveCount(0);expect((await page.goto(`/expenses/items/${item}/edit?claim=${claim}`))!.status()).toBe(404);expect((await context.request.get(`/api/expenses/receipts/${receipt}`)).status()).toBe(200);
});
