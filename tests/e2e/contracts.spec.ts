import { test,expect } from '@playwright/test';
import { loginAs,tokenFor,idFor } from './fixtures';
const own='c0000000-0000-4000-8000-000000000001',other='c0000000-0000-4000-8000-000000000002';
test('contract UUID, history, PDF, forged RPC and private-admin boundaries',async({page,context,request})=>{
 for(const role of ['employee','leader','admin']){
 await loginAs(context,role);
 const response=await page.goto(role==='admin'?`/admin/contracts/${other}`:`/contracts/me/${other}`);
 if(role==='admin'){expect(response?.status()).toBe(200);await expect(page.getByText('본문과 서명·PDF는', {exact:false})).toBeVisible();await expect(page.locator('.contract-document')).toHaveCount(0);}else expect(response?.status()).toBe(404);
 const pdf=await context.request.get(`/api/contracts/${other}/pdf`);expect(pdf.status()).toBe(404);expect(pdf.headers()['cache-control']).toContain('no-store');
 const rpc=await request.post('http://localhost:54329/rest/v1/rpc/sign_employee_contract',{headers:{Authorization:`Bearer ${tokenFor(role)}`},data:{p_id:other,p_version:1,p_hash:'a'.repeat(64),p_consent:true}});expect(rpc.ok()).toBe(false);
 }
 await loginAs(context,'leader');expect((await page.goto('/people/10000000-0000-4000-8000-000000000002?tab=contracts'))?.status()).toBe(404);
});
test('replayed employee Server Action under another account fails before signing',async({page,context})=>{
 await loginAs(context,'employee');await page.goto(`/contracts/me/${own}`);
 await expect(page.getByText('직원 열람 · 버전 1',{exact:false})).toBeVisible();
 const form=page.locator('form').filter({has:page.getByRole('button',{name:'직원 서명',exact:true})});await form.getByRole('checkbox').check();
 await loginAs(context,'expense');await form.getByRole('button').click();await expect(page.getByRole('heading',{name:'페이지를 찾을 수 없습니다'})).toBeVisible();
});
test('employee views/signs, CEO signs, PDF is private and immutable',async({page,context})=>{
 await loginAs(context,'employee');const response=await page.goto(`/contracts/me/${own}`);expect(response?.headers()['cache-control']).toContain('no-store');
 await expect(page.getByText('직원 열람 · 버전 1', {exact:false})).toBeVisible();
 await page.screenshot({path:'docs/screenshots/contracts-employee.png',fullPage:true});
 const employeeForm=page.locator('form').filter({has:page.getByRole('button',{name:'직원 서명',exact:true})});await employeeForm.getByRole('checkbox').check();
 await employeeForm.evaluate(form=>{for(const [name,value] of Object.entries({authenticated_email:'forged@example.test',auth_provider:'github',auth_session_id:'00000000-0000-0000-0000-000000000000'})){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);}});
 await employeeForm.getByRole('button').click();await expect(page.getByText('직원 서명 완료 · 버전 1',{exact:false})).toBeVisible();
 const evidence=await context.request.get(`http://localhost:54329/rest/v1/employment_contract_signature?select=authenticated_email,auth_provider,auth_session_id&contract_id=eq.${own}`,{headers:{Authorization:`Bearer ${tokenFor('employee')}`}});
 expect(await evidence.json()).toEqual([expect.objectContaining({authenticated_email:'verified-employee@example.test',auth_provider:'google',auth_session_id:idFor('employee')})]);
 await loginAs(context,'ceo');await page.goto(`/admin/contracts/${own}`);await page.screenshot({path:'docs/screenshots/contracts-ceo.png',fullPage:true});
 const company=page.locator('form').filter({has:page.getByRole('button',{name:'CEO 회사 서명',exact:true})});await company.getByRole('checkbox').check();await company.getByRole('button').click();
 await expect(page.getByRole('link',{name:'완료 PDF 다운로드'})).toBeVisible({timeout:30000});
 const pdf=await context.request.get(`/api/contracts/${own}/pdf`);expect(pdf.ok()).toBe(true);expect(pdf.headers()['cache-control']).toContain('no-store');expect((await pdf.body()).subarray(0,5).toString()).toBe('%PDF-');
 await page.screenshot({path:'docs/screenshots/contracts-completed.png',fullPage:true});
 await loginAs(context,'expense');expect((await context.request.get(`/api/contracts/${own}/pdf`)).status()).toBe(404);
 await loginAs(context,'employee');await page.goto(`/contracts/me/${own}`);await expect(page.getByRole('link',{name:'완료 PDF 다운로드'})).toBeVisible();await expect(page.getByRole('button',{name:'직원 서명',exact:true})).toHaveCount(0);
});
test('designated admin creates template and bulk drafts, previews/revises before send',async({page,context})=>{
 await loginAs(context,'designated');await page.goto('/admin/contracts');
 await page.getByText('근로계약 양식 관리',{exact:true}).click();await page.getByLabel('양식 이름').fill('기본 근로계약 v1');await page.getByLabel('양식 본문').fill('테스트 전용 계약 조항입니다. 당사자는 내용을 확인합니다.');await page.getByRole('button',{name:'양식 저장',exact:true}).click();await expect(page.getByRole('status')).toContainText('새 양식');
 await page.getByLabel('근로계약 양식',{exact:true}).selectOption({label:'기본 근로계약 v1'});await page.getByLabel('직원 검색').fill('개발');
 await page.locator('.contract-people input').first().check();await page.locator('.contract-people input').nth(1).check();
 await page.getByRole('heading',{name:'근로계약 관리',exact:true}).click();await page.screenshot({path:'docs/screenshots/contracts-admin.png',fullPage:true});
 await page.getByRole('button',{name:'계약 초안 생성'}).click();await expect(page.getByRole('status').filter({hasText:'2건'})).toBeVisible();await page.getByRole('link',{name:'작성한 계약 미리보기'}).click();await expect(page.getByRole('heading',{name:'발송 전 미리보기'})).toBeVisible();
 await page.getByText('본문 수정 · 새 버전 작성',{exact:true}).click();await page.getByLabel('계약본문',{exact:true}).fill('새 버전 테스트 조항');await page.getByRole('button',{name:'새 버전 저장'}).click();await expect(page.getByText('작성 중 · 버전 2',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'미리보기 확인 · 발송 준비'}).click();await expect(page.getByRole('button',{name:'직원 서명 요청',exact:true})).toBeVisible();await page.getByRole('button',{name:'직원 서명 요청',exact:true}).click();await expect(page.getByText('서명 요청 · 버전 2',{exact:false})).toBeVisible();
});

test('signature RPCs expose no client email, provider or session inputs',async({request})=>{
 for(const [role,rpc] of [['employee','sign_employee_contract'],['ceo','sign_company_contract']])for(const [key,value] of Object.entries({p_email:'forged@example.test',p_provider:'google',p_session_id:idFor(role)})){
  const response=await request.post(`http://localhost:54329/rest/v1/rpc/${rpc}`,{headers:{Authorization:`Bearer ${tokenFor(role)}`},data:{p_id:own,p_version:1,p_hash:'a'.repeat(64),p_consent:true,[key]:value}});expect(response.ok()).toBe(false);
 }
});
