import {test,expect} from '@playwright/test';
import {loginAs,tokenFor} from './fixtures';
const own=['홈(마이페이지)','조직 / 직원','휴가','경비','나의 프로젝트','증명서 발급','계약','자산'];
test('root is self My Page, legacy alias remains, news and workflows stay reachable',async({page,context})=>{
 await loginAs(context,'employee');await page.goto('/?employee_id=10000000-0000-4000-8000-000000000002');
 await expect(page.getByRole('heading',{name:'마이페이지',exact:true})).toBeVisible();await expect(page.locator('.my-page .profile-summary')).toContainText('김테스트');
 await expect(page.getByRole('navigation',{name:'주 메뉴'}).getByRole('link')).toHaveText(own);
 await expect(page.getByRole('navigation',{name:'업무 모드'})).toHaveCount(0);
 await expect(page.locator('.my-page').getByRole('link',{name:'공지사항 회사 공지 확인'})).toHaveAttribute('href','/announcements');
 await expect(page.locator('.my-page .summary-strip')).toContainText('경비');await expect(page.locator('.my-page .summary-strip')).toContainText('현재 보유 장비');
 await page.screenshot({path:'docs/screenshots/issue51-home.png',fullPage:true});
 await page.goto('/me');await expect(page.getByRole('heading',{name:'마이페이지',exact:true})).toBeVisible();
 await page.goto('/leave');for(const href of ['/leave/request','/leave/requests','/leave/team-calendar','/leave/weekend-work','/leave/carryover'])await expect(page.locator(`nav[aria-label="휴가 업무 메뉴"] a[href="${href}"]`)).toBeVisible();
 await page.goto('/projects/me');await page.getByRole('navigation',{name:'나의 프로젝트 업무 메뉴'}).getByRole('link',{name:'커리어',exact:true}).click();await expect(page).toHaveURL(/\/career$/);
 await page.goto('/?workspace=admin');await expect(page.getByRole('navigation',{name:'업무 모드'})).toHaveCount(0);expect((await page.goto('/admin/expenses?workspace=admin'))?.status()).toBe(404);
});
test('leader mode stays team scoped and CEO has ordered management plus own assets',async({page,context})=>{
 await loginAs(context,'leader');await page.goto('/');await page.getByRole('navigation',{name:'업무 모드'}).getByRole('link',{name:'관리 업무'}).click();await expect(page).toHaveURL(/\/leave\/approvals$/);
 await expect(page.getByRole('navigation',{name:'주 메뉴'}).getByRole('link')).toHaveText(['휴가관리','프로젝트관리']);
 await expect(page.getByRole('navigation',{name:'휴가관리 업무 메뉴'}).getByRole('link',{name:'주말근무 검토'})).toBeVisible();expect((await page.goto('/admin/leave'))?.status()).toBe(404);expect((await page.goto('/admin/expenses'))?.status()).toBe(404);
 await loginAs(context,'ceo');await page.goto('/admin/employees');await expect(page.getByRole('navigation',{name:'주 메뉴'}).getByRole('link')).toHaveText(['직원관리','조직관리','휴가관리','경비관리','프로젝트관리','증명서 발급 관리','계약관리','자산관리','환경설정']);await page.screenshot({path:'docs/screenshots/issue51-admin.png',fullPage:true});
 await page.getByRole('navigation',{name:'업무 모드'}).getByRole('link',{name:'내 업무'}).click();await expect(page.locator('.my-page .profile-summary')).toContainText('대표자');await page.getByRole('navigation',{name:'주 메뉴'}).getByRole('link',{name:'자산',exact:true}).click();await expect(page).toHaveURL(/\/assets\/me$/);
 await page.setViewportSize({width:390,height:844});await page.locator('.navigation-panel summary').click();await expect(page.getByRole('navigation',{name:'업무 모드'}).getByRole('link',{name:'관리 업무'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:'docs/screenshots/issue51-mobile.png',fullPage:true});
});

test('home displays only latest three published titles for employees and managers',async({page,context})=>{
 const prefix='Home-'+crypto.randomUUID(),ids:string[]=[];
 for(let i=0;i<4;i++){const id=crypto.randomUUID();ids.push(id);const response=await context.request.post('http://localhost:54329/rest/v1/rpc/save_announcement',{headers:{Authorization:'Bearer '+tokenFor('admin')},data:{p_id:id,p_title:`${prefix}-${i}`,p_body:'HOME-BODY-PRIVATE-TO-DETAIL',p_publish:true,p_version:0}});expect(response.ok()).toBeTruthy();}
 const draft=await context.request.post('http://localhost:54329/rest/v1/rpc/save_announcement',{headers:{Authorization:'Bearer '+tokenFor('admin')},data:{p_id:crypto.randomUUID(),p_title:prefix+'-DRAFT',p_body:'DRAFT-BODY-MUST-NOT-LEAK',p_publish:false,p_version:0}});expect(draft.ok()).toBeTruthy();
 for(const role of ['employee','admin','ceo']){await loginAs(context,role);await page.goto('/');const news=page.locator('.home-announcements');await expect(news.locator('li')).toHaveCount(3);await expect(news).toContainText(prefix+'-3');await expect(news).not.toContainText(prefix+'-0');await expect(page.locator('.my-page')).not.toContainText(prefix+'-DRAFT');await expect(news).not.toContainText('HOME-BODY');await expect(news.locator('time')).toHaveCount(3);await expect(news.getByRole('link',{name:prefix+'-3',exact:true})).toHaveAttribute('href','/announcements/'+ids[3]);}
});
