import { test,expect,type Page,type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { loginAs,tokenFor } from './fixtures';
const person='10000000-0000-4000-8000-000000000001',colleague='10000000-0000-4000-8000-000000000002',leader='10000000-0000-4000-8000-000000000004';
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'});
const headers=(role:string)=>({Authorization:'Bearer '+tokenFor(role)});
const rpc=(api:APIRequestContext,role:string,name:string,data:unknown)=>api.post('http://localhost:54329/rest/v1/rpc/'+name,{headers:headers(role),data});
async function read(api:APIRequestContext,role:string,table:string,query:string){const response=await api.get('http://localhost:54329/rest/v1/'+table+'?'+query,{headers:headers(role)});expect(response.ok()).toBe(true);return response.json();}
async function rejectedAction(page:Page,button:string){
 const response=page.waitForResponse(r=>r.request().method()==='POST'&&Boolean(r.request().headers()['next-action']));
 await page.getByRole('button',{name:button,exact:true}).click();expect((await response).status()).toBe(404);
}
async function create(api:APIRequestContext,holder=person){
 const id=randomUUID(),serial='HANDOFF-'+id.slice(0,8);
 expect((await rpc(api,'it','save_asset',{p_id:id,p_expected_version:0,p_values:{type:'NOTEBOOK',model:'인계 테스트 노트북',serial_number:serial,status:'IN_USE',current_holder_id:holder}})).ok()).toBe(true);
 const [assignment]=await read(api,'it','asset_assignment','select=id&asset_id=eq.'+id);
 return {id,serial,assignment:assignment.id};
}
async function requestTransfer(api:APIRequestContext,asset:{id:string;assignment:string},role='employee',recipient=colleague){
 const id=randomUUID();expect((await rpc(api,role,'request_asset_transfer',{p_id:id,p_asset:asset.id,p_assignment:asset.assignment,p_recipient:recipient,p_date:today(),p_memo:'브라우저 인계 검증'})).ok()).toBe(true);return id;
}
test('employee registers handoff, recipient confirms, former holder sees only own history, four sections and mobile',async({page,context})=>{
 const a=await create(context.request);
 await loginAs(context,'employee');await page.goto('/assets/me');
 const card=page.locator('.asset-card').filter({hasText:a.serial});
 await card.getByText('다른 직원에게 인계',{exact:true}).click();await card.getByLabel('받을 직원').selectOption(colleague);
 await card.getByLabel('인계 메모 (선택)').fill('충전기와 함께 전달했습니다.');await card.getByRole('button',{name:'인계 등록',exact:true}).click();
 await expect(page.getByRole('status')).toHaveText('처리했습니다.');
 await expect(page.getByRole('region',{name:/현재 장비/})).not.toContainText(a.serial);
 await expect(page.getByRole('region',{name:/인계 확인 대기 중/})).toContainText(a.serial);
 await page.screenshot({path:'docs/screenshots/issue19-outgoing.png',fullPage:true});
 const [transfer]=await read(context.request,'employee','asset_transfer','select=id&asset_id=eq.'+a.id);
 expect((await rpc(context.request,'employee','resolve_asset_transfer',{p_id:transfer.id,p_action:'CONFIRMED',p_force:false})).ok()).toBe(false);
 await loginAs(context,'expense');await page.goto('/assets/me');
 const incoming=page.getByRole('region',{name:/받을 장비/}).locator('.asset-card').filter({hasText:a.serial});
 await expect(incoming).toContainText('충전기와 함께 전달했습니다.');
 await page.screenshot({path:'docs/screenshots/issue19-incoming.png',fullPage:true});
 await incoming.getByText('인수 확인',{exact:true}).click();await incoming.getByRole('button',{name:'인수 확인 완료',exact:true}).click();await expect(page.getByRole('status')).toHaveText('처리했습니다.');
 await expect(page.getByRole('region',{name:/현재 장비/})).toContainText(a.serial);
 expect((await rpc(context.request,'expense','resolve_asset_transfer',{p_id:transfer.id,p_action:'CONFIRMED',p_force:false})).ok()).toBe(true);
 const mine=await read(context.request,'employee','asset_assignment','select=employee_id,state&asset_id=eq.'+a.id);expect(mine).toEqual([{employee_id:person,state:'RETURNED'}]);
 expect(await read(context.request,'employee','asset','select=id&id=eq.'+a.id)).toEqual([]);
 await loginAs(context,'employee');await page.goto('/assets/me/'+a.id+'?employee_id='+colleague);await expect(page.getByRole('region',{name:/과거 장비/})).toContainText(a.serial);
 await page.screenshot({path:'docs/screenshots/issue19-history.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.goto('/assets/me');expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await page.screenshot({path:'docs/screenshots/issue19-mobile.png',fullPage:true});
});
test('manager force confirmation/cancellation and preserved full history stay available',async({page,context})=>{
 const a=await create(context.request);await requestTransfer(context.request,a);
 await loginAs(context,'it');await page.goto('/admin/assets/'+a.id);
 await expect(page.getByRole('button',{name:'장비 저장',exact:true})).toBeDisabled();await expect(page.getByRole('heading',{name:'인계 현황'})).toBeVisible();
 await page.getByText('관리자 강제확정',{exact:true}).click();await page.screenshot({path:'docs/screenshots/issue19-admin-pending.png',fullPage:true});
 await page.getByRole('button',{name:'관리자 강제확정 완료',exact:true}).click();await expect(page.getByRole('status')).toHaveText('저장했습니다.');
 await expect(page.getByLabel('현재 보유자',{exact:true})).toHaveValue(colleague);await expect(page.getByRole('button',{name:'장비 저장',exact:true})).toBeEnabled();
 await page.screenshot({path:'docs/screenshots/issue19-admin-history.png',fullPage:true});
 const [assignment]=await read(context.request,'expense','asset_assignment','select=id&asset_id=eq.'+a.id+'&state=eq.ACTIVE');
 const second=await requestTransfer(context.request,{id:a.id,assignment:assignment.id},'expense',person);
 await page.reload();await page.getByText('인계 취소',{exact:true}).click();await page.getByRole('button',{name:'인계 취소 완료',exact:true}).click();await expect(page.getByRole('status')).toHaveText('저장했습니다.');
 await expect(page.getByLabel('현재 보유자',{exact:true})).toHaveValue(colleague);
 await expect(page.locator('.asset-form input[name=version]')).toHaveValue('5');
 await expect(page.getByRole('button',{name:'장비 저장',exact:true})).toBeEnabled();
 const [transfer]=await read(context.request,'it','asset_transfer','select=state&id=eq.'+second);expect(transfer.state).toBe('CANCELLED');
 await page.getByLabel('현재 보유자',{exact:true}).selectOption('');await page.getByLabel('상태',{exact:true}).selectOption('AVAILABLE');await page.getByRole('button',{name:'장비 저장'}).click();await expect(page.getByRole('status')).toHaveText('저장했습니다.');
 await expect(page.locator('.asset-form input[name=version]')).toHaveValue('6');
 const history=await read(context.request,'it','asset_assignment','select=id,state&asset_id=eq.'+a.id);expect(history).toHaveLength(2);expect(history.every((h:{state:string})=>h.state==='RETURNED')).toBe(true);
});
test('foreign URLs, RSC, query, UUID/RPC and session-switched actions cannot expose or mutate another employee data',async({page,context})=>{
 const a=await create(context.request),id=await requestTransfer(context.request,a);
 for(const role of ['leader','division']){
 await loginAs(context,role);expect((await page.goto('/assets/me/'+a.id))!.status()).toBe(404);
 const rsc=await context.request.get('/assets/me/'+a.id,{headers:{RSC:'1'}});expect(await rsc.text()).not.toContain(a.serial);expect(await rsc.text()).toContain('NEXT_HTTP_ERROR_FALLBACK;404');
 await page.goto('/assets/me?employee_id='+person+'&transfer_id='+id);expect(await page.content()).not.toContain(a.serial);
 expect(await read(context.request,role,'asset_assignment','select=id&employee_id=eq.'+person)).toEqual([]);
 expect(await read(context.request,role,'asset_transfer','select=id&id=eq.'+id)).toEqual([]);
 expect((await rpc(context.request,role,'request_asset_transfer',{p_id:randomUUID(),p_asset:a.id,p_assignment:a.assignment,p_recipient:person,p_date:today(),p_memo:''})).ok()).toBe(false);
 expect((await rpc(context.request,role,'resolve_asset_transfer',{p_id:id,p_action:'CONFIRMED',p_force:false})).ok()).toBe(false);
 expect((await rpc(context.request,role,'resolve_asset_transfer',{p_id:id,p_action:'CONFIRMED',p_force:true})).ok()).toBe(false);
 }
 // Capture an authorized recipient UI, then replay its bound action under the sender session.
 await loginAs(context,'expense');await page.goto('/assets/me/'+a.id);await page.getByText('인수 확인',{exact:true}).click();await loginAs(context,'employee');
 await rejectedAction(page,'인수 확인 완료');
 const own=await create(context.request);await loginAs(context,'employee');await page.goto('/assets/me/'+own.id);await page.getByText('다른 직원에게 인계',{exact:true}).click();await page.getByLabel('받을 직원').selectOption(leader);await loginAs(context,'expense');
 await rejectedAction(page,'인계 등록');
 // Manager controls cannot be replayed by a participant without ASSET_MANAGE.
 await loginAs(context,'it');await page.goto('/admin/assets/'+a.id);await page.getByText('관리자 강제확정',{exact:true}).click();await loginAs(context,'employee');await rejectedAction(page,'관리자 강제확정 완료');
 const [pending]=await read(context.request,'employee','asset_transfer','select=state&id=eq.'+id);expect(pending.state).toBe('PENDING');
 expect(await read(context.request,'it','asset_transfer','select=id&asset_id=eq.'+own.id)).toEqual([]);
});
