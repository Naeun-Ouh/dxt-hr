'use client';
import { useActionState,useEffect,useId,useState,useTransition } from 'react';
import Link from 'next/link';
import { saveAsset,saveVault,revealVault,deleteAssetRecord,requestAssetTransfer,resolveAssetTransfer } from '@/app/actions/assets';
import { ASSET_TYPES,ASSET_STATUSES,vaultPath,type Asset,type VaultEntry,type VaultKind } from '@/lib/assets/types';
type Person={id:string;name:string;employment_status:string};
function Field({label,children}:{label:string;children:(id:string)=>React.ReactNode}){const id=useId();return <div className="field"><label htmlFor={id}>{label}</label>{children(id)}</div>;}
export function AssetForm({asset,employees,hasPending=false}:{asset?:Asset;employees:Person[];hasPending?:boolean}){
 const [state,action,pending]=useActionState(saveAsset.bind(null,asset?.id||null),{});
 return <form action={action} className="surface asset-form"><input type="hidden" name="version" value={asset?.version||0}/>{state.error&&<p role="alert" className="form-error">{state.error}</p>}<div className="field-grid">
 <Field label="유형">{id=><select id={id} name="type" defaultValue={asset?.type||'NOTEBOOK'}>{Object.entries(ASSET_TYPES).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select>}</Field>
 {(['manufacturer','model','serial_number'] as const).map(key=><Field key={key} label={{manufacturer:'제조사 (선택)',model:'모델 (선택)',serial_number:'Serial Number'}[key]}>{id=><input id={id} name={key} required={key==='serial_number'} maxLength={key==='model'?200:100} defaultValue={asset?.[key]}/>}</Field>)}
 <Field label="상태">{id=><select id={id} name="status" defaultValue={asset?.status||'AVAILABLE'}>{Object.entries(ASSET_STATUSES).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>}</Field>
 <Field label="현재 보유자">{id=><select id={id} name="current_holder_id" defaultValue={asset?.current_holder_id||''}><option value="">미지급 / 반납</option>{employees.filter(e=>e.employment_status==='ACTIVE'||e.id===asset?.current_holder_id).map(e=><option value={e.id} key={e.id}>{e.name}{e.employment_status==='INACTIVE'?' (퇴사 · 미반납)':''}</option>)}</select>}</Field>
 </div><p className="muted">관리자 보정은 즉시 적용되며 기존 지급 이력을 보존합니다. 대기 중인 인계는 먼저 확정하거나 취소해 주세요. 반납 시 보유자를 ‘미지급 / 반납’으로 변경해 주세요.</p><div className="button-row"><Link className="button" href="/admin/assets">취소</Link><button className="button primary" disabled={pending||hasPending}>장비 저장</button></div></form>;
}
export function VaultForm({kind,entry,assets,employees}:{kind:VaultKind;entry?:VaultEntry;assets:Asset[];employees:Person[]}){
 const [state,action,pending]=useActionState(saveVault.bind(null,kind,entry?.id||null),{});
 return <form action={action} className="surface asset-form"><input type="hidden" name="version" value={entry?.version||0}/>{state.error&&<p role="alert" className="form-error">{state.error}</p>}<div className="field-grid">
 <Field label={kind==='windows'?'Edition / 제품':'서비스명'}>{id=><input id={id} name="name" required maxLength={200} defaultValue={entry?.name}/>}</Field>
 {kind==='account'?<><Field label="로그인 ID">{id=><input id={id} name="login_id" required maxLength={200} defaultValue={entry?.login_id}/>}</Field><Field label="URL (선택)">{id=><input id={id} name="url" type="url" maxLength={2000} defaultValue={entry?.url}/>}</Field></>:<><Field label="연결 장비 (선택)">{id=><select id={id} name="device_asset_id" defaultValue={entry?.device_asset_id||''}><option value="">미연결</option>{assets.map(a=><option key={a.id} value={a.id}>{a.model||ASSET_TYPES[a.type]} · {a.serial_number}</option>)}</select>}</Field><Field label="사용자 (선택)">{id=><select id={id} name="assigned_employee_id" defaultValue={entry?.assigned_employee_id||''}><option value="">미지정</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}{e.employment_status==='INACTIVE'?' (퇴사)':''}</option>)}</select>}</Field></>}
 <Field label={`${kind==='windows'?'제품키':'비밀번호'}${entry?' (변경할 때만 입력)':''}`}>{id=><input id={id} name="secret" type="password" autoComplete="new-password" required={!entry} maxLength={kind==='windows'?29:4096}/>}</Field>
 <Field label="메모 (선택)">{id=><textarea id={id} name="memo" maxLength={2000} defaultValue={entry?.memo}/>}</Field></div><p className="muted">비밀값은 암호화하여 저장합니다. 메모나 URL에 비밀번호를 입력하지 마세요.</p><div className="button-row"><Link className="button" href={vaultPath(kind)}>취소</Link><button className="button primary" disabled={pending}>{kind==='windows'?'라이선스 저장':'계정 저장'}</button></div></form>;
}
export function RevealSecret({kind,id}:{kind:VaultKind;id:string}){
 const [result,setResult]=useState<{value?:string;error?:string}>({}),[pending,start]=useTransition();
 useEffect(()=>{const clear=()=>setResult({});window.addEventListener('blur',clear);window.addEventListener('pagehide',clear);document.addEventListener('visibilitychange',clear);const timer=setTimeout(clear,30000);return()=>{clearTimeout(timer);window.removeEventListener('blur',clear);window.removeEventListener('pagehide',clear);document.removeEventListener('visibilitychange',clear);};},[result.value]);
 return <div className="secret-reveal"><code>{result.value||'••••••••••'}</code><button type="button" className="button" disabled={pending} onClick={()=>result.value?setResult({}):start(async()=>setResult(await revealVault(kind,id)))}>{result.value?'숨기기':'전체 값 보기'}</button>{result.error&&<p className="form-error" role="alert">{result.error}</p>}<small>확인 이력이 기록되며 30초 후 또는 화면을 벗어나면 숨겨집니다.</small></div>;
}
export function DeleteAsset({kind,id,version}:{kind:'asset'|VaultKind;id:string;version:number}){const [state,action,pending]=useActionState(deleteAssetRecord.bind(null,kind,id),{});return <details className="delete-record"><summary>삭제</summary><form action={action}><input type="hidden" name="version" value={version}/><p>이 기록을 삭제하시겠습니까? 지급 이력이 있는 장비는 삭제할 수 없습니다.</p>{state.error&&<p role="alert" className="form-error">{state.error}</p>}<button className="button danger" disabled={pending}>삭제 확인</button></form></details>;}

export function TransferForm({assetId,assignmentId,requestId,employees,minDate,today}:{assetId:string;assignmentId:string;requestId:string;employees:Person[];minDate:string;today:string}){
 const [state,action,pending]=useActionState(requestAssetTransfer.bind(null,assetId,assignmentId,requestId),{});
 return <details className="transfer-form"><summary>다른 직원에게 인계</summary><form action={action}>
  {state.error&&<p role="alert" className="form-error">{state.error}</p>}
  <div className="field-grid"><Field label="받을 직원">{id=><select id={id} name="recipient_id" required defaultValue=""><option value="" disabled>수신자 선택</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select>}</Field>
  <Field label="인계일">{id=><input id={id} type="date" name="handoff_date" min={minDate} max={today} defaultValue={today} required/>}</Field>
  <Field label="인계 메모 (선택)">{id=><textarea id={id} name="memo" maxLength={2000}/>}</Field></div>
  <p className="muted">실제로 전달한 장비를 등록해 주세요. 수신자가 인수 확인하면 현재 보유자가 변경됩니다.</p>
  <button className="button primary" disabled={pending}>인계 등록</button>
 </form></details>;
}
export function ResolveTransfer({id,mode}:{id:string;mode:'confirm'|'force'|'cancel'}){
 const [state,action,pending]=useActionState(resolveAssetTransfer.bind(null,id,mode==='cancel'?'CANCELLED':'CONFIRMED',mode==='force'),{});
 const label=mode==='confirm'?'인수 확인':mode==='force'?'관리자 강제확정':'인계 취소';
 return <details className="transfer-resolution"><summary>{label}</summary><form action={action}>
  <p>{mode==='cancel'?'인계를 취소하고 기존 보유자의 현재 장비로 되돌립니다.':mode==='force'?'수신자 확인을 대신하여 현재 보유자를 변경합니다. 관리자 처리 이력이 남습니다.':'장비를 실제로 받으셨나요? 확인하면 인계일부터 본인의 지급 이력이 시작됩니다.'}</p>
  {state.error&&<p role="alert" className="form-error">{state.error}</p>}
  <button className={`button ${mode==='cancel'?'danger':'primary'}`} disabled={pending}>{label} 완료</button>
 </form></details>;
}
