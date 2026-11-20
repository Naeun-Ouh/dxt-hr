'use client';
import {useActionState,useEffect,useState} from 'react';
import {uploadCompanySeal,deactivateCompanySeal,type SealResult} from '@/lib/contracts/seal-actions';
import type {CompanySeal} from '@/lib/contracts/types';
const initial:SealResult={};
export function SealForm({active}:{active?:CompanySeal}){
 const [state,submit,pending]=useActionState(uploadCompanySeal,initial);
 const [stop,stopSubmit,stopping]=useActionState(deactivateCompanySeal,initial);
 const [file,setFile]=useState<File>(),[preview,setPreview]=useState('');
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
 return <div className="seal-editor">
 <form action={submit} className="surface contract-panel" aria-busy={pending}>
 <div><span className="contract-eyebrow">COMPANY SEAL</span><h2>{active?'새 직인으로 교체':'회사 직인 등록'}</h2><p className="contract-muted">새 직인은 이후 회사 서명부터 적용됩니다. 완료된 계약에는 영향을 주지 않습니다.</p></div>
 <input type="hidden" name="expected" value={active?.id||''}/>
 <fieldset disabled={pending}><label>회사명<input name="company" defaultValue={active?.company_name||'DXT'} required maxLength={100}/></label><label>대표자명<input name="representative" defaultValue={active?.representative_name||''} required maxLength={100}/></label>
 <label className="seal-upload">직인 이미지<input name="seal" type="file" accept="image/png" required onChange={e=>{const next=e.target.files?.[0];setFile(next);setPreview(next?URL.createObjectURL(next):'');}}/><small>투명 배경 PNG 권장 · 최대 1MB · 가로/세로 2,048px 이하</small></label>
 {preview&&<div className="seal-local-preview"><img src={preview} alt="업로드할 직인 미리보기" width={120} height={120}/><span>업로드 전 미리보기</span></div>}
 <button className="button primary contract-cta" disabled={!file||pending}>{pending?'검증 및 저장 중…':active?'직인 교체 및 활성화':'직인 등록 및 활성화'}</button></fieldset>
 {state.error&&<p role="alert" className="error-notice">{state.error}</p>}{state.success&&<p role="status" className="success-notice">{state.success}</p>}
 </form>
 {active&&<form action={stopSubmit} className="surface contract-panel seal-stop"><input type="hidden" name="expected" value={active.id}/><h2>직인 없이 서명하기</h2><p>사용을 중지해도 계약 서명은 가능합니다. 이미 회사 서명된 계약은 당시 직인을 유지합니다.</p><button className="button" disabled={stopping}>{stopping?'처리 중…':'직인 사용 중지'}</button>{stop.error&&<p role="alert">{stop.error}</p>}{stop.success&&<p role="status">{stop.success}</p>}</form>}
 </div>;
}
