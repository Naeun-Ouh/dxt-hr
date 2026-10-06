'use client';
import Link from 'next/link';
import Image from 'next/image';
import {useActionState,useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {submitLeave,decideLeave,adjustLeave} from '@/app/actions/leave';
import {UNITS,STATES,type LeaveRequest,type Summary} from '@/lib/leave/types';
import {workingDays} from '@/lib/leave/validation';
import type {FormState} from '@/lib/employees/types';
function Feedback({state}:{state:FormState}){return <>{state.error&&<p role="alert" className="form-error">{state.error} {Object.values(state.fields||{}).join(' ')}</p>}{state.success&&<p role="status" className="success-banner">{state.success}</p>}</>;}
export function RequestForm({today,balance}:{today:string;balance:number}){
 const [state,action,pending]=useActionState(submitLeave,{}),[start,setStart]=useState(today),[end,setEnd]=useState(today),[unit,setUnit]=useState('FULL_DAY');
 const days=workingDays(start,end,unit);
 return <form action={action} className="surface leave-form"><h2>휴가 신청 작성</h2><Feedback state={state}/>
 <label className="field">휴가 유형<select name="unit" value={unit} onChange={e=>{setUnit(e.target.value);if(e.target.value!=='FULL_DAY')setEnd(start);}}>{Object.entries(UNITS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
 <div className="field-grid"><label className="field">시작일<input type="date" name="start_date" required value={start} onChange={e=>{setStart(e.target.value);if(unit!=='FULL_DAY'||e.target.value>end)setEnd(e.target.value);}}/></label><label className="field">종료일<input type="date" name="end_date" required min={start} readOnly={unit!=='FULL_DAY'} value={end} onChange={e=>setEnd(e.target.value)}/></label></div>
 <label className="field">예상 차감일수<output className="leave-output">{days}일</output></label>
 <p className="muted">당해연차에서 차감합니다. 토·일요일은 제외됩니다. 공휴일 자동 반영은 아직 제공하지 않습니다.</p>
 <label className="field">신청 사유 (선택)<textarea name="reason" maxLength={2000} rows={3}/></label>
 {start<today&&<div className="leave-past"><label className="field">미리 신청하지 못한 사유<input name="past_reason" required maxLength={2000} aria-describedby="past-reason-help"/></label><small id="past-reason-help">과거 날짜 신청에는 사유가 필요합니다.</small></div>}
 {Number(start.slice(0,4))===Number(today.slice(0,4))&&days>balance&&<p className="form-error">사용 가능한 연차가 부족합니다.</p>}
 <div className="button-row"><Link className="button" href="/leave">취소</Link><button className="button primary" disabled={pending}>신청하기</button></div></form>;
}
export function DecisionForm({items,cancel=false,children}:{items?:{id:string;version:number}[];cancel?:boolean;children?:React.ReactNode}){
 const [state,action,pending]=useActionState(decideLeave,{}),dialog=useRef<HTMLDialogElement>(null);
 return <form action={action} className="leave-decisions"><Feedback state={state}/>{items?.map(i=><input key={i.id} type="hidden" name="selection" value={i.id+':'+i.version}/>)}{children}
 <div className="button-row">{!cancel&&<button className="button primary" name="decision" value="APPROVED" disabled={pending}>{items?'승인':'일괄 승인'}</button>}<button type="button" className="button danger" disabled={pending} onClick={()=>dialog.current?.showModal()}>{cancel?'승인 취소':items?'거절':'일괄 거절'}</button></div>
 <dialog ref={dialog} className="leave-confirm" aria-label={cancel?"휴가 승인 취소 확인":"휴가 거절 확인"}><h2>{cancel?'승인된 휴가를 취소할까요?':'휴가 요청을 거절할까요?'}</h2><p>{cancel?'차감 일수를 반환하고 처리 이력을 보존합니다.':'직원은 해당 요청을 수정할 수 없으며 새롭게 휴가를 신청해야 합니다.'}</p><label className="field">{cancel?'취소':'거절'} 사유 (선택)<textarea name="note" maxLength={2000}/></label><div className="button-row"><button type="button" className="button" onClick={()=>dialog.current?.close()}>돌아가기</button><button className="button danger" name="decision" value={cancel?'CANCELLED':'REJECTED'} onClick={()=>dialog.current?.close()} disabled={pending}>{cancel?'취소 확인':'거절 확인'}</button></div></dialog>
 </form>;
}
export function ApprovalTable({rows,names}:{rows:LeaveRequest[];names:Record<string,string>}){
 const [selected,setSelected]=useState<string[]>([]);
 return <DecisionForm><div className="asset-notice">{rows.length}건 중 {selected.filter(id=>rows.some(r=>r.id===id)).length}건 선택됨</div><div className="table-scroll"><table className="asset-table"><thead><tr><th><input aria-label="전체 선택" type="checkbox" checked={rows.length>0&&rows.every(r=>selected.includes(r.id))} onChange={e=>setSelected(e.target.checked?rows.map(r=>r.id):[])}/></th><th>직원</th><th>휴가 유형</th><th>날짜</th><th>사용 일수</th><th>사유</th><th>관리</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><input aria-label={(names[r.employee_id]||'직원')+' '+r.start_date+' 선택'} type="checkbox" name="selection" value={r.id+':'+r.version} checked={selected.includes(r.id)} onChange={e=>setSelected(e.target.checked?[...selected,r.id]:selected.filter(id=>id!==r.id))}/></td><td>{names[r.employee_id]}</td><td>{UNITS[r.unit]}</td><td>{r.start_date} – {r.end_date}</td><td>{r.days}일</td><td className="leave-reason-preview">{r.reason||'—'}</td><td><Link href={'/leave/approvals?request='+r.id}>상세 · 승인/거절</Link></td></tr>)}</tbody></table>{!rows.length&&<p className="empty-state">승인 대기 중인 휴가가 없습니다.</p>}</div></DecisionForm>;
}
export function AdjustmentForm({data}:{data:Summary}){const [state,action,pending]=useActionState(adjustLeave.bind(null,data.employee_id,data.year),{});return <form action={action} className="surface leave-form"><h2>관리자 수동 조정</h2><Feedback state={state}/><input type="hidden" name="version" value={data.version}/><label className="field">조정 일수<input name="delta" type="number" step="0.5" min="-366" max="366" required placeholder="+1 또는 -0.5"/></label><label className="field">조정 사유<textarea name="reason" required maxLength={2000}/></label><p className="muted">입력한 일수와 사유는 연차 원장에 기록됩니다. 잔여 일수는 음수가 될 수 없습니다.</p><button className="button primary" disabled={pending}>조정 저장</button></form>;}
export function LeaveDrawer({children}:{children:React.ReactNode}){const dialog=useRef<HTMLDialogElement>(null),router=useRouter();useEffect(()=>{dialog.current?.showModal();},[]);return <dialog className="leave-drawer" aria-label="휴가 신청 상세" ref={dialog} onCancel={()=>router.replace('/leave/approvals')}><div className="heading-row"><h2>휴가 신청 상세</h2><Link href="/leave/approvals" className="button" aria-label="상세 닫기"><Image src="/figma/LeaveClose.svg" width={18} height={18} alt=""/></Link></div>{children}</dialog>;}
export function LeaveBadge({status}:{status:LeaveRequest['status']}){return <span className={'asset-badge leave-'+status}>{STATES[status]}</span>;}
