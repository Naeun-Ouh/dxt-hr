import {test,expect} from '@playwright/test';
import {loginAs} from './fixtures';
const employee='10000000-0000-4000-8000-000000000001',departing='10000000-0000-4000-8000-000000000005';
test('lifecycle workspace links existing tasks and scoped domains without changing employee state',async({page,context})=>{
 await loginAs(context,'admin');await page.goto('/admin/lifecycle');await expect(page.getByRole('heading',{name:'입퇴사 업무',exact:true})).toBeVisible();await expect(page.getByRole('table')).toContainText('온보딩');await expect(page.getByRole('table')).toContainText('오프보딩');await page.screenshot({path:'docs/screenshots/issue35-lifecycle-queue.png',fullPage:true});
 await page.goto('/admin/lifecycle/'+employee);await expect(page.getByRole('heading',{name:'체크리스트',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'근로계약',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'인사서류',exact:true})).toHaveCount(0);await expect(page.getByRole('link',{name:'휴가 원장 확인'})).toHaveAttribute('href','/admin/leave/'+employee);await page.screenshot({path:'docs/screenshots/issue35-lifecycle-detail.png',fullPage:true});
 await page.getByRole('link',{name:'담당자·상태 수정'}).first().click();await expect(page.getByRole('button',{name:'항목 저장'})).toBeVisible();
 await page.goto('/admin/lifecycle/'+departing);await expect(page.getByText('장비 미반납은 퇴사 완료를 차단하지 않습니다.',{exact:false})).toBeVisible();const html=await page.content();expect(html).not.toContain('CEO-ONLY');expect(html).not.toContain('resignation-letters');
 await loginAs(context,'designated');await page.goto('/admin/lifecycle/'+employee);await expect(page.getByRole('heading',{name:'인사서류',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'인사서류 확인'})).toHaveAttribute('href','/people/'+employee+'?tab=documents');
 for(const role of ['employee','leader','expense','it','division','combined']){await loginAs(context,role);for(const path of ['/admin/lifecycle','/admin/lifecycle/'+employee,'/admin/lifecycle/'+departing]){expect((await page.goto(path))!.status()).toBe(404);const rsc=await context.request.get(path,{headers:{RSC:'1'}});expect(await rsc.text()).not.toContain('CEO-ONLY');}}
});
