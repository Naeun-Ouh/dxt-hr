import {test,expect} from '@playwright/test';
import {loginAs} from './fixtures';
const screens=[['expense','/expenses','employee'],['employee','/admin/employees','ceo'],['project','/admin/projects','ceo'],['asset','/admin/assets','ceo'],['leave','/leave','employee'],['contract','/admin/contracts','ceo']] as const;
test('compact workspace visual evidence and contained responsive tables',async({page,context})=>{
 for(const [name,url,role] of screens){
  await loginAs(context,role);
  for(const width of (process.env.UI_BASELINE?[1440]:[1440,768,390])){
   await page.setViewportSize({width,height:1000});await page.goto(url);await expect(page.locator('h1')).toBeVisible();
   await page.screenshot({path:`docs/screenshots/issue29/${process.env.UI_BASELINE?'before':'after'}-${name}-${width}.png`,fullPage:true});
   if(!process.env.UI_BASELINE)expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${url} ${width}`).toBeTruthy();
  }
 }
});
test('native modal and drawer trap focus, Escape restores focus, row expansion is keyboard operable',async({page,context})=>{
 await loginAs(context,'employee');await page.goto('/expenses');
 await page.locator('summary').filter({hasText:'Excel'}).click();
 const trigger=page.getByRole('button',{name:'Excel Import',exact:true});await trigger.click();
 const dialog=page.getByRole('dialog',{name:'Excel 가져오기',exact:true});await expect(dialog).toBeVisible();
 await page.screenshot({path:'docs/screenshots/issue29/after-import-modal.png'});
 for(let i=0;i<10;i++){await page.keyboard.press('Tab');expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBeTruthy();}
 await dialog.getByRole('button',{name:'Excel 가져오기 닫기',exact:true}).focus();await page.keyboard.press('Shift+Tab');expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBeTruthy();
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();
 await page.getByRole('button',{name:'+ 행 추가',exact:true}).click();
 const detail=page.getByRole('button',{name:'상세',exact:true}).last();await detail.click();
 const drawer=page.getByRole('dialog',{name:'경비 행 상세',exact:true});await expect(drawer).toBeVisible();
 await page.screenshot({path:'docs/screenshots/issue29/after-expense-drawer.png'});
 await page.keyboard.press('Escape');await expect(drawer).not.toBeVisible();await expect(detail).toBeFocused();
 await loginAs(context,'ceo');await page.goto('/admin/projects');
 const expand=page.getByRole('button',{name:/투입 인력/}).first();await expand.focus();await page.keyboard.press('Enter');await expect(expand).toHaveAttribute('aria-expanded','true');
 await expect(page.locator('.work-expanded-row')).toBeVisible();await page.keyboard.press('Enter');await expect(expand).toHaveAttribute('aria-expanded','false');
});
test('compact profile tabs and contract filters keep authorization scope',async({page,context})=>{
 await loginAs(context,'employee');await page.goto('/people/10000000-0000-4000-8000-000000000001');
 await expect(page.getByRole('navigation',{name:'직원 상세 탭'})).toBeVisible();
 await expect(page.getByRole('link',{name:'HR Private',exact:true})).toHaveCount(0);
 await page.getByRole('link',{name:'프로젝트',exact:true}).last().click();await expect(page).toHaveURL(/tab=projects/);
 await page.goto('/contracts/me');await page.getByRole('searchbox',{name:'계약 검색'}).fill('존재하지않는검색');await expect(page.getByText('조건에 맞는 근로계약이 없습니다.')).toBeVisible();
 await expect(page.locator('.sidebar').getByRole('link',{name:'근로계약 관리',exact:true})).toHaveCount(0);
});
test('dense toolbar and contextual employee/asset views retain the main grid',async({page,context})=>{
 await loginAs(context,'employee');await page.goto('/expenses');
 expect(await page.locator('.expense-searchbar').evaluate(e=>e.getBoundingClientRect().height)).toBeLessThan(80);
 expect(await page.locator('.expense-grid').evaluate(e=>e.getBoundingClientRect().top)).toBeLessThan(420);
 await loginAs(context,'ceo');await page.goto('/admin/employees');
 await page.getByRole('button',{name:'빠른 보기',exact:true}).first().click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 await expect(dialog.getByText('회사 이메일',{exact:true})).toBeVisible();await page.keyboard.press('Escape');
 await page.goto('/admin/assets');const history=page.getByRole('button',{name:/이력 ▾/}).first();await history.click();
 await expect(page.getByRole('heading',{name:'지급 / 반납 이력'})).toBeVisible();await expect(page.getByRole('heading',{name:'인계 이력'})).toBeVisible();
 await page.setViewportSize({width:390,height:844});await page.goto('/expenses');await expect(page.locator('.navigation-panel')).not.toHaveAttribute('open','');
 await page.locator('.navigation-panel>summary').click();await expect(page.locator('.navigation-panel')).toHaveAttribute('open','');
});
