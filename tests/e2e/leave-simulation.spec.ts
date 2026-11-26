import {test,expect} from '@playwright/test';
import {loginAs,tokenFor} from './fixtures';
const criteria={asOf:'2027-01-01',year:2027,policyReference:'',rounding:'UNKNOWN',evidence:[]};
test('annual simulation preserves ledger, distinguishes unknowns and exports only current reviewed inputs',async({page,context,baseURL})=>{
 await loginAs(context,'admin');
 const raw=()=>context.request.get('http://localhost:54329/rest/v1/leave_ledger?select=id,employee_id,year,amount_delta&order=id.asc',{headers:{Authorization:`Bearer ${tokenFor('admin')}`}}).then(r=>r.json());const before=await raw();const employees=await context.request.get('http://localhost:54329/rest/v1/employee?select=id',{headers:{Authorization:`Bearer ${tokenFor('admin')}`}}).then(r=>r.json());
 await page.goto('/admin/leave/simulation');await page.getByRole('button',{name:'시뮬레이션 실행',exact:true}).click();await expect(page.getByRole('region',{name:'연차 시뮬레이션 결과'})).toBeVisible();await expect(page.getByRole('region',{name:'연차 시뮬레이션 결과'}).getByRole('cell',{name:'미확정',exact:true}).first()).toBeVisible();
 await page.screenshot({path:'docs/screenshots/leave-simulation-2027.png',fullPage:true});
 const response=await context.request.post('/api/leave-simulation',{headers:{Origin:baseURL!},data:criteria});expect(response.ok()).toBe(true);expect(response.headers()['cache-control']).toContain('no-store');const data=await response.json();expect(data.report.applyAuthorized).toBe(false);expect(data.report.rows.length).toBe(employees.length);expect(data.report.rows.every((r:{candidate:null;blockers:string[]})=>r.candidate===null&&r.blockers.length>0)).toBe(true);
 const mismatch=await context.request.post('/api/leave-simulation?format=xlsx',{headers:{Origin:baseURL!,'X-Preview-Sha256':'0'.repeat(64)},data:criteria});expect(mismatch.status()).toBe(409);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Excel 내보내기'}).click();expect((await download).suggestedFilename()).toContain('dry-run.xlsx');
 await page.getByLabel('미확정 항목과 원본 대사 결과를 검토했습니다.',{exact:false}).check();await expect(page.getByText('검토 표시만 완료했습니다.',{exact:false})).toBeVisible();
 await page.getByLabel('검증 기준일').fill('2027-02-01');await expect(page.getByRole('region',{name:'연차 시뮬레이션 결과'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Excel 내보내기'})).toBeDisabled();
 await page.getByRole('button',{name:'시뮬레이션 실행',exact:true}).click();await expect(page.getByRole('region',{name:'연차 시뮬레이션 결과'})).toBeVisible();
 await page.getByRole('button',{name:'근거 상세'}).first().click();await expect(page.getByRole('dialog')).toContainText('원장에 저장되지 않습니다');await page.screenshot({path:'docs/screenshots/leave-simulation-evidence.png',fullPage:true});await page.keyboard.press('Escape');
 expect(await raw()).toEqual(before);
 await loginAs(context,'employee');await page.getByRole('button',{name:'시뮬레이션 실행',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'접근할 수 없습니다'})).toBeVisible();
});
test('simulation denies employee/team/specialist/anonymous access and forged export or identities',async({page,context,baseURL})=>{
 for(const role of ['employee','leader','expense','it','division','combined']){await loginAs(context,role);expect((await page.goto('/admin/leave/simulation'))?.status()).toBe(404);for(const url of ['/api/leave-simulation','/api/leave-simulation?format=xlsx']){const r=await context.request.post(url,{headers:{Origin:baseURL!},data:{...criteria,employee_id:'forged',role:'CEO'}});expect(r.status()).toBe(404);expect(r.headers()['cache-control']).toContain('no-store');}}
 await context.clearCookies();expect((await context.request.post('/api/leave-simulation',{headers:{Origin:baseURL!},data:criteria})).status()).toBe(404);
 await loginAs(context,'admin');expect((await context.request.post('/api/leave-simulation',{headers:{Origin:'https://other.example'},data:criteria})).status()).toBe(403);
 expect((await context.request.post('/api/leave-simulation',{headers:{Origin:baseURL!},data:{...criteria,employee_id:'forged'}})).status()).toBe(400);
});
