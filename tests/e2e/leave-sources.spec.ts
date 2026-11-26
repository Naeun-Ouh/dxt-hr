import {test,expect} from '@playwright/test';
import {loginAs,tokenFor} from './fixtures';
const employee='10000000-0000-4000-8000-000000000001',peer='10000000-0000-4000-8000-000000000002';
test('confirmed sources appear in compact overview and approval deducts substitute then carryover',async({page,context})=>{
 await loginAs(context,'admin');await page.goto('/admin/leave/'+employee);
 for(const bucket of ['SUBSTITUTE','CARRYOVER']){
  await page.getByRole('combobox',{name:'부여 구분',exact:true}).selectOption(bucket);await page.getByLabel('부여 일수',{exact:true}).fill('0.5');await page.getByLabel('확인 근거 · 부여 사유',{exact:true}).fill('Browser verified '+bucket);await page.getByRole('button',{name:'확인된 휴가 부여',exact:true}).click();await expect(page.getByRole('status')).toHaveText('저장했습니다.');await expect(page.getByRole('table').filter({hasText:'사용 기간'})).toContainText('Browser verified '+bucket);
 }
 await expect(page.getByRole('table').filter({hasText:'사용 기간'})).toContainText('Browser verified SUBSTITUTE');await page.screenshot({path:'docs/screenshots/phase4b-sources-admin.png',fullPage:true});
 await loginAs(context,'employee');await page.goto('/leave/request');await page.getByLabel('시작일',{exact:true}).fill('2026-11-16');await page.getByLabel('종료일',{exact:true}).fill('2026-11-17');await page.getByRole('button',{name:'신청하기'}).click();await expect(page.getByRole('status')).toHaveText('저장했습니다.');const id=page.url().split('/').at(-1)!.split('?')[0];
 await loginAs(context,'leader');await page.goto('/leave/requests/'+id);await page.getByRole('button',{name:'승인',exact:true}).click();await expect(page.getByRole('button',{name:'승인 취소',exact:true})).toBeVisible();
 const result=await context.request.get('http://localhost:54329/rest/v1/leave_ledger?select=bucket,amount_delta&request_id=eq.'+id,{headers:{Authorization:'Bearer '+tokenFor('employee')}});const rows=await result.json();expect(rows.map((r:{bucket:string})=>r.bucket).sort()).toEqual(['ANNUAL','CARRYOVER','SUBSTITUTE']);
 await loginAs(context,'employee');await page.goto('/leave');await expect(page.locator('.leave-summary')).toContainText('대체휴가');await page.screenshot({path:'docs/screenshots/phase4b-source-overview.png',fullPage:true});
});
test('birthday half request uses a separate annual benefit and cross-user sources stay private',async({page,context})=>{
 await loginAs(context,'employee');await page.goto('/leave/request');await page.getByRole('combobox',{name:'휴가 구분',exact:true}).selectOption('BIRTHDAY');await expect(page.getByRole('combobox',{name:'휴가 유형',exact:true})).toHaveValue('AM_HALF');await page.getByLabel('시작일',{exact:true}).fill('2026-01-02');await page.getByLabel('미리 신청하지 못한 사유',{exact:true}).fill('Synthetic retrospective birthday');await page.screenshot({path:'docs/screenshots/phase4b-birthday-request.png',fullPage:true});await page.getByRole('button',{name:'신청하기'}).click();await expect(page.getByRole('status')).toHaveText('저장했습니다.');await expect(page.locator('.leave-detail')).toContainText('생일');
 await page.goto('/leave/request');await page.getByRole('combobox',{name:'휴가 구분',exact:true}).selectOption('BIRTHDAY');await page.getByLabel('시작일',{exact:true}).fill('2026-01-08');await page.getByLabel('미리 신청하지 못한 사유',{exact:true}).fill('Duplicate');await page.getByRole('button',{name:'신청하기'}).click();await expect(page.locator('.form-error')).toContainText('이미 신청');
 const denied=await context.request.post('http://localhost:54329/rest/v1/rpc/leave_sources',{headers:{Authorization:'Bearer '+tokenFor('employee')},data:{p_employee:peer,p_year:2026}});expect(denied.ok()).toBe(false);
 for(const role of ['employee','leader','expense','it','division']){const forged=await context.request.post('http://localhost:54329/rest/v1/rpc/grant_leave_source',{headers:{Authorization:'Bearer '+tokenFor(role)},data:{p_id:crypto.randomUUID(),p_employee:employee,p_year:2026,p_bucket:'SUBSTITUTE',p_days:99,p_reason:'forged',p_version:1}});expect(forged.ok()).toBe(false);}
});

test('request-date balance and bounded receiving-year grants are visible; invented birthday exceptions are blocked',async({page,context})=>{
 await loginAs(context,'employee');await page.goto('/leave');await expect(page.locator('.leave-summary')).toContainText('원장 잔액');await expect(page.locator('.leave-summary')).toContainText('현재 사용 가능');
 await page.goto('/leave/request');await page.getByLabel('시작일',{exact:true}).fill('2027-01-04');await expect(page.getByText('선택한 날짜에 사용 가능한 확인된 휴가: 0일.',{exact:false})).toBeVisible();
 await page.getByRole('combobox',{name:'휴가 구분',exact:true}).selectOption('BIRTHDAY');await page.getByLabel('시작일',{exact:true}).fill('2027-02-02');await page.getByLabel('프로젝트 예외 사유 (해당 시)',{exact:true}).fill('Unverified claim');await page.getByRole('button',{name:'신청하기'}).click();await expect(page.locator('.form-error')).toContainText('참여한 프로젝트');
 await loginAs(context,'admin');await page.goto('/admin/leave/'+employee+'?year=2027');await expect(page.getByText('2027년은 사용 연도(이월은 수령 연도)',{exact:false})).toBeVisible();
});
