import ExcelJS from 'exceljs';
// Sanitized reconstruction of the actual workbook layout confirmed by PR #11's review:
// https://github.com/Naeun-Ouh/dxt-hr/pull/11#issuecomment-5919541444
// The original binary is not available locally; do not claim this is that binary.
export function legacyWorkbookFixture() {
 const book=new ExcelJS.Workbook();
 const summary=book.addWorksheet('지출결의서');
 const headings=['일자','업체명','품목','계정과목','합계','증빙종류','비고'];
 summary.getRow(11).values=headings;
 summary.getRow(12).values=[1,'','주유비','차량유지비',100720,'개인카드'];
 summary.getRow(13).values=[1,'','통행비','차량유지비',48000,'개인카드'];
 summary.getRow(15).values=headings;
 summary.getRow(16).values=[];
 const travel=book.addWorksheet('주유비,통행비');
 const vehicleHeadings=['프로젝트명/출장명','출발지','도착지','편도 주유비','횟수','총 금액',null,null,'프로젝트명/출장명','출발지','도착지','편도 통행비','횟수','총 금액'];
 travel.getRow(5).values=vehicleHeadings;
 for(let row=6;row<=13;row++) {
  travel.getCell(`F${row}`).value={formula:`D${row}*D${row}`,result:0};
  travel.getCell(`N${row}`).value={formula:`K${row}*L${row}`,result:0};
 }
 travel.mergeCells('A16:N16');travel.getCell('A16').value='SAMPLE';
 travel.getRow(17).values=vehicleHeadings;
 travel.getRow(18).values=['Samsung BioLogics','구로역','삼성바이오로직스',5036,20,{formula:'D18*E18',result:100720},null,null,'Samsung BioLogics','구로역','삼성바이오로직스',2400,20,{formula:'L18*M18',result:48000}];
 return book;
}
