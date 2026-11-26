import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {loginAs,tokenFor} from './fixtures';
test('manager previews and reconciles synthetic weekend benefit; reversal preserves evidence',async({page,context})=>{
 const id=randomUUID();const rpc=(role:string,name:string,data:unknown)=>context.request.post('http://localhost:54329/rest/v1/rpc/'+name,{headers:{Authorization:'Bearer '+tokenFor(role)},data});
 expect((await rpc('employee','submit_weekend_work',{p_id:id,p_day:'2026-09-12',p_start:540,p_end:1080,p_break:60,p_project:null,p_reason:'BENEFIT-UI-SYNTHETIC'})).ok()).toBeTruthy();
 expect((await rpc('leader','decide_weekend_work',{p_id:id,p_version:1,p_action:'APPROVED'})).ok()).toBeTruthy();
 await loginAs(context,'admin');await page.goto('/admin/leave/benefits');
 await page.getByRole('combobox',{name:'반영할 근거',exact:true}).selectOption(id);await page.getByRole('button',{name:'반영 미리보기',exact:true}).click();
 await expect(page.getByRole('heading',{name:'반영 계획',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'확인한 계획 반영'})).toBeDisabled();
 await page.getByRole('combobox',{name:'반영할 근거',exact:true}).selectOption('');await expect(page.getByRole('heading',{name:'반영 계획',exact:true})).toHaveCount(0);
 await page.getByRole('combobox',{name:'반영할 근거',exact:true}).selectOption(id);await page.getByRole('button',{name:'반영 미리보기',exact:true}).click();
 await page.getByRole('checkbox',{name:'원본 근무·연말 내역과 기지급 재원을 대조했습니다.'}).check();await page.getByRole('checkbox',{name:'회사 복지 재원이며 임금·수당 대체가 아님을 확인했습니다.'}).check();
 await page.getByRole('textbox',{name:'대조 근거 · 반영 사유',exact:true}).fill('SYNTHETIC-BENEFIT-RECONCILED');await page.screenshot({path:'docs/screenshots/leave-benefit-preview.png',fullPage:true});await page.getByRole('button',{name:'확인한 계획 반영'}).click();await expect(page.getByRole('status')).toContainText('확인된 재원을 반영했습니다.');
 const row=page.getByRole('row').filter({hasText:'SYNTHETIC-BENEFIT-RECONCILED'});await expect(row).toContainText('회사 복지 대휴');await row.getByText('반영 정정',{exact:true}).click();await row.getByRole('textbox',{name:'정정 근거',exact:true}).fill('SYNTHETIC-BENEFIT-REVERSAL');await row.getByRole('button',{name:'미사용 반영 정정'}).click();await expect(row).toContainText('정정 완료 · 원본 보존');
 const workRow=page.getByRole('row').filter({hasText:'2026-09-12'});await workRow.getByText('승인 취소',{exact:true}).click();await workRow.getByRole('textbox',{name:'승인 취소 근거',exact:true}).fill('SYNTHETIC-CORRECT-WORK');await workRow.getByRole('button',{name:'근무 승인 취소 확인'}).click();await expect(workRow).toHaveCount(0);
 for(const role of ['employee','leader','expense','it']){await loginAs(context,role);expect((await page.goto('/admin/leave/benefits'))?.status()).toBe(404);expect((await rpc(role,'preview_leave_benefit',{p_kind:'WEEKEND',p_reference:id,p_source:null})).ok()).toBe(false);expect((await rpc(role,'reverse_leave_benefit',{p_operation:randomUUID(),p_version:1,p_reason:'FORGED-REVIEW'})).ok()).toBe(false);}
});
