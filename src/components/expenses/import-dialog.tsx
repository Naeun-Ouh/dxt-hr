'use client';
import {checkExpenseUpload} from '@/lib/expenses/transport';
import {useRef,useState} from 'react';
import {Modal} from '@/components/ui/workspace';
import {previewExpenseGrid} from '@/app/actions/expenses';
import type {ItemInput,Preview} from '@/lib/expenses/types';
export function ExpenseImport({open,month,onClose,onApply}:{open:boolean;month:string;onClose:()=>void;onApply:(rows:ItemInput[],mode:'append'|'replace')=>void}){
 const [preview,setPreview]=useState<Preview>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[mode,setMode]=useState<'append'|'replace'>('append'),[legacyDate,setLegacyDate]=useState(false);
 const request=useRef(0);
 const close=()=>{request.current++;setPreview(undefined);setError('');setBusy(false);setLegacyDate(false);onClose();};
 const needsDate=!!preview?.items.some(i=>['FUEL','TOLL'].includes(i.expense_type)&&!i.usage_date);
 return <Modal open={open} onClose={close} title="Excel 가져오기"><form className="grid-import-panel" onChange={()=>{request.current++;setPreview(undefined);setBusy(false);}} onSubmit={async e=>{e.preventDefault();const data=new FormData(e.currentTarget),token=++request.current;setBusy(true);setError('');try{checkExpenseUpload(data);const result=await previewExpenseGrid(data);if(token!==request.current)return;if(result.preview){setPreview(result.preview);setLegacyDate(result.preview.items.some(i=>i.import_origin?.includes(' (')));}else setError(result.error||'가져오기 실패');}catch(e){if(token===request.current)setError((e as Error).message);}finally{if(token===request.current)setBusy(false);}}}>
 <p>귀속월 <strong>{month}</strong> · 미리보기는 저장되지 않습니다.</p><input type="hidden" name="month" value={month}/>
 {error&&<p role="alert" className="form-error">{error}</p>}
 <div className="field-grid"><label>Excel 파일 (.xlsx)<small>최대 4 MiB</small><input name="workbook" type="file" accept=".xlsx" required onChange={()=>setLegacyDate(false)}/></label><label>가져오기 방식<select value={mode} onChange={e=>setMode(e.target.value as 'append'|'replace')}><option value="append">기존 행에 추가</option><option value="replace">미저장 신규 행 교체 (저장된 행 유지)</option></select></label></div>
 {legacyDate&&<label>차량 사용일 (기존 양식)<input name="vehicle_date" type="date" min={month+'-01'} max={month+'-31'} required/></label>}
 <button className="button" disabled={busy}>{busy?'분석 중…':'Grid 미리보기'}</button>
 {preview&&<section aria-label="Excel 미리보기"><h3>{preview.items.length}행 · 오류 {preview.problems.filter(p=>p.severity==='ERROR').length} · 확인 {preview.problems.filter(p=>p.severity==='WARNING').length}</h3>
 <ul>{preview.problems.map((p,i)=><li key={i} className={p.severity==='ERROR'?'form-error':'expense-warning'}>{p.origin} · {p.message}</li>)}</ul>
 <div className="table-scroll"><table><thead><tr><th>사용일</th><th>사용처</th><th>금액</th><th>결제카드</th></tr></thead><tbody>{preview.items.map(i=><tr key={i.id}><td>{i.usage_date||'사용일 입력 필요'}</td><td>{i.merchant}</td><td>{Number.isFinite(i.amount)?i.amount.toLocaleString('ko-KR'):'금액 확인'}</td><td>{i.payment_card_error||i.payment_card_label||(i.payment_method==='CASH'?'현금':'개인카드(미지정)')}</td></tr>)}</tbody></table></div>
 <p className="grid-help">반영 후 Grid에서 입력 오류를 수정할 수 있습니다. 일괄 저장 전에는 DB에 저장되지 않습니다.</p>
 <button type="button" className="button primary" disabled={busy||!preview.items.length||needsDate||preview.problems.some(p=>p.code==='SCHEMA'&&p.severity==='ERROR')} onClick={()=>{try{onApply(preview.items,mode);close();}catch(e){setError((e as Error).message);}}}>Grid에 반영</button>
 </section>}<button type="button" className="button" onClick={close}>취소</button></form></Modal>;
}
