import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {loginAs,tokenFor} from './fixtures';
import {contractItem} from '../contracts-fixture';

test('deadline register filters, persistence, overdue signing and private decline reason',async({page,context,request})=>{
 const id=randomUUID(),declined=randomUUID();
 const rpc=async(role:string,name:string,data:object)=>request.post(`http://localhost:54329/rest/v1/rpc/${name}`,{headers:{Authorization:`Bearer ${tokenFor(role)}`},data});
 expect((await rpc('designated','create_employment_contracts',{p_items:[contractItem(id),contractItem(declined)],p_template:null})).ok()).toBe(true);
 for(const p_id of [id,declined])for(const p_action of ['READY_TO_SEND','SENT'])expect((await rpc('designated','transition_employment_contract',{p_id,p_version:1,p_action})).ok()).toBe(true);
 await loginAs(context,'admin');await page.goto(`/admin/contracts/${id}`);
 await page.getByLabel('서명 기한 (선택)').fill('2020-01-01');await page.getByRole('button',{name:'서명 기한 저장',exact:true}).click();
 await expect(page.locator('input[name=due_version]')).toHaveValue('1');await page.reload();await expect(page.getByLabel('서명 기한 (선택)')).toHaveValue('2020-01-01');
 await page.goto('/admin/contracts');await page.getByRole('button',{name:/기한 초과/}).click();await expect(page.getByRole('button',{name:/기한 초과/})).toHaveAttribute('aria-pressed','true');
 await expect(page.locator(`a[href="/admin/contracts/${id}"]`)).toBeVisible();await page.getByLabel('계약 검색').fill('2020-01-01');await expect(page.locator(`a[href="/admin/contracts/${id}"]`)).toBeVisible();
 await page.screenshot({path:'docs/screenshots/issue47-contract-register.png',fullPage:true});
 await page.getByLabel('요청일 시작').fill('2099-01-01');await expect(page.locator(`a[href="/admin/contracts/${id}"]`)).toHaveCount(0);
 await loginAs(context,'employee');await page.goto(`/contracts/me/${id}`);await expect(page.getByLabel('서명 기한 (선택)')).toHaveCount(0);
 await page.screenshot({path:'docs/screenshots/issue47-contract-overdue.png',fullPage:true});
 const sign=page.locator('form').filter({has:page.getByRole('button',{name:'직원 서명',exact:true})});await sign.getByRole('checkbox').check();await sign.getByRole('button').click();await expect(page.getByText('직원 서명 완료 · 버전 1',{exact:false})).toBeVisible();
 expect((await rpc('employee','set_contract_due_date',{p_id:id,p_version:1,p_due_version:1,p_due:null})).ok()).toBe(false);
 await page.goto(`/contracts/me/${declined}`);await page.getByLabel('거절 사유 (선택)').fill('PRIVATE-BROWSER-REASON');await page.getByRole('button',{name:'서명 거절',exact:true}).click();await expect(page.getByText('PRIVATE-BROWSER-REASON',{exact:true})).toBeVisible();
 await loginAs(context,'admin');const response=await page.goto(`/admin/contracts/${declined}`);expect(await response!.text()).not.toContain('PRIVATE-BROWSER-REASON');await expect(page.getByText('PRIVATE-BROWSER-REASON',{exact:true})).toHaveCount(0);
 await loginAs(context,'expense');expect((await page.goto(`/contracts/me/${declined}`))?.status()).toBe(404);
});
