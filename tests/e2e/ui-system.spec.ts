import { test, expect } from '@playwright/test';
import { loginAs } from './fixtures';
const routes = [
 ['employees', '/admin/employees'], ['employee-form', '/admin/employees/new'],
 ['projects', '/admin/projects'], ['expenses', '/admin/expenses'],
 ['assets', '/admin/assets'], ['contracts', '/admin/contracts'], ['seals', '/admin/contracts/seals'],
] as const;
test('enterprise surfaces: desktop and narrow layouts retain accessible controls', async ({page, context}) => {
 await loginAs(context, 'ceo');
 for (const [name, route] of routes) {
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(route); await expect(page.locator('h1')).toBeVisible();
  await page.screenshot({path:`docs/screenshots/ui-system/${process.env.UI_BASELINE?'before':'after'}-${name}.png`,fullPage:true});
  if (!process.env.UI_BASELINE) {
   for (const width of [768,390]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1), `${route} at ${width}px`).toBeTruthy();
   }
  }
 }
});
test('employee keyboard navigation and private navigation boundary', async ({page,context}) => {
 await loginAs(context,'employee');await page.goto('/people');
 await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'본문으로 건너뛰기'})).toBeFocused();
 await expect(page.locator('.sidebar').getByRole('link',{name:'직원 관리',exact:true})).toHaveCount(0);
 await expect(page.locator('.sidebar').getByRole('link',{name:'회사 직인 관리',exact:true})).toHaveCount(0);
});

test('table scroll and form controls remain keyboard operable', async ({page,context}) => {
 await loginAs(context,'ceo');await page.goto('/admin/projects');
 const region=page.getByRole('main').getByRole('region').first();await region.focus();await expect(region).toBeFocused();
 await page.goto('/admin/employees/new');
 const name=page.getByLabel('이름',{exact:true});await name.focus();await expect(name).toBeFocused();
 await expect(name).toHaveAttribute('required','');
 expect(await name.evaluate(e=>e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(36);
 const save=page.getByRole('button',{name:'프로필 저장'});await expect(save).toBeEnabled();
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'docs/screenshots/ui-system/after-mobile-form.png',fullPage:true});
});
