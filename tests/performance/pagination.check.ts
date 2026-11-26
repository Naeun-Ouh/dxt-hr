import {test,expect} from '@playwright/test';
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
