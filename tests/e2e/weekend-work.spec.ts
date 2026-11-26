import {test,expect} from '@playwright/test';
import {loginAs,tokenFor} from './fixtures';
import {randomUUID} from 'node:crypto';
test('weekend evidence registration and team review preserve no-grant notice and own isolation',async({page,context})=>{
 await loginAs(context,'employee');await page.goto('/leave/weekend-work');await page.getByRole('button',{name:'주말근무 등록',exact:true}).click();
 await page.getByLabel('근무일',{exact:true}).fill('2026-10-03');await page.getByLabel('근무 내용',{exact:true}).fill('WEEKEND-SYNTHETIC-PRIVATE');await page.getByRole('button',{name:'검토 요청'}).click();await expect(page.getByRole('status')).toContainText('근무 내역을 등록했습니다');await page.getByRole('button',{name:'주말근무 등록 닫기'}).click();
 const row=page.getByRole('row').filter({hasText:'WEEKEND-SYNTHETIC-PRIVATE'});await expect(row).toContainText('480분');await expect(row).toContainText('대기');await page.screenshot({path:'docs/screenshots/weekend-own.png',fullPage:true});
 await loginAs(context,'expense');await page.goto('/leave/weekend-work');await expect(page.getByText('WEEKEND-SYNTHETIC-PRIVATE')).toHaveCount(0);expect((await page.goto('/leave/weekend-work/approvals'))!.status()).toBe(404);
 await loginAs(context,'leader');await page.goto('/leave/weekend-work/approvals');await expect(page.getByText('대휴 잔액·임금에는 반영하지 않습니다.',{exact:false})).toBeVisible();await page.getByRole('row').filter({hasText:'WEEKEND-SYNTHETIC-PRIVATE'}).getByRole('button',{name:'근무 확인',exact:true}).click();await expect(page.getByRole('row').filter({hasText:'WEEKEND-SYNTHETIC-PRIVATE'})).toContainText('승인');await page.screenshot({path:'docs/screenshots/weekend-review.png',fullPage:true});
 await loginAs(context,'employee');await page.goto('/leave/weekend-work');await expect(page.getByRole('row').filter({hasText:'WEEKEND-SYNTHETIC-PRIVATE'}).getByRole('button',{name:'신청 취소'})).toHaveCount(0);
});
test('direct weekend RPC and RLS reject wrong owner/reviewer and leader self-approval',async({request})=>{
 const rpc=(role:string,name:string,data:unknown)=>request.post('http://localhost:54329/rest/v1/rpc/'+name,{headers:{Authorization:'Bearer '+tokenFor(role)},data});
 const id=randomUUID();expect((await rpc('leader','submit_weekend_work',{p_id:id,p_day:'2026-10-04',p_start:540,p_end:1080,p_break:60,p_project:null,p_reason:'LEADER-WEEKEND-PRIVATE'})).ok()).toBeTruthy();
 for(const role of ['leader','admin','employee'])expect((await rpc(role,'decide_weekend_work',{p_id:id,p_version:1,p_action:'APPROVED'})).ok()).toBeFalsy();
 expect((await rpc('employee','decide_weekend_work',{p_id:id,p_version:1,p_action:'CANCELLED'})).ok()).toBeFalsy();
 const peer=await request.get('http://localhost:54329/rest/v1/weekend_work?select=reason&id=eq.'+id,{headers:{Authorization:'Bearer '+tokenFor('employee')}});expect(await peer.json()).toEqual([]);
 expect((await rpc('leader','decide_weekend_work',{p_id:id,p_version:1,p_action:'CANCELLED'})).ok()).toBeTruthy();
});
