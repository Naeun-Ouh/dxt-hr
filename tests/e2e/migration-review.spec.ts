import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
import {loginAs} from './fixtures';
test('private administrator reviews synthetic source and changes invalidate review',async({page,context})=>{
 await loginAs(context,'designated');await page.goto('/admin/migration-review');
 const source=Buffer.from(JSON.stringify([{key:'TEST-asset',sheet:'TEST Assets',row:2,employeeKey:'TEST-person',asset:{type:'NOTEBOOK',status:'IN_USE',manufacturer:'TEST',model:'TEST',serial_number:'TEST-UI-35'}}]));await page.getByLabel('원본 파일',{exact:false}).setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:source});
 await page.getByRole('button',{name:'이 원본을 검증 기준으로 지정'}).click();
 await page.getByRole('textbox',{name:'원본 직원 키',exact:true}).fill('TEST-person');await page.getByRole('combobox',{name:'연결할 직원'}).selectOption('10000000-0000-4000-8000-000000000001');await page.getByRole('button',{name:'직원 연결 추가'}).click();await page.getByRole('spinbutton',{name:'원본 행 수',exact:true}).fill('1');await page.getByRole('spinbutton',{name:'장비 수',exact:true}).fill('1');
 await page.getByRole('button',{name:'읽기 전용 검증'}).click();await expect(page.getByText('검토 가능',{exact:true})).toBeVisible();
 await page.getByRole('checkbox').check();const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'검토 결과 내보내기'}).click();const download=await downloadPromise;expect(download.suggestedFilename()).toBe('migration-review.json');const stream=await download.createReadStream();const chunks:Buffer[]=[];for await(const chunk of stream!)chunks.push(Buffer.from(chunk));const artifact=JSON.parse(Buffer.concat(chunks).toString());expect(artifact.applyAuthorized).toBe(false);expect(artifact.localReview).toBe('ACKNOWLEDGED');expect(artifact.records[0].provenance).toEqual({sheet:'TEST Assets',row:2});expect(JSON.stringify(artifact)).not.toContain('TEST-UI-35');
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'docs/screenshots/issue35-migration-review.png',fullPage:true});
 await expect(page.getByRole('region',{name:'행별 검증 결과'})).toContainText('TEST Assets');await expect(page.getByRole('region',{name:'검증 진단'})).toContainText('HISTORY_NOT_PROVIDED');await page.getByRole('searchbox',{name:'검증 행 검색'}).fill('absent');await expect(page.getByRole('region',{name:'행별 검증 결과'})).not.toContainText('TEST Assets');await page.getByRole('searchbox',{name:'검증 행 검색'}).fill('');
 await page.getByRole('spinbutton',{name:'원본 행 수',exact:true}).fill('2');await expect(page.getByRole('button',{name:'검토 결과 내보내기'})).toHaveCount(0);
 await page.getByRole('button',{name:'읽기 전용 검증'}).click();await expect(page.getByText('오류 해결 필요',{exact:true})).toBeVisible();await expect(page.getByRole('checkbox')).toBeDisabled();
 // A changed session cannot reuse the previously authorized page to execute preview.
 await loginAs(context,'employee');await page.getByRole('button',{name:'읽기 전용 검증'}).click();await expect(page.getByRole('alert').filter({hasText:'검증하지 못했습니다'})).toBeVisible();
});
test('preview endpoint rejects non-private roles, anonymous access, cross-origin and oversized bodies',async({context,page,baseURL})=>{
 const origin=baseURL!;for(const role of ['employee','leader','admin','expense','it']){await loginAs(context,role);expect((await context.request.post('/api/migration-review',{headers:{Origin:origin},data:{role:'CEO'}})).status()).toBe(404);expect((await page.goto('/admin/migration-review'))?.status()).toBe(404);}
 await context.clearCookies();expect((await context.request.post('/api/migration-review')).status()).toBe(404);
 await loginAs(context,'designated');expect((await context.request.post('/api/migration-review',{headers:{Origin:'https://evil.example'},data:'anything'})).status()).toBe(403);
 expect((await context.request.post('/api/migration-review',{headers:{Origin:origin},data:'x'.repeat(4*1024*1024+1)})).status()).toBe(400);
 const bytes=Buffer.from('[]'),mapping={version:'test',reviewedSourceSha256:createHash('sha256').update(bytes).digest('hex'),asOf:'2026-01-01',employees:{},expected:{records:0,assets:0,expenseAmount:0,historyPeriods:0},exclusions:[]};
 await loginAs(context,'ceo');const response=await context.request.post('/api/migration-review',{headers:{Origin:origin},multipart:{source:{name:'synthetic.json',mimeType:'application/json',buffer:bytes},mapping:JSON.stringify(mapping)}});expect(response.ok()).toBe(true);expect(response.headers()['cache-control']).toBe('private, no-store');expect((await response.json()).applySupported).toBe(false);
});
