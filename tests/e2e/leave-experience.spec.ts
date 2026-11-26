import {test,expect} from '@playwright/test';
import {loginAs,tokenFor} from './fixtures';
test('leave experience distinguishes pending balance and explains holiday and cross-year deductions',async({page,context})=>{
 await loginAs(context,'employee');await page.goto('/leave');
 await expect(page.locator('.leave-summary')).toContainText('대기 고려 예상');await expect(page.locator('.leave-summary')).toContainText('당해연차 부여·양수 정정');
 await expect(page.locator('.leave-summary')).toContainText('사용기간 미확정 잔액');
 await page.goto('/leave/request');await page.getByLabel('시작일',{exact:true}).fill('2026-12-24');await page.getByLabel('종료일',{exact:true}).fill('2026-12-28');
 const preview=page.getByRole('region',{name:'휴가 차감 미리보기'});
 await expect(preview).toContainText('근무일 2일');await expect(preview).toContainText('토·일 제외 2일');await expect(preview).toContainText('평일 공휴일/회사 휴일 제외 1일');
 await expect(preview.getByRole('table')).toContainText('승인 후 예상');
 await page.getByLabel('시작일',{exact:true}).fill('2026-12-31');await page.getByLabel('종료일',{exact:true}).fill('2027-01-04');
 await expect(page.getByLabel('예상 차감일수')).toHaveText('연도별 분리 신청 필요');await expect(page.getByText('선택한 날짜에 사용 가능한 확인된 휴가:',{exact:false})).toHaveCount(0);await expect(preview).toContainText('연도별로 나누어 신청');await expect(preview).toContainText('2026-12-31 – 2026-12-31 · 차감 1일');await expect(preview).toContainText('2027-01-04 – 2027-01-04 · 차감 1일');await expect(page.getByRole('button',{name:'신청하기'})).toBeDisabled();
 await page.screenshot({path:'docs/screenshots/leave-experience-request.png',fullPage:true});
 const denied=await context.request.post('http://localhost:54329/rest/v1/rpc/leave_sources',{headers:{Authorization:'Bearer '+tokenFor('employee')},data:{p_employee:'10000000-0000-4000-8000-000000000002',p_year:2026}});expect(denied.ok()).toBe(false);
 await loginAs(context,'admin');await page.goto('/admin/leave');await page.getByText('사용촉진 대상 · 일정 수동 검토 안내',{exact:true}).click();await expect(page.getByText('현재 화면은 개별 기한 계산·통지 발송·도달 증빙 저장·법적 완료 판정을 지원하지 않습니다.',{exact:false})).toBeVisible();
 await loginAs(context,'leader');await page.goto('/admin/leave');await expect(page.getByRole('heading',{name:'휴가 관리',exact:true})).toHaveCount(0);
});
