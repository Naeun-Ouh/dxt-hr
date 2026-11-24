'use client';
import {useActionState,useState} from 'react';
import Link from 'next/link';
import {useFormStatus} from 'react-dom';
import {SectionCard,DataTable,StatusTag} from '@/components/ui/primitives';
import {Modal,WorkToolbar} from '@/components/ui/workspace';
import {uploadHrDocument,archiveHrDocument} from '@/app/actions/hr-documents';
import {DOCUMENT_TYPES,MAX_DOCUMENT_BYTES,DOCUMENT_SIZE_MESSAGE,type HrDocument} from '@/lib/hr-documents/types';
function Submit({children,primary=true}:{children:React.ReactNode;primary?:boolean}){const {pending}=useFormStatus();return <button className={`button ${primary?'primary':''}`} disabled={pending}>{pending?'처리 중…':children}</button>;}
function Archive({id}:{id:string}){const [state,action]=useActionState(archiveHrDocument,{});return <form action={action}><input type="hidden" name="document_id" value={id}/><Submit primary={false}>보관</Submit>{state.error&&<p role="alert">{state.error}</p>}{state.success&&<p role="status">{state.success}</p>}</form>;}
export function HrDocumentsPanel({employeeId,documents,manage,history,base}:{employeeId:string;documents:HrDocument[];manage:boolean;history:boolean;base:string}){
 const [open,setOpen]=useState(false);
 return <SectionCard className="hr-documents"><WorkToolbar label="인사서류 작업" actions={manage&&<button className="button primary" onClick={()=>setOpen(true)}>서류 추가 / 새 버전</button>}><h2>인사서류</h2>{manage&&<Link className="button" href={`${base}?tab=documents${history?'':'&history=1'}`}>{history?'현재 서류':'보관 이력 포함'}</Link>}</WorkToolbar>
 <p className="field-help">{manage?'서류 제출은 선택사항입니다. 필요한 서류만 등록하고, 교체 시 이전 버전을 직접 보관하세요. 보관은 삭제가 아닙니다.':'본인에게 공개된 통장사본·주민등록등본·이력서입니다. 변경은 인사 담당자에게 요청해 주세요.'}</p>
 <DataTable label="직원 인사서류" head={['종류','파일명 / 버전','등록일','발급일 / 유효기간','상태','작업']}>{documents.map(d=><tr key={d.id}><td>{DOCUMENT_TYPES[d.document_type]}</td><td>{d.filename}<small> · v{d.version} · {(d.byte_size/1024).toFixed(1)} KB</small></td><td>{new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium'}).format(new Date(d.uploaded_at))}</td><td>{d.issued_date||'—'} / {d.expires_at||'—'}</td><td><StatusTag tone={d.archived_at?'neutral':'success'}>{d.archived_at?'보관됨':'등록됨'}</StatusTag></td><td><div className="button-row"><a className="button" target="_blank" rel="noopener noreferrer" href={`/api/hr-documents/${d.id}`}>보기</a><a className="button" href={`/api/hr-documents/${d.id}?download=1`}>다운로드</a>{manage&&!d.archived_at&&<Archive id={d.id}/>}</div></td></tr>)}</DataTable>{!documents.length&&<p className="table-empty">등록된 인사서류가 없습니다.</p>}
 <Modal open={open} onClose={()=>setOpen(false)} title="인사서류 등록"><UploadForm employeeId={employeeId}/></Modal>
 </SectionCard>;
}

function UploadForm({employeeId}:{employeeId:string}){
 const [state,action]=useActionState(uploadHrDocument,{}),[clientError,setClientError]=useState('');
 return <form action={action} onSubmit={event=>{
  const file=new FormData(event.currentTarget).get('file');
  if(file instanceof File&&file.size>MAX_DOCUMENT_BYTES){event.preventDefault();setClientError(DOCUMENT_SIZE_MESSAGE);}else setClientError('');
 }} className="form-grid hr-document-form"><input type="hidden" name="employee_id" value={employeeId}/><label className="field">서류 종류<select name="document_type">{Object.entries(DOCUMENT_TYPES).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label className="field">파일<input type="file" name="file" accept="application/pdf,image/png,image/jpeg" required/></label><p className="field-help">PDF / PNG / JPG · 파일당 최대 4 MiB. 통장사본은 계좌 확인, 등본은 필요한 인사 사실 확인, 이력서는 경력 확인 목적으로만 선택 등록합니다. 불필요한 주민번호·가족·계좌정보는 업로드 전 가려 주세요. 자동 추출은 하지 않습니다.</p><label className="field">발급일 (선택)<input type="date" name="issued_date"/></label><label className="field">유효기간 (선택)<input type="date" name="expires_at"/></label>{(clientError||state.error)&&<p role="alert" className="form-error">{clientError||state.error}</p>}{state.success&&<p role="status" className="success-notice">{state.success}</p>}<Submit>서류 등록</Submit></form>;
}
