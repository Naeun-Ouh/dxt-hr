import {test,expect} from '@playwright/test';
import ExcelJS from 'exceljs';
import {loginAs} from '../e2e/fixtures';
test('monthly admin pagination preserves filters and full-month summary',async({page,context},testInfo)=>{
 await loginAs(context,'admin');await page.goto('/admin/expenses?month=2026-10');
 const summary=await page.locator('.expense-summary').innerText();
 const firstNames=await page.locator('tbody tr td:first-child').allTextContents();
 expect(firstNames).toHaveLength(50);
 const pagination=page.getByRole('navigation',{name:'경비 직원 목록 페이지'});
 await expect(pagination.getByRole('link',{name:'다음',exact:true})).toHaveAttribute('href',/month=2026-10/);
 await pagination.getByRole('link',{name:'다음',exact:true}).click();
 await expect(page).toHaveURL(/page=2/);await expect(page).toHaveURL(/month=2026-10/);
 await expect(page.locator('.expense-summary')).toHaveText(summary,{useInnerText:true});
 const secondNames=await page.locator('tbody tr td:first-child').allTextContents();
 expect(secondNames.length).toBeGreaterThan(0);expect(secondNames.some(name=>firstNames.includes(name))).toBe(false);
 await expect(pagination.getByRole('link',{name:'이전',exact:true})).toBeVisible();
 await page.screenshot({path:testInfo.outputPath('admin-pagination.png'),fullPage:true});
});

for(const [name,role,path,heading] of [['home','employee','/','마이페이지'],['expense','employee','/expenses?month=2026-10','경비관리'],['approval','leader','/leave/approvals','휴가 승인'],['admin-expense','admin','/admin/expenses?month=2026-10','경비 관리'],['directory','ceo','/admin/employees','직원 관리']])test(`ready screen ${name}`,async({page,context},testInfo)=>{await loginAs(context,role);await page.goto(path);await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();await page.screenshot({path:testInfo.outputPath(`${name}.png`),fullPage:true});});


test('selected employee scopes draft KPIs, roster and empty export',async({page,context})=>{
 await loginAs(context,'admin');
 const employee='1f000000-0000-4000-8000-000000000001';
 await page.goto(`/admin/expenses?month=2026-10&employee=${employee}`);
 await expect(page.locator('.expense-summary > div').nth(0)).toContainText('0명');
 await expect(page.locator('.expense-summary > div').nth(1)).toContainText('1명');
 await expect(page.locator('.expense-summary > div').nth(2)).toContainText('₩12,000');
 await expect(page.locator('tbody tr')).toHaveCount(1);
 await expect(page.locator('tbody tr')).toContainText('성능검증 01');
 await expect(page.getByRole('navigation',{name:'경비 직원 목록 페이지'})).toHaveCount(0);
 const href=await page.getByRole('link',{name:'Excel 다운로드',exact:true}).getAttribute('href');
 expect(href).toBe(`/api/expenses/export?month=2026-10&employee=${employee}`);
 const response=await context.request.get(href!);expect(response.status()).toBe(200);
 const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await response.body() as never);
 expect(workbook.getWorksheet('경비 내역')!.getCell('A1').value).toBe('제출된 경비가 없습니다.');
 await page.goto(`/admin/expenses?month=2026-10&employee=${employee}&status=SUBMITTED`);
 await expect(page.locator('tbody tr')).toHaveCount(0);
 await expect(page.locator('.expense-summary > div').nth(1)).toContainText('0명');
 await expect(page.locator('.expense-summary > div').nth(2)).toContainText('₩0');
});

test('selected submitted employee totals match scoped export without counting unrelated staff',async({page,context})=>{
 await loginAs(context,'employee');await page.goto('/expenses?month=2026-10');
 await page.getByLabel('파일 선택 (여러 개)').setInputFiles({name:'synthetic-kpi.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 synthetic performance receipt')});
 await page.getByRole('button',{name:/^파일 업로드/}).click();await expect(page.getByRole('status')).toContainText('업로드 결과');
 await page.getByRole('button',{name:'경비 제출',exact:true}).click();await page.getByRole('button',{name:'확인 후 제출'}).click();
 await expect(page.getByRole('status')).toContainText('제출 완료');
 await loginAs(context,'admin');const employee='10000000-0000-4000-8000-000000000001';
 await page.goto(`/admin/expenses?month=2026-10&employee=${employee}`);
 await expect(page.locator('.expense-summary > div').nth(0)).toContainText('1명');
 await expect(page.locator('.expense-summary > div').nth(1)).toContainText('0명');
 await expect(page.locator('.expense-summary > div').nth(2)).toContainText('₩12,000');
 await expect(page.locator('tbody tr')).toHaveCount(1);await expect(page.locator('tbody tr')).toContainText('김테스트');
 const response=await context.request.get((await page.getByRole('link',{name:'Excel 다운로드',exact:true}).getAttribute('href'))!);
 expect(response.status()).toBe(200);expect(response.headers()['cache-control']).toBe('private, no-store');
 const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await response.body() as never);
 const sheet=workbook.getWorksheet('경비 내역')!;expect(sheet.rowCount).toBe(2);
 const headers=new Map<string,number>();sheet.getRow(1).eachCell((cell,column)=>headers.set(String(cell.value),column));
 for(const [key,value] of Object.entries({'직원':'김테스트','사용월':'2026-10','금액':12000}))expect(sheet.getRow(2).getCell(headers.get(key)!).value).toBe(value);
 await page.goto(`/admin/expenses?month=2026-09&employee=${employee}`);
 await expect(page.locator('.expense-summary > div').nth(0)).toContainText('0명');
 await expect(page.locator('.expense-summary > div').nth(1)).toContainText('1명');
 await expect(page.locator('.expense-summary > div').nth(2)).toContainText('₩0');
});
