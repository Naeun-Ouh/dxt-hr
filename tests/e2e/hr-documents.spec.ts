import {test,expect} from '@playwright/test';
import {PDFDocument} from 'pdf-lib';
import {loginAs,tokenFor} from './fixtures';
const employee='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
async function pdf(){const p=await PDFDocument.create();p.addPage().drawText('SYNTHETIC HR DOCUMENT');return Buffer.from(await p.save());}
test('private HR uploads versions, own download, archive retains history and cross-user routes deny',async({page,context,request})=>{
 await loginAs(context,'designated');await page.goto(`/admin/employees/${employee}?tab=documents`);
 const bytes=await pdf();
 for(const name of ['synthetic-resume-v1.pdf','synthetic-resume-v2.pdf']){
  await page.getByRole('button',{name:'서류 추가 / 새 버전'}).click();
  await page.getByLabel('서류 종류').selectOption('RESUME');await page.getByLabel('파일',{exact:true}).setInputFiles({name,mimeType:'application/pdf',buffer:bytes});
  await page.screenshot({path:'docs/screenshots/issue33-document-upload.png',fullPage:true});
  await page.getByRole('button',{name:'서류 등록',exact:true}).click();await expect(page.getByRole('status')).toContainText('인사서류가 등록되었습니다');
  await page.getByRole('button',{name:'인사서류 등록 닫기'}).click();await expect(page.getByRole('row').filter({hasText:name})).toBeVisible();
 }
 const row=page.getByRole('row').filter({hasText:'synthetic-resume-v1.pdf'}),href=(await row.getByRole('link',{name:'다운로드'}).getAttribute('href'))!;
 const id=href.split('/').pop()!.split('?')[0];
 for(const name of ['designated','ceo','employee']){await loginAs(context,name);const r=await context.request.get(href);expect(r.status()).toBe(200);expect(r.headers()['cache-control']).toBe('private, no-store');expect(await r.body()).toEqual(bytes);}
 for(const name of ['expense','leader','admin','it']){
  await loginAs(context,name);expect((await context.request.get(href)).status()).toBe(404);
  expect((await page.goto(`/people/${employee}?tab=documents`))!.status()).toBe(404);
  const storage=await request.get(`http://localhost:54329/storage/v1/object/employee-hr-documents/${employee}/${id}`,{headers:{Authorization:`Bearer ${tokenFor(name)}`}});expect(storage.status()).toBe(403);
 }
 await loginAs(context,'employee');expect((await page.goto(`/people/${other}?tab=documents`))!.status()).toBe(404);
 await page.goto(`/people/${employee}?tab=documents`);await expect(page.getByRole('button',{name:'서류 추가 / 새 버전'})).toHaveCount(0);
 await page.screenshot({path:'docs/screenshots/issue33-self-documents.png',fullPage:true});
 await loginAs(context,'designated');await page.goto(`/admin/employees/${employee}?tab=documents`);
 await row.getByRole('button',{name:'보관',exact:true}).click();await expect(page.getByRole('row').filter({hasText:'synthetic-resume-v1.pdf'})).toHaveCount(0);
 await page.getByRole('link',{name:'보관 이력 포함'}).click();await expect(page.getByRole('row').filter({hasText:'synthetic-resume-v1.pdf'})).toContainText('보관됨');
 await page.screenshot({path:'docs/screenshots/issue33-document-history.png',fullPage:true});
 expect((await context.request.get(href)).status()).toBe(200);
 await loginAs(context,'employee');expect((await context.request.get(href)).status()).toBe(404);
});
test('stale upload screen cannot authorize ordinary admin; forged paths and invalid files rejected',async({page,context})=>{
 await loginAs(context,'designated');await page.goto(`/admin/employees/${employee}?tab=documents`);await page.getByRole('button',{name:'서류 추가 / 새 버전'}).click();
 await page.getByLabel('파일',{exact:true}).setInputFiles({name:'spoof.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a PDF')});await page.getByRole('button',{name:'서류 등록',exact:true}).click();await expect(page.locator('.form-error[role=alert]')).toContainText('파일 내용이 일치');
 await page.getByLabel('파일',{exact:true}).setInputFiles({name:'valid.pdf',mimeType:'application/pdf',buffer:await pdf()});
 await page.locator('form').filter({has:page.getByLabel('파일',{exact:true})}).evaluate(form=>{const input=document.createElement('input');input.name='storage_path';input.value='forged/path';form.append(input);});
 await page.getByRole('button',{name:'서류 등록',exact:true}).click();await expect(page.locator('.form-error[role=alert]')).toContainText('올바른 직원');
 await page.locator('input[name=storage_path]').evaluate(el=>el.remove());
 await page.getByLabel('파일',{exact:true}).setInputFiles({name:'valid.pdf',mimeType:'application/pdf',buffer:await pdf()});
 await loginAs(context,'admin');await page.getByRole('button',{name:'서류 등록',exact:true}).click();await expect(page.getByRole('heading',{name:'페이지를 찾을 수 없습니다'})).toBeVisible();
});
test('bankbook, resident copy and private-only other HR files retain own scope and masked HR fields',async({page,context})=>{
 const sharp=(await import('sharp')).default;
 await loginAs(context,'ceo');await page.goto(`/admin/employees/${other}?tab=private`);
 await expect(page.getByRole('heading',{name:'인사정보',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'민감정보 열람',exact:true})).toBeVisible();
 await page.goto(`/admin/employees/${other}?tab=documents`);
 for(const [type,name,mime] of [['BANKBOOK_COPY','synthetic-bank.png','image/png'],['RESIDENT_REGISTRATION_COPY','synthetic-resident.jpg','image/jpeg'],['OTHER_HR','synthetic-private.pdf','application/pdf']]){
  const bytes=mime==='application/pdf'?await pdf():await sharp({create:{width:100,height:60,channels:3,background:'#fff'}}).toFormat(mime==='image/png'?'png':'jpeg').toBuffer();
  await page.getByRole('button',{name:'서류 추가 / 새 버전'}).click();await page.getByLabel('서류 종류').selectOption(type);await page.getByLabel('파일',{exact:true}).setInputFiles({name,mimeType:mime,buffer:bytes});
  await page.getByRole('button',{name:'서류 등록',exact:true}).click();await expect(page.getByRole('button',{name:'서류 등록',exact:true})).toBeEnabled();await expect(page.getByRole('status')).toContainText('인사서류가 등록되었습니다');await page.getByRole('button',{name:'인사서류 등록 닫기'}).click();await expect(page.getByRole('row').filter({hasText:name})).toBeVisible();
 }
 const privateHref=(await page.getByRole('row').filter({hasText:'synthetic-private.pdf'}).getByRole('link',{name:'다운로드'}).getAttribute('href'))!;
 await loginAs(context,'expense');await page.goto(`/people/${other}?tab=documents`);
 await expect(page.getByRole('row').filter({hasText:'synthetic-bank.png'})).toBeVisible();await expect(page.getByRole('row').filter({hasText:'synthetic-resident.jpg'})).toBeVisible();await expect(page.getByText('synthetic-private.pdf')).toHaveCount(0);expect((await context.request.get(privateHref)).status()).toBe(404);
 await expect(page.getByRole('link',{name:'인사정보',exact:true})).toHaveCount(0);
});
test('4 MiB original PDF roundtrips; valid 5/10 MiB selection fails locally before Server Action',async({page,context})=>{
 const {syntheticHrPdf}=await import('../hr-document-boundary-fixture');
 await loginAs(context,'designated');await page.goto(`/admin/employees/${employee}?tab=documents`);await page.getByRole('button',{name:'서류 추가 / 새 버전'}).click();
 await expect(page.getByText(/서류 제출은 선택사항/)).toBeAttached();await expect(page.getByText(/불필요한 주민번호·가족·계좌정보/)).toBeVisible();
 let actions=0;page.on('request',req=>{if(req.headers()['next-action'])actions++;});
 for(const size of [4*1024*1024+1,5*1024*1024,10*1024*1024]){
  await page.getByLabel('파일',{exact:true}).setInputFiles({name:'synthetic-oversize.pdf',mimeType:'application/pdf',buffer:await syntheticHrPdf(size)});
  await page.getByRole('button',{name:'서류 등록',exact:true}).click();await expect(page.locator('.form-error[role=alert]')).toContainText('4 MiB');expect(actions).toBe(0);
 }
 const bytes=await syntheticHrPdf(4*1024*1024);
 await page.getByLabel('파일',{exact:true}).setInputFiles({name:'synthetic-4mib.pdf',mimeType:'application/pdf',buffer:bytes});await page.getByRole('button',{name:'서류 등록',exact:true}).click();await expect(page.getByRole('status')).toContainText('인사서류가 등록되었습니다');await page.getByRole('button',{name:'인사서류 등록 닫기'}).click();
 const href=(await page.getByRole('row').filter({hasText:'synthetic-4mib.pdf'}).getByRole('link',{name:'다운로드'}).getAttribute('href'))!;
 const response=await context.request.get(href);expect(response.status()).toBe(200);expect(response.headers()['cache-control']).toBe('private, no-store');expect(await response.body()).toEqual(bytes);
});
