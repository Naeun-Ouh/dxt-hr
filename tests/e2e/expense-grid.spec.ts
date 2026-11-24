import {test,expect} from '@playwright/test';
import ExcelJS from 'exceljs';
import {loginAs,tokenFor} from './fixtures';
import {today} from '../../src/lib/expenses/validation';
import {templateWorkbook} from '../../src/lib/expenses/workbook';
const d=new Date(today()+'T00:00:00Z');d.setUTCMonth(d.getUTCMonth()-1,1);const month=d.toISOString().slice(0,7);
const pdf={name:'grid-receipts.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nsynthetic test evidence\n%%EOF')};
test('monthly grid paste, edit, duplicate, delete, reset, import, vehicle, evidence and post-submit edit window and payment lock',async({page,context})=>{
 await loginAs(context,'employee');await page.goto(`/expenses?month=${month}`);
 await expect(page.getByRole('heading',{name:'경비관리',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'+ 행 추가',exact:true}).click();
 const paste=`${month}-01\t교육비\t교육훈련비\tOpenAI Codex\tAI 개발도구 구독료\t271,818\n${month}-02\t교육비\t교육훈련비\tAnthropic ClaudeCode\tAI 개발도구 구독료\t273,218`;
 await page.getByLabel('1행 사용일',{exact:true}).evaluate((el,text)=>{const data=new DataTransfer();data.setData('text/plain',text);el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true}));},paste);
 await expect(page.getByText('합계 545,036원 · 총 2건',{exact:true})).toBeVisible();
 await page.getByLabel('1행 선택',{exact:true}).check();await page.getByRole('button',{name:'선택 행 복제'}).click();await expect(page.getByText('합계 816,854원 · 총 3건')).toBeVisible();
 await page.getByLabel('1행 선택',{exact:true}).uncheck();await page.getByLabel('3행 선택',{exact:true}).check();await page.getByRole('button',{name:'선택 행 삭제'}).click();
 await page.getByRole('button',{name:'일괄 저장',exact:true}).click();await expect(page.getByRole('status')).toHaveText('저장 완료');
 await page.getByLabel('1행 사용처',{exact:true}).fill('취소할 변경');await page.getByRole('button',{name:'변경 취소 / 초기화'}).click();await expect(page.getByLabel('1행 사용처',{exact:true})).toHaveValue('OpenAI Codex');
 await page.screenshot({path:'docs/screenshots/issue23-employee-grid.png',fullPage:true});
 await page.locator('summary').filter({hasText:'Excel'}).click();await page.getByRole('button',{name:'Excel Import',exact:true}).click();
 const book=new ExcelJS.Workbook();await book.xlsx.load(await templateWorkbook(month) as never);book.getWorksheet('지출결의서')!.addRow(['invalid','가져온 식당','야근 식대','복리후생비',14000,'개인카드','','야근 식대','개인카드']);book.getWorksheet('주유비,통행비')!.addRow(['통행비',month+'-03','Grid 출장','서울','송도',2400,2,'하이패스']);
 await page.getByLabel('Excel 파일 (.xlsx)').setInputFiles({name:'grid.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(await book.xlsx.writeBuffer())});
 await page.getByRole('button',{name:'Grid 미리보기'}).click();await expect(page.getByRole('region',{name:'Excel 미리보기'})).toContainText('2행');await expect(page.getByText('Excel 가져옴')).toHaveCount(0);
 await page.getByRole('button',{name:'Grid에 반영',exact:true}).click();await expect(page.getByText('Excel 가져옴')).toHaveCount(2);
 await page.getByRole('button',{name:'Excel Import',exact:true}).click();await page.getByLabel('Excel 파일 (.xlsx)').setInputFiles({name:'grid.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(await book.xlsx.writeBuffer())});await page.getByRole('button',{name:'Grid 미리보기'}).click();await page.getByRole('button',{name:'Grid에 반영',exact:true}).click();await expect(page.getByText('Excel 가져옴')).toHaveCount(4);
 await page.getByRole('button',{name:'Excel Import',exact:true}).click();await page.getByLabel('Excel 파일 (.xlsx)').setInputFiles({name:'grid.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(await book.xlsx.writeBuffer())});await page.getByLabel('가져오기 방식').selectOption('replace');await page.getByRole('button',{name:'Grid 미리보기'}).click();await page.getByRole('button',{name:'Grid에 반영',exact:true}).click();await expect(page.getByText('Excel 가져옴')).toHaveCount(2);
 await expect(page.getByRole('button',{name:'일괄 저장',exact:true})).toBeDisabled();await page.getByLabel('4행 사용일',{exact:true}).fill(month+'-03');await page.getByLabel('4행 사용처',{exact:true}).fill('수정한 식당');await expect(page.getByRole('button',{name:'일괄 저장',exact:true})).toBeEnabled();await page.screenshot({path:'docs/screenshots/issue23-import-grid.png',fullPage:true});
 await page.getByRole('row').filter({has:page.getByLabel('3행 사용일',{exact:true})}).getByRole('button',{name:'이동 상세 수정',exact:true}).click();await page.getByLabel('횟수',{exact:true}).fill('3');await expect(page.getByText('계산 금액 7,200원')).toBeVisible();await page.screenshot({path:'docs/screenshots/issue23-vehicle-detail.png',fullPage:true});
 await page.getByRole('button',{name:'이동 상세 입력 / 수정 닫기',exact:true}).click();await page.getByRole('button',{name:'일괄 저장',exact:true}).click();await expect(page.getByRole('status')).toHaveText('저장 완료');
 await page.getByLabel('파일 선택 (여러 개)').setInputFiles(pdf);await page.getByRole('button',{name:/^파일 업로드/}).click();await expect(page.getByRole('status')).toContainText('업로드 결과');

 const exportUrl=await page.getByRole('link',{name:'Excel Export (저장된 내역)'}).getAttribute('href');const exported=await context.request.get(exportUrl!);expect(exported.status()).toBe(200);const xlsx=new ExcelJS.Workbook();await xlsx.xlsx.load(await exported.body() as never);expect(xlsx.getWorksheet('주유비,통행비')!.getCell('G2').value).toBe(3);
 await page.getByRole('button',{name:'경비 제출',exact:true}).click();await page.getByRole('button',{name:'확인 후 제출'}).click();await expect(page.getByRole('status')).toHaveText('제출 완료 · 지급/잠금 전까지 수정 가능');await expect(page.getByLabel('1행 사용처',{exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:'경비 제출',exact:true})).toHaveCount(0);const editedId=await page.locator('tr').filter({has:page.getByLabel('1행 사용처',{exact:true})}).getAttribute('data-row-id');await page.getByLabel('1행 사용처',{exact:true}).fill('제출 후 수정 식당');await page.getByRole('button',{name:'일괄 저장',exact:true}).click();await expect(page.getByRole('status')).toHaveText('저장 완료');await page.reload();await expect(page.locator(`tr[data-row-id="${editedId}"]`).getByRole('textbox',{name:/행 사용처$/})).toHaveValue('제출 후 수정 식당');await page.screenshot({path:'docs/screenshots/issue23-submitted-grid.png',fullPage:true});
 const stale=await context.newPage();await stale.goto(`/expenses?month=${month}`);await stale.getByLabel('1행 사용처',{exact:true}).fill('잠금 후 저장 시도');
 const claim=new URL(exportUrl!,'http://localhost').searchParams.get('claim');await loginAs(context,'expense');await page.goto(`/admin/expenses/${claim}`);await expect(page.getByLabel('1행 사용처',{exact:true})).toBeDisabled();await page.screenshot({path:'docs/screenshots/issue23-admin-grid.png',fullPage:true});
 await page.getByRole('button',{name:'지급 기간 잠금',exact:true}).click();await expect(page.getByRole('status')).toContainText('저장했습니다.');await loginAs(context,'employee');await stale.getByRole('button',{name:'일괄 저장',exact:true}).click();await expect(stale.locator('.form-error[role=alert]')).toContainText('수정 가능한 본인 경비가 아닙니다.');await stale.close();await page.goto(`/expenses?month=${month}`);await expect(page.getByLabel('1행 사용처',{exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'일괄 저장',exact:true})).toHaveCount(0);
});
test('grid stale tab and session-switched save cannot overwrite persisted data',async({page,context})=>{
 await loginAs(context,'employee');await page.goto('/expenses');const second=await context.newPage();await second.goto('/expenses');
 await page.getByLabel('1행 사용내역',{exact:true}).fill('Grid saved description');await page.getByRole('button',{name:'일괄 저장',exact:true}).click();await expect(page.getByRole('status')).toHaveText('저장 완료');
 await second.getByLabel('1행 사용내역',{exact:true}).fill('Stale description');await second.getByRole('button',{name:'일괄 저장',exact:true}).click();await expect(second.locator('.form-error[role=alert]')).toContainText('다른 변경');await second.close();
 await page.getByLabel('1행 사용처',{exact:true}).fill('Forged session');await loginAs(context,'expense');await page.getByRole('button',{name:'일괄 저장',exact:true}).click();await expect(page.locator('.form-error[role=alert]')).toContainText('본인 경비');
 await loginAs(context,'employee');page.on('dialog',d=>d.accept());await page.reload();await expect(page.getByLabel('1행 사용처',{exact:true})).not.toHaveValue('Forged session');
});
test('bulk RPC rejects forged claim, item, deletion, receipt and unknown fields across users',async({context})=>{
 const claim='60000000-0000-4000-8000-000000000001',other='60000000-0000-4000-8000-000000000002';
 const endpoint='http://localhost:54329/rest/v1/rpc/save_expense_grid';
 for(const payload of [{p_claim:other,p_items:[]},{p_claim:claim,p_items:[{id:'70000000-0000-4000-8000-000000000002',version:1}]},{p_claim:claim,p_deleted:[{id:'70000000-0000-4000-8000-000000000002',version:1}]},{p_claim:claim,employee_id:'forged'}]){
 const response=await context.request.post(endpoint,{headers:{Authorization:`Bearer ${tokenFor('employee')}`},data:{p_month:today().slice(0,7)+'-01',p_version:1,p_items:[],p_deleted:[],p_reason:'',...payload}});expect(response.status()).toBe(400);
 }
 await loginAs(context,'employee');expect((await context.request.get(`/api/expenses/export?claim=${other}`)).status()).toBe(404);
});
test('keyboard, malformed paste, filters and sort keep working data local and resettable',async({page,context})=>{
 await loginAs(context,'employee');await page.goto('/expenses');
 let writes=0;page.on('request',request=>{if(request.headers()['next-action'])writes++;});
 const original=await page.getByLabel('1행 사용처',{exact:true}).inputValue();await page.getByLabel('1행 사용처',{exact:true}).focus();await page.getByLabel('1행 사용처',{exact:true}).fill('임시 편집');await page.keyboard.press('Escape');await expect(page.getByLabel('1행 사용처',{exact:true})).toHaveValue(original);
 await page.getByRole('button',{name:'+ 행 추가',exact:true}).click();await page.getByLabel('1행 사용처',{exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByLabel('2행 사용처',{exact:true})).toBeFocused();await page.keyboard.press('Tab');await expect(page.getByLabel('2행 사용내역',{exact:true})).toBeFocused();await page.getByLabel('2행 사용일',{exact:true}).evaluate(el=>{const data=new DataTransfer();data.setData('text/plain','invalid\tOTHER\tinvalid\t<script>literal</script>\ttext\tbad');el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true}));});await expect(page.getByRole('button',{name:'일괄 저장',exact:true})).toBeDisabled();
 await page.getByLabel('경비 검색',{exact:true}).fill('literal');await expect(page.locator('tbody tr')).toHaveCount(1);await page.getByLabel('정렬',{exact:true}).selectOption('-amount');await page.getByLabel('1행 사용처',{exact:true}).evaluate(el=>{const data=new DataTransfer();data.setData('text/plain','filtered paste');el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true}));});await page.getByLabel('경비 검색',{exact:true}).fill('');await expect(page.locator('tbody tr')).toHaveCount(3);expect(writes).toBe(0);
 await page.getByRole('button',{name:'변경 취소 / 초기화'}).click();await expect(page.locator('tbody tr')).toHaveCount(1);
});
