import { test,expect } from '@playwright/test';
import { loginAs,tokenFor } from './fixtures';
const asset='90000000-0000-4000-8000-000000000001',other='90000000-0000-4000-8000-000000000002',license='91000000-0000-4000-8000-000000000001',account='91000000-0000-4000-8000-000000000002';
const person='10000000-0000-4000-8000-000000000001',colleague='10000000-0000-4000-8000-000000000002';
const key='AAAAA-BBBBB-CCCCC-DDDDD-2PQGP',password='fixture-only-password-42';
test('asset and vault Figma screens stay masked, employee detail is owner-scoped, empty and mobile states work',async({page,context})=>{
 await loginAs(context,'it');for(const [path,shot] of [['/admin/assets','assets'],['/admin/windows-licenses','windows'],['/admin/accounts','accounts']]){const response=await page.goto(path);const html=await response!.text();expect(html).not.toContain(key);expect(html).not.toContain(password);await page.screenshot({path:`docs/screenshots/phase6-${shot}.png`,fullPage:true});}
 await page.goto('/admin/assets');await page.getByLabel('모델/SN/보유자 검색').fill('없는 장비');await page.getByRole('button',{name:'검색',exact:true}).click();await expect(page.getByText('조건에 맞는 장비가 없습니다.')).toBeVisible();
 await loginAs(context,'employee');await page.goto('/assets/me?employee_id='+colleague);await expect(page.getByText('C02X9K2A',{exact:true})).toBeVisible();await expect(page.getByText('PRIVATE-SERIAL-002')).toHaveCount(0);await expect(page.getByRole('link',{name:'장비 등록'})).toHaveCount(0);await page.screenshot({path:'docs/screenshots/phase6-my-assets.png',fullPage:true});
 expect((await page.goto('/assets/me/'+other))!.status()).toBe(404);
 const rsc=await context.request.get('/assets/me/'+other,{headers:{RSC:'1'}});expect(await rsc.text()).not.toContain('PRIVATE-SERIAL-002');expect(await rsc.text()).toContain('NEXT_HTTP_ERROR_FALLBACK;404');
 await page.setViewportSize({width:390,height:844});await page.goto('/assets/me');expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await page.screenshot({path:'docs/screenshots/phase6-my-assets-mobile.png',fullPage:true});
 await loginAs(context,'division');await page.goto('/assets/me');await expect(page.getByRole('heading',{name:'지급된 장비가 없습니다'})).toBeVisible();
});
test('equipment create, update, transfer, return, history, stale edits and safe deletion',async({page,context})=>{
 await loginAs(context,'it');await page.goto('/admin/assets/new');await page.getByLabel('Serial Number',{exact:true}).fill('BROWSER-TRANSFER');await page.getByLabel('모델 (선택)').fill('Browser Notebook');await page.getByLabel('상태',{exact:true}).selectOption('IN_USE');await page.getByLabel('현재 보유자',{exact:true}).selectOption(person);await page.getByRole('button',{name:'장비 저장'}).click();await expect(page.getByRole('status')).toHaveText('저장했습니다.');const path=new URL(page.url()).pathname;
 const stale=await context.newPage();await stale.goto(path);
 await page.getByLabel('현재 보유자',{exact:true}).selectOption(colleague);await page.getByRole('button',{name:'장비 저장'}).click();await expect(page.getByRole('status')).toHaveText('저장했습니다.');await expect(page.getByRole('cell',{name:'현재 보유',exact:true})).toHaveCount(1);
 await stale.getByRole('button',{name:'장비 저장'}).click();await expect(stale.locator('.form-error[role=alert]')).toBeVisible();await stale.close();
 await page.getByLabel('현재 보유자',{exact:true}).selectOption('');await page.getByLabel('상태',{exact:true}).selectOption('AVAILABLE');await page.getByRole('button',{name:'장비 저장'}).click();await expect(page.getByRole('cell',{name:'현재 보유',exact:true})).toHaveCount(0);
 await page.screenshot({path:'docs/screenshots/phase6-asset-history.png',fullPage:true});await page.locator('.delete-record summary').click();await page.getByRole('button',{name:'삭제 확인'}).click();await expect(page.locator('.form-error[role=alert]')).toContainText('이력');
 await page.goto('/admin/assets/new');await page.getByLabel('Serial Number',{exact:true}).fill('BROWSER-DELETE');await page.getByRole('button',{name:'장비 저장'}).click();await expect(page.getByRole('status')).toHaveText('저장했습니다.');await page.locator('.delete-record summary').click();await page.getByRole('button',{name:'삭제 확인'}).click();await expect(page).toHaveURL('/admin/assets');
});
test('Windows and account create, deliberate reveal, hide, edit without secret replacement and delete',async({page,context})=>{
 await loginAs(context,'it');for(const kind of ['windows-licenses','accounts']){
 const isWindows=kind==='windows-licenses',base='/admin/'+kind,secret=isWindows?'11111-22222-33333-44444-55555':'browser-secret with spaces';
 await page.goto(base+'/new');await page.getByLabel(isWindows?'Edition / 제품':'서비스명').fill(isWindows?'Windows migration test':'Service test');if(!isWindows){await page.getByLabel('로그인 ID').fill('migration@example.test');await page.getByLabel('URL (선택)').fill('https://example.test');}
 await page.getByLabel(isWindows?'제품키':'비밀번호',{exact:true}).fill(secret);await page.getByRole('button',{name:isWindows?'라이선스 저장':'계정 저장'}).click();await expect(page.getByRole('status')).toHaveText('저장했습니다.');const path=new URL(page.url()).pathname;
 expect(await page.content()).not.toContain(secret);await page.getByRole('button',{name:'전체 값 보기'}).click();await expect(page.locator('.secret-reveal code')).toHaveText(secret);await page.getByRole('button',{name:'숨기기',exact:true}).click();await expect(page.locator('.secret-reveal code')).not.toHaveText(secret);
 await page.getByLabel('메모 (선택)').fill('Updated metadata');await page.getByRole('button',{name:isWindows?'라이선스 저장':'계정 저장'}).click();await expect(page.locator('.asset-form input[name=version]')).toHaveValue('2');await page.getByRole('button',{name:'전체 값 보기'}).click();await expect(page.locator('.secret-reveal code')).toHaveText(secret);
 await page.reload();expect(await page.content()).not.toContain(secret);await page.locator('.delete-record summary').click();await page.getByRole('button',{name:'삭제 확인'}).click();await expect(page).toHaveURL(base);expect((await page.goto(path))!.status()).toBe(404);
 }
});
test('cross-role URLs, APIs, RPCs, RSC and replayed reveal/save actions reject secret access',async({page,context})=>{
 for(const role of ['employee','leader','expense','division']){await loginAs(context,role);for(const path of ['/admin/windows-licenses/'+license,'/admin/accounts/'+account,'/admin/assets/'+asset]){const response=await page.goto(path);expect(response!.status()).toBe(404);expect(await response!.text()).not.toContain(key);expect(await response!.text()).not.toContain(password);const rsc=await context.request.get(path,{headers:{RSC:'1'}});expect(await rsc.text()).not.toContain(key);expect(await rsc.text()).not.toContain(password);}
 const direct=await context.request.post('http://localhost:54329/rest/v1/rpc/reveal_vault_entry',{headers:{Authorization:'Bearer '+tokenFor(role)},data:{p_id:license,p_kind:'windows'}});expect(direct.ok()).toBe(false);
 const metadata=await context.request.get('http://localhost:54329/rest/v1/vault_entry?select=id',{headers:{Authorization:'Bearer '+tokenFor(role)}});expect(await metadata.json()).toEqual([]);
 }
 for(const role of ['admin','ceo']){await loginAs(context,role);await page.goto('/admin/accounts/'+account);await expect(page.getByRole('button',{name:'전체 값 보기'})).toHaveCount(0);expect(await page.content()).not.toContain(password);}
 for(const [path,button] of [['/admin/windows-licenses/'+license,'전체 값 보기'],['/admin/accounts/'+account,'전체 값 보기'],['/admin/assets/'+asset,'장비 저장']]){
 await loginAs(context,'it');await page.goto(path);await loginAs(context,'expense');
 await page.route('**/admin/**',async route=>{if(!route.request().headers()['next-action'])return route.continue();const response=await route.fetch();const body=await response.text();expect(body).toContain('NEXT_HTTP_ERROR_FALLBACK;404');expect(body).not.toContain(key);expect(body).not.toContain(password);await route.fulfill({response});});
 await page.getByRole('button',{name:button,exact:true}).click();await expect(page.getByRole('heading',{name:'페이지를 찾을 수 없습니다'})).toBeVisible();await page.unroute('**/admin/**');
 }
});
