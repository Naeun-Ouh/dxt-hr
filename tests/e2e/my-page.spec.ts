import {test,expect} from '@playwright/test';
import {loginAs,tokenFor} from './fixtures';
const self='10000000-0000-4000-8000-000000000001',peer='10000000-0000-4000-8000-000000000002';
test('my page ignores forged identity and links only self-service data with compact responsive layout',async({page,context})=>{
 await context.request.post('http://localhost:54329/rest/v1/rpc/save_asset',{headers:{Authorization:'Bearer '+tokenFor('admin')},data:{p_id:crypto.randomUUID(),p_expected_version:0,p_values:{type:'NOTEBOOK',manufacturer:'DXT',model:'My Page test device',serial_number:'MY-PAGE-'+crypto.randomUUID(),status:'IN_USE',current_holder_id:self}}});
 await loginAs(context,'employee');const ownContracts=await context.request.get('http://localhost:54329/rest/v1/employment_contract?select=id&employee_id=eq.'+self+'&status=in.(SENT,VIEWED)',{headers:{Authorization:'Bearer '+tokenFor('employee')}});const pending=(await ownContracts.json()).length;await page.goto('/me?employee_id='+peer+'&user_id='+peer);
 await expect(page.getByRole('heading',{name:'마이페이지',exact:true})).toBeVisible();await expect(page.locator('.my-page .profile-summary')).toContainText('김테스트');await expect(page.locator('.my-page')).not.toContainText('이동료');
 await expect(page.locator('.my-page').getByRole('link',{name:'내 인사서류',exact:false})).toHaveAttribute('href',`/people/${self}?tab=documents`);
 for(const text of ['900102-1234567','000-test-123','50000000','테스트 전용 주소','PRIVATE-SERIAL-002'])await expect(page.locator('.my-page')).not.toContainText(text);
 await expect(page.locator('.my-page .summary-strip').getByRole('link',{name:`직원 서명 필요 ${pending}건`})).toBeVisible();
 await page.screenshot({path:'docs/screenshots/issue45-my-page.png',fullPage:true});
 for(const width of [768,390]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);}
 await page.screenshot({path:'docs/screenshots/issue45-my-page-mobile.png',fullPage:true});
 await page.goto('/people/'+self+'?tab=assets');await expect(page.getByRole('region',{name:'직원 현재 장비'})).toContainText('My Page test device');await expect(page.locator('main')).not.toContainText('PRIVATE-SERIAL-002');await page.screenshot({path:'docs/screenshots/issue45-own-assets.png',fullPage:true});
 const denied=await context.request.get('http://localhost:54329/rest/v1/asset?select=id,serial_number&current_holder_id=eq.'+peer,{headers:{Authorization:'Bearer '+tokenFor('employee')}});expect(await denied.json()).toEqual([]);
});
test('peer profile hides assets and direct asset tab is denied to employee and team leader',async({page,context})=>{
 for(const role of ['employee','leader','expense']){await loginAs(context,role);await page.goto('/people/'+(role==='expense'?self:peer));await expect(page.getByRole('navigation',{name:'직원 상세 탭'}).getByRole('link',{name:'장비',exact:true})).toHaveCount(0);const response=await page.goto('/people/'+(role==='expense'?self:peer)+'?tab=assets');expect(response?.status()).toBe(404);await expect(page.locator('main')).not.toContainText('PRIVATE-SERIAL-002');}
});
test('additive CEO stays self-scoped and asset manager retains profile access; unlinked admin stays empty',async({page,context})=>{
 await loginAs(context,'ceo');await page.goto('/me?employee_id='+self);await expect(page.locator('.my-page .profile-summary')).toContainText('대표자');await expect(page.locator('.my-page .profile-summary')).not.toContainText('김테스트');await expect(page.locator('.my-page .summary-strip').getByRole('link',{name:'직원 서명 필요 0건'})).toBeVisible();await expect(page.locator('.my-page').getByRole('link',{name:'내 장비',exact:false})).toHaveAttribute('href','/assets/me');
 await loginAs(context,'admin');await page.goto('/me?employee_id='+self);await expect(page.getByText('연결된 직원 정보가 없습니다')).toBeVisible();await expect(page.locator('.my-page')).not.toContainText('김테스트');
 const serial='MY-PAGE-PEER-'+crypto.randomUUID();await context.request.post('http://localhost:54329/rest/v1/rpc/save_asset',{headers:{Authorization:'Bearer '+tokenFor('admin')},data:{p_id:crypto.randomUUID(),p_expected_version:0,p_values:{type:'MONITOR',manufacturer:'DXT',model:'Peer scoped device',serial_number:serial,status:'IN_USE',current_holder_id:peer}}});await page.goto('/admin/employees/'+peer+'?tab=assets');await expect(page.getByRole('region',{name:'직원 현재 장비'})).toContainText(serial);
});
