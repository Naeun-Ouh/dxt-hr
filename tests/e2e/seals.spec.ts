import {test,expect} from '@playwright/test';
import sharp from 'sharp';
import {PDFDocument,PDFName,PDFRawStream} from 'pdf-lib';
import {writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loginAs,tokenFor} from './fixtures';
import {contractItem} from '../contracts-fixture';
const id='c0000000-0000-4000-8000-000000000080';
test('private seal management, server authorization, sealed PDF and replacement preserve history',async({page,context,request})=>{
 test.setTimeout(90000);
 const seal=await sharp(Buffer.from('<svg width="200" height="200"><rect x="10" y="10" width="180" height="180" rx="12" fill="none" stroke="#b82230" stroke-width="8"/><text x="100" y="90" text-anchor="middle" font-size="38" fill="#b82230">TEST</text><text x="100" y="140" text-anchor="middle" font-size="30" fill="#b82230">SEAL</text></svg>')).png().toBuffer();
 for(const role of ['employee','leader','it']){await loginAs(context,role);expect((await page.goto('/admin/contracts/seals'))?.status()).toBe(404);}
 await loginAs(context,'admin');await page.goto('/admin/contracts/seals');
 await page.getByLabel('대표자명').fill('테스트 대표');await page.getByLabel('직인 이미지').setInputFiles({name:'test-seal.png',mimeType:'image/png',buffer:seal});await page.getByRole('button',{name:'직인 등록 및 활성화'}).click();
 await expect(page.getByRole('img',{name:'현재 활성 회사 직인'})).toBeVisible();
 const image=page.getByRole('img',{name:'현재 활성 회사 직인'}),src=(await image.getAttribute('src'))!;
 const preview=await context.request.get(src);expect(preview.ok()).toBe(true);expect(preview.headers()['cache-control']).toContain('no-store');
 await page.screenshot({path:'docs/screenshots/contracts-seal-management.png',fullPage:true});
 const sealId=src.split('/').at(-1)!;
 for(const role of ['employee','leader','expense']){await loginAs(context,role);expect((await context.request.get(src)).status()).toBe(404);expect((await request.get(`http://localhost:54329/storage/v1/object/authenticated/company-seals/${sealId}/seal.png`,{headers:{Authorization:`Bearer ${tokenFor(role)}`}})).status()).toBe(403);}
 // Replay an already-rendered manager action after changing the session.
 await loginAs(context,'admin');await page.goto('/admin/contracts/seals');await page.getByLabel('직인 이미지').setInputFiles({name:'test-seal.png',mimeType:'image/png',buffer:seal});await loginAs(context,'employee');await page.getByRole('button',{name:'직인 교체 및 활성화'}).click();await expect(page.getByRole('heading',{name:'페이지를 찾을 수 없습니다'})).toBeVisible();
 const rpc=async(name:string,data:object)=>{const r=await request.post(`http://localhost:54329/rest/v1/rpc/${name}`,{headers:{Authorization:`Bearer ${tokenFor('designated')}`},data});expect(r.ok()).toBe(true);};
 await rpc('create_employment_contracts',{p_items:[contractItem(id)],p_template:null});for(const action of ['READY_TO_SEND','SENT'])await rpc('transition_employment_contract',{p_id:id,p_version:1,p_action:action});
 await loginAs(context,'employee');await page.goto('/contracts/me');await page.screenshot({path:'docs/screenshots/contracts-my-list.png',fullPage:true});await page.goto(`/contracts/me/${id}`);const employee=page.locator('form').filter({has:page.getByRole('button',{name:'직원 서명',exact:true})});await expect(employee.getByRole('button')).toBeDisabled();await employee.getByRole('checkbox').check();await employee.getByRole('button').click();await expect(page.getByText('직원 서명 완료 · 버전 1',{exact:false})).toBeVisible();
 await loginAs(context,'ceo');await page.goto(`/admin/contracts/${id}`);await page.screenshot({path:'docs/screenshots/contracts-ceo-seal.png',fullPage:true});const company=page.locator('form').filter({has:page.getByRole('button',{name:'CEO 회사 서명',exact:true})});await company.getByRole('checkbox').check();await company.getByRole('button').click();await expect(page.getByRole('link',{name:'완료 PDF 다운로드'})).toBeVisible({timeout:30000});
 const before=await context.request.get(`/api/contracts/${id}/pdf`);expect(before.ok()).toBe(true);const bytes=await before.body();const pdf=await PDFDocument.load(bytes);expect(pdf.context.enumerateIndirectObjects().some(([,obj])=>obj instanceof PDFRawStream&&obj.dict.get(PDFName.of('Subtype'))===PDFName.of('Image'))).toBe(true);writeFileSync(join(tmpdir(),'contract-sealed-example.pdf'),bytes);
 await page.goto('/admin/contracts/seals');await page.getByLabel('대표자명').fill('교체 대표');await page.getByLabel('직인 이미지').setInputFiles({name:'replacement.png',mimeType:'image/png',buffer:seal});await page.getByRole('button',{name:'직인 교체 및 활성화'}).click();await expect(page.getByRole('img',{name:'현재 활성 회사 직인'})).not.toHaveAttribute('src',src);
 await loginAs(context,'employee');const after=await context.request.get(`/api/contracts/${id}/pdf`);expect(await after.body()).toEqual(bytes);expect((await context.request.get(src)).status()).toBe(404);
});
