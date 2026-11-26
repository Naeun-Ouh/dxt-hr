/** Leave headroom below hosted 4.5 MB request limits for multipart/action metadata. */
export const EXPENSE_UPLOAD_LIMIT=4*1024*1024;
export function checkExpenseUpload(form:FormData){
 const bytes=[...form.values()].reduce((sum,value)=>sum+(typeof value==='string'?0:value.size),0);
 if(bytes>EXPENSE_UPLOAD_LIMIT)throw new Error('한 요청의 파일 합계는 4 MiB 이하입니다. 월별 Grid에서 Excel과 증빙을 나누어 업로드해 주세요.');
}
