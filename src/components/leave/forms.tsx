'use client';
import Link from 'next/link';
import Image from 'next/image';
import {useActionState,useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {submitLeave,decideLeave,adjustLeave,grantSource,correctSource,confirmValidity} from '@/app/actions/leave';
import {UNITS,STATES,BUCKETS,type Source,type LeaveRequest,type Summary} from '@/lib/leave/types';
import type {Holiday,HolidayYear} from '@/lib/leave/holidays';
import {workingDays} from '@/lib/leave/validation';
import type {FormState} from '@/lib/employees/types';
function Feedback({state}:{state:FormState}){return <>{state.error&&<p role="alert" className="form-error">{state.error} {Object.values(state.fields||{}).join(' ')}</p>}{state.success&&<p role="status" className="success-banner">{state.success}</p>}</>;}
export function RequestForm({today,sources,projects,years,holidays}:{today:string;sources:Source[];projects:{id:string;name:string}[];years:HolidayYear[];holidays:Holiday[]}){
 const [state,action,pending]=useActionState(submitLeave,{}),[start,setStart]=useState(today),[end,setEnd]=useState(today),[unit,setUnit]=useState('FULL_DAY'),[kind,setKind]=useState('ANNUAL');
 const excluded=holidays.filter(h=>h.active).map(h=>h.day),workDates:string[]=[];
 if(workingDays(start,end,unit,excluded)>0)for(let d=Date.parse(start);d<=Date.parse(end);d+=86400000){const date=new Date(d).toISOString().slice(0,10);if(workingDays(date,date,'FULL_DAY',excluded))workDates.push(date);}
 const balance=sources.filter(s=>s.bucket!=='BIRTHDAY'&&s.validity_confirmed&&workDates.length>0&&s.valid_from!<=workDates[0]&&s.valid_until!>=workDates.at(-1)!).reduce((total,s)=>total+Number(s.balance),0);
 const calendar=years.find(y=>y.year===Number(start.slice(0,4)));
 const days=workingDays(start,end,unit,holidays.filter(h=>h.active).map(h=>h.day));
 return <form action={action} className="surface leave-form"><h2>휴가 신청 작성</h2><input type="hidden" name="calendar_version" value={calendar?.version||0}/>{!calendar&&<p role="alert" className="form-error">선택한 연도의 공휴일 자료가 확인되지 않았습니다. 관리자에게 달력 확인을 요청해 주세요.</p>}<Feedback state={state}/>
 <label className="field">휴가 구분<select name="kind" value={kind} onChange={e=>{setKind(e.target.value);if(e.target.value==='BIRTHDAY'){setUnit('AM_HALF');setEnd(start);}}}><option value="ANNUAL">연차 · 대체휴가</option><option value="BIRTHDAY">생일 반차</option></select></label>
 <label className="field">휴가 유형<select name="unit" value={unit} onChange={e=>{setUnit(e.target.value);if(e.target.value!=='FULL_DAY')setEnd(start);}}>{Object.entries(UNITS).filter(([v])=>kind!=='BIRTHDAY'||v!=='FULL_DAY').map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
 <div className="field-grid"><label className="field">시작일<input type="date" name="start_date" required value={start} onChange={e=>{setStart(e.target.value);if(unit!=='FULL_DAY'||e.target.value>end)setEnd(e.target.value);}}/></label><label className="field">종료일<input type="date" name="end_date" required min={start} readOnly={unit!=='FULL_DAY'} value={end} onChange={e=>setEnd(e.target.value)}/></label></div>
 <label className="field">예상 차감일수<output className="leave-output">{days}일</output></label>
 <p className="muted">대체휴가 → 이월연차 → 당해연차 순으로 차감합니다. 생일 반차는 별도 연 0.5일입니다. 토·일요일과 공휴일·회사 휴일은 제외됩니다. 달력이 변경되면 새로고침 후 신청해 주세요.</p>
 {kind==='BIRTHDAY'&&<><p className="asset-notice">생일 전후 7일에 사용합니다. 프로젝트로 사용하지 못한 경우 사유를 남겨 주세요. 윤일·연도 경계는 담당자 확인이 필요합니다.</p><label className="field">생일 기간에 참여한 프로젝트 (예외 사용 시)<select name="project"><option value="">선택해 주세요</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><p className="muted">생일 전후 7일에 참여한 프로젝트로 사용하지 못한 경우에만 예외 신청합니다. 팀장 본인도 별도 승인자가 검토합니다.</p><label className="field">프로젝트 예외 사유 (해당 시)<textarea name="exception_reason" maxLength={2000} rows={2}/></label></>}
 <label className="field">신청 사유 (선택)<textarea name="reason" maxLength={2000} rows={3}/></label>
 {start<today&&<div className="leave-past"><label className="field">미리 신청하지 못한 사유<input name="past_reason" required maxLength={2000} aria-describedby="past-reason-help"/></label><small id="past-reason-help">과거 날짜 신청에는 사유가 필요합니다.</small></div>}
 {kind==='ANNUAL'&&<p className="muted">선택한 날짜에 사용 가능한 확인된 휴가: {balance}일. 사용기간 경계를 넘으면 나누어 신청해 주세요.</p>}
 {kind==='ANNUAL'&&days>balance&&<p className="form-error">사용 가능한 연차가 부족합니다.</p>}
 <div className="button-row"><Link className="button" href="/leave">취소</Link><button className="button primary" disabled={pending||!calendar||days===0}>신청하기</button></div></form>;
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
 return <DecisionForm><div className="asset-notice">{rows.length}건 중 {selected.filter(id=>rows.some(r=>r.id===id)).length}건 선택됨</div><div className="table-scroll"><table className="asset-table"><thead><tr><th><input aria-label="전체 선택" type="checkbox" checked={rows.length>0&&rows.every(r=>selected.includes(r.id))} onChange={e=>setSelected(e.target.checked?rows.map(r=>r.id):[])}/></th><th>직원</th><th>휴가 유형</th><th>날짜</th><th>사용 일수</th><th>사유</th><th>관리</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><input aria-label={(names[r.employee_id]||'직원')+' '+r.start_date+' 선택'} type="checkbox" name="selection" value={r.id+':'+r.version} checked={selected.includes(r.id)} onChange={e=>setSelected(e.target.checked?[...selected,r.id]:selected.filter(id=>id!==r.id))}/></td><td>{names[r.employee_id]}</td><td>{r.kind==='BIRTHDAY'?'생일 · ':''}{UNITS[r.unit]}</td><td>{r.start_date} – {r.end_date}</td><td>{r.days}일</td><td className="leave-reason-preview">{r.reason||'—'}</td><td><Link href={'/leave/approvals?request='+r.id}>상세 · 승인/거절</Link></td></tr>)}</tbody></table>{!rows.length&&<p className="empty-state">승인 대기 중인 휴가가 없습니다.</p>}</div></DecisionForm>;
}
export function AdjustmentForm({data}:{data:Summary}){const [state,action,pending]=useActionState(adjustLeave.bind(null,data.employee_id,data.year),{});return <form action={action} className="surface leave-form"><h2>관리자 수동 조정</h2><Feedback state={state}/><input type="hidden" name="version" value={data.version}/><label className="field">조정 일수<input name="delta" type="number" step="0.5" min="-366" max="366" required placeholder="+1 또는 -0.5"/></label><label className="field">조정 사유<textarea name="reason" required maxLength={2000}/></label><p className="muted">입력한 일수와 사유는 연차 원장에 기록됩니다. 잔여 일수는 음수가 될 수 없습니다.</p><button className="button primary" disabled={pending}>조정 저장</button></form>;}
export function LeaveDrawer({children}:{children:React.ReactNode}){const dialog=useRef<HTMLDialogElement>(null),router=useRouter();useEffect(()=>{dialog.current?.showModal();},[]);return <dialog className="leave-drawer" aria-label="휴가 신청 상세" ref={dialog} onCancel={()=>router.replace('/leave/approvals')}><div className="heading-row"><h2>휴가 신청 상세</h2><Link href="/leave/approvals" className="button" aria-label="상세 닫기"><Image src="/figma/LeaveClose.svg" width={18} height={18} alt=""/></Link></div>{children}</dialog>;}
export function LeaveBadge({status}:{status:LeaveRequest['status']}){return <span className={'asset-badge leave-'+status}>{STATES[status]}</span>;}

export function SourceManager({data,sources}:{data:Summary;sources:Source[]}){
 const [grantState,grantAction,grantPending]=useActionState(grantSource.bind(null,data.employee_id,data.year),{});
 const [fixState,fixAction,fixPending]=useActionState(correctSource.bind(null,data.employee_id,data.year),{});
 const adjustable=sources.filter(s=>s.bucket!=='BIRTHDAY'&&Number(s.balance)>0),[selected,setSelected]=useState(adjustable[0]?.id||'');
 const current=adjustable.find(s=>s.id===selected);
 return <section className="surface leave-form"><h2>확인된 휴가 부여 · 정정</h2><p className="muted">{data.year}년은 사용 연도(이월은 수령 연도)이며 12월 31일까지 사용합니다. 확인된 잔여 내역만 반영하세요. 주말근무 승인이나 이월 후보 선정만으로 자동 부여되지 않습니다.</p>
 <form action={grantAction}><Feedback state={grantState}/><input type="hidden" name="version" value={data.version}/><div className="field-grid"><label className="field">부여 구분<select name="bucket">{Object.entries(BUCKETS).filter(([key])=>key!=='BIRTHDAY').map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label className="field">부여 일수<input name="days" type="number" min="0.5" max="366" step="0.5" required/></label></div><label className="field">확인 근거 · 부여 사유<input name="reason" required maxLength={2000}/></label><button className="button primary" disabled={grantPending}>확인된 휴가 부여</button></form>
 {adjustable.length>0&&<details><summary>잘못 반영한 부여 내역 정정</summary><form action={fixAction}><Feedback state={fixState}/><input type="hidden" name="version" value={current?.version||0}/><label className="field">정정할 부여 내역<select name="source" value={selected} onChange={e=>setSelected(e.target.value)}>{adjustable.map(s=><option key={s.id} value={s.id}>{s.year} {BUCKETS[s.bucket]} · {s.note} · 잔여 {s.balance}일</option>)}</select></label><label className="field">줄일 일수<input name="days" type="number" min="0.5" max={current?.balance||0} step="0.5" required/></label><label className="field">정정 사유<input name="reason" required maxLength={2000}/></label><button className="button" disabled={fixPending}>차감 정정 기록</button></form></details>}
 <ValidityForm employee={data.employee_id} year={data.year} sources={sources.filter(s=>!s.validity_confirmed)}/>
 </section>;
}

function ValidityForm({employee,year,sources}:{employee:string;year:number;sources:Source[]}){
 const [state,action,pending]=useActionState(confirmValidity.bind(null,employee,year),{}),[selected,setSelected]=useState(sources[0]?.id||'');const source=sources.find(s=>s.id===selected);
 if(!sources.length)return null;
 return <details><summary>기존 부여 내역의 사용기간 확인</summary><p className="muted">원장 잔액은 그대로 보존됩니다. 확인된 근거로 기간을 등록한 후에만 사용할 수 있으며 등록한 증적은 덮어쓰지 않습니다.</p><form action={action}><Feedback state={state}/><input type="hidden" name="version" value={source?.version||0}/><label className="field">확인할 부여 내역<select name="source" value={selected} onChange={e=>setSelected(e.target.value)}>{sources.map(s=><option key={s.id} value={s.id}>{s.year} {BUCKETS[s.bucket]} · {s.note}</option>)}</select></label><label className="field">사용 연도 (이월 수령 연도)<input name="receiving_year" type="number" required defaultValue={year}/></label><div className="field-grid"><label className="field">사용 시작일<input name="from" type="date" required defaultValue={year+'-01-01'}/></label><label className="field">사용 종료일<input name="until" type="date" required defaultValue={year+'-12-31'}/></label></div><label className="field">기간 확인 근거<input name="reason" required maxLength={2000}/></label><button className="button" disabled={pending}>사용기간 확인 기록</button></form></details>;
}
