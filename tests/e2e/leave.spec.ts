import {test,expect} from '@playwright/test';
import {loginAs,tokenFor} from './fixtures';
const own='b0000000-0000-4000-8000-000000000001',peer='b0000000-0000-4000-8000-000000000002',outside='b0000000-0000-4000-8000-000000000003';
const employee='10000000-0000-4000-8000-000000000001',colleague='10000000-0000-4000-8000-000000000002';
test('basic leave Figma screens, drawer, past-date state and mobile rendering',async({page,context})=>{
 await loginAs(context,'employee');
 for(const [path,shot] of [['/leave','overview'],['/leave/request','request'],['/leave/team-calendar?month=2026-10','calendar']]){
  const response=await page.goto(path);expect(response!.status()).toBe(200);expect(await response!.text()).not.toContain('PEER-LEAVE-SECRET');expect(await response!.text()).not.toContain('CALENDAR-PRIVATE-REASON');await page.screenshot({path:'docs/screenshots/phase4a-'+shot+'.png',fullPage:true});
 }
 await page.goto('/leave/request');await page.getByLabel('시작일',{exact:true}).fill('2026-10-05');await expect(page.getByLabel('미리 신청하지 못한 사유',{exact:true})).toBeVisible();await page.screenshot({path:'docs/screenshots/phase4a-past-date.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await page.locator('.navigation-panel > summary').click();await page.getByRole('button',{name:'신청하기'}).scrollIntoViewIfNeeded();await page.evaluate(async()=>{await document.fonts.ready;await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));});await page.setViewportSize({width:390,height:1600});await page.evaluate(()=>window.scrollTo(0,0));await page.locator('main').screenshot({path:'docs/screenshots/phase4a-mobile.png'});await page.setViewportSize({width:1440,height:1308});
 await loginAs(context,'leader');await page.goto('/leave/approvals');await page.screenshot({path:'docs/screenshots/phase4a-approvals.png',fullPage:true});await page.goto('/leave/approvals?request='+own);await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('dialog')).toContainText('OWN-LEAVE-REASON');await page.screenshot({path:'docs/screenshots/phase4a-detail.png',fullPage:true});await page.getByRole('link',{name:'상세 닫기'}).click();
 await loginAs(context,'admin');await page.goto('/admin/leave');await page.screenshot({path:'docs/screenshots/phase4a-admin.png',fullPage:true});await page.goto('/admin/leave/'+employee);await expect(page.getByLabel('조정 사유',{exact:true})).toBeVisible();
});
test('same-day halves, past explanation and leader automatic approval create real history',async({page,context})=>{
 await loginAs(context,'employee');await page.goto('/leave/request');await page.getByRole('combobox',{name:'휴가 유형',exact:true}).selectOption('AM_HALF');await page.getByLabel('신청 사유 (선택)',{exact:true}).fill('Browser own half');await page.getByRole('button',{name:'신청하기'}).click();await expect(page.getByRole('status')).toHaveText('저장했습니다.');await expect(page.locator('.leave-detail')).toContainText('대기');
 await page.goto('/leave/request');await page.getByRole('combobox',{name:'휴가 유형',exact:true}).selectOption('PM_HALF');await page.getByRole('button',{name:'신청하기'}).click();await expect(page.getByRole('status')).toHaveText('저장했습니다.');
 await page.goto('/leave/request');await page.getByLabel('시작일',{exact:true}).fill('2026-10-05');await page.getByLabel('종료일',{exact:true}).fill('2026-10-05');await page.getByRole('button',{name:'신청하기'}).click();await expect(page.getByLabel('미리 신청하지 못한 사유',{exact:true})).toBeFocused();await page.getByLabel('미리 신청하지 못한 사유',{exact:true}).fill('Browser late explanation');await page.getByRole('button',{name:'신청하기'}).click();await expect(page.locator('.leave-detail')).toContainText('Browser late explanation');
 await loginAs(context,'leader');await page.goto('/leave/request');await page.getByRole('button',{name:'신청하기'}).click();await expect(page.locator('.leave-detail')).toContainText('팀장 자동 승인');await page.goto('/leave');await expect(page.locator('.leave-summary')).toContainText('14일');
});
test('approval, cancellation reversal, bulk rejection and admin versioned adjustment',async({page,context})=>{
 await loginAs(context,'leader');await page.goto('/leave/approvals?request='+own);await page.getByRole('dialog').getByRole('button',{name:'승인',exact:true}).click();await expect(page.getByRole('dialog').getByRole('button',{name:'승인 취소',exact:true})).toBeVisible();
 await loginAs(context,'employee');await page.goto('/leave/requests/'+own);await expect(page.getByText('승인된 휴가는 직접 취소할 수 없습니다. 팀장 또는 관리자에게 요청해 주세요.')).toBeVisible();await expect(page.getByRole('button',{name:'승인 취소',exact:true})).toHaveCount(0);
 await loginAs(context,'leader');await page.goto('/leave/requests/'+own);await page.getByRole('button',{name:'승인 취소',exact:true}).click();await page.getByRole('button',{name:'취소 확인',exact:true}).click();await expect(page.locator('.leave-detail .asset-badge')).toHaveText('취소');
 await page.goto('/leave/approvals');await page.getByLabel('전체 선택',{exact:true}).check();await page.getByRole('button',{name:'일괄 거절',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('새롭게 휴가를 신청');await page.getByLabel('거절 사유 (선택)',{exact:true}).fill('Browser bulk decision');await page.getByRole('button',{name:'거절 확인',exact:true}).click();await expect(page.getByText('승인 대기 중인 휴가가 없습니다.')).toBeVisible();
 await loginAs(context,'admin');await page.goto('/admin/leave/'+employee);const old=await page.locator('input[name=version]').inputValue();await page.getByLabel('조정 일수',{exact:true}).fill('1');await page.getByLabel('조정 사유',{exact:true}).fill('Browser annual adjustment');await page.getByRole('button',{name:'조정 저장'}).click();await expect(page.getByRole('status')).toHaveText('저장했습니다.');await expect(page.locator('.leave-ledger')).toContainText('Browser annual adjustment');
 await page.locator('input[name=version]').evaluate((el,value)=>{(el as HTMLInputElement).value=value;},old);await page.getByLabel('조정 일수',{exact:true}).fill('1');await page.getByLabel('조정 사유',{exact:true}).fill('must not duplicate');await page.getByRole('button',{name:'조정 저장'}).click();await expect(page.locator('.form-error')).toContainText('새로고침');await expect(page.locator('.leave-ledger')).not.toContainText('must not duplicate');
});
test('forged URLs/RPCs and peer calendar responses enforce private ownership and bulk team scope',async({page,context})=>{
 await loginAs(context,'employee');
 for(const path of ['/leave/requests/'+peer,'/leave/requests/'+outside,'/admin/leave/'+colleague,'/leave/approvals?request='+peer]){
  expect((await page.goto(path))!.status()).toBe(404);
  const rsc=await context.request.get(path,{headers:{RSC:'1'}});expect(await rsc.text()).not.toContain('PEER-LEAVE-SECRET');
 }
 const headers={Authorization:'Bearer '+tokenFor('employee')};
 const balance=await context.request.post('http://localhost:54329/rest/v1/rpc/leave_summary',{headers,data:{p_employee:colleague,p_year:2026}});expect(balance.ok()).toBe(false);
 const ledger=await context.request.get('http://localhost:54329/rest/v1/leave_ledger?select=id,employee_id,note&employee_id=eq.'+colleague,{headers});expect(await ledger.json()).toEqual([]);
 const calendar=await context.request.post('http://localhost:54329/rest/v1/rpc/leave_calendar',{headers,data:{p_month:'2026-10-01'}});const rows=await calendar.json();expect(rows.length).toBeGreaterThan(0);for(const row of rows)expect(Object.keys(row).sort()).toEqual(['end_date','name','start_date','unit']);
 const mixed=await context.request.post('http://localhost:54329/rest/v1/rpc/review_leave',{headers:{Authorization:'Bearer '+tokenFor('leader')},data:{p_items:[{id:outside,version:1},{id:peer,version:1}],p_action:'APPROVED',p_note:''}});expect(mixed.ok()).toBe(false);
 for(const role of ['employee','expense','it','division']){await loginAs(context,role);expect((await page.goto('/admin/leave'))!.status()).toBe(404);const forged=await context.request.post('http://localhost:54329/rest/v1/rpc/adjust_leave',{headers:{Authorization:'Bearer '+tokenFor(role)},data:{p_employee:employee,p_year:2026,p_delta:99,p_reason:'forged',p_version:1}});expect(forged.ok()).toBe(false);}
});
test('role-switch replay cannot use an already-open admin leave adjustment',async({page,context})=>{
 await loginAs(context,'admin');await page.goto('/admin/leave/'+employee);await page.getByLabel('조정 일수',{exact:true}).fill('1');await page.getByLabel('조정 사유',{exact:true}).fill('REPLAY-MUST-NOT-SAVE');await loginAs(context,'expense');
 let rejected=false;await page.route('**/admin/**',async route=>{if(!route.request().headers()['next-action'])return route.continue();const response=await route.fetch();const body=await response.text();expect(body).toContain('NEXT_HTTP_ERROR_FALLBACK;404');rejected=true;await route.fulfill({response});});await page.getByRole('button',{name:'조정 저장'}).click();await expect.poll(()=>rejected).toBe(true);
 await page.unroute('**/admin/**');await loginAs(context,'admin');await page.goto('/admin/leave/'+employee);await expect(page.locator('.leave-ledger')).not.toContainText('REPLAY-MUST-NOT-SAVE');
});
