'use client';
import {useActionState,useState} from 'react';
import {saveHoliday} from '@/app/actions/holidays';
import {Modal,WorkToolbar,SearchInput} from '@/components/ui/workspace';
import type {Holiday,HolidayYear} from '@/lib/leave/holidays';
const labels={STATUTORY:'공휴일',SUBSTITUTE:'대체공휴일',COMPANY:'회사 휴일'};
function Editor({record,year}:{record:Holiday|null;year:number}){
 const [state,action,pending]=useActionState(saveHoliday,{});
 return <form action={action} className="operations-form"><input type="hidden" name="version" value={record?.version||0}/>{record&&<input type="hidden" name="id" value={record.id}/>}
 {state.error&&<p role="alert" className="form-error">{state.error}</p>}{state.success&&<p role="status">{state.success}</p>}
 <label className="field">휴일 날짜<input type="date" name="day" required min={`${year}-01-01`} max={`${year}-12-31`} defaultValue={record?.day}/></label>
 <label className="field">휴일명<input name="name" required maxLength={100} defaultValue={record?.name}/></label>
 <p className="muted">승인된 휴가와 원장은 변경하지 않습니다. 해당 날짜가 포함된 대기 신청은 차감일을 다시 확인해야 합니다.</p>
 <div className="button-row"><button name="active" value="true" className="button primary" disabled={pending}>저장</button>{record&&<button name="active" value="false" className="button danger" disabled={pending}>회사 휴일 삭제</button>}</div></form>;
}
export function HolidayWorkspace({years,holidays}:{years:HolidayYear[];holidays:Holiday[]}){
 const [year,setYear]=useState(years.find(y=>y.year===new Date().getFullYear())?.year||years.at(-1)?.year||new Date().getFullYear()),[search,setSearch]=useState(''),[editing,setEditing]=useState<Holiday|null|undefined>();
 const source=years.find(y=>y.year===year),rows=holidays.filter(h=>h.year===year&&h.active&&h.name.includes(search));
 return <><div className="page-heading"><h1>근무 캘린더</h1><p>공휴일과 회사 휴일을 휴가 계산에 반영합니다.</p></div>
 <WorkToolbar actions={<button className="button primary" disabled={!source} onClick={()=>setEditing(null)}>회사 휴일 추가</button>}><select aria-label="달력 연도" value={year} onChange={e=>setYear(Number(e.target.value))}>{years.map(y=><option key={y.year}>{y.year}</option>)}</select><SearchInput label="휴일 검색" value={search} onChange={e=>setSearch(e.target.value)} placeholder="휴일명 검색"/></WorkToolbar>
 <p className="muted">{source?.source_version} · 확인 {source?.verified_at} · 달력 버전 {source?.version} · <a href={source?.source} target="_blank" rel="noreferrer">출처</a></p>
 <p className="asset-notice">확인된 연도만 휴가를 신청할 수 있습니다. 다음 연도 자료는 공식 발표와 변경 법령을 검증한 후 추가합니다. 토·일요일은 별도 등록 없이 제외됩니다.</p>
 <div className="surface table-scroll"><table className="asset-table"><thead><tr><th>날짜</th><th>휴일명</th><th>구분</th><th>관리</th></tr></thead><tbody>{rows.map(h=><tr key={h.id}><td>{h.day}</td><td>{h.name}</td><td>{labels[h.kind]}</td><td>{h.kind==='COMPANY'?<button className="button" onClick={()=>setEditing(h)}>{h.name} 수정</button>:'공식 자료'}</td></tr>)}</tbody></table>{!rows.length&&<p className="empty-state">해당 휴일이 없습니다.</p>}</div>
 <Modal open={editing!==undefined} onClose={()=>setEditing(undefined)} title={editing?'회사 휴일 수정':'회사 휴일 추가'}>{editing!==undefined&&<Editor key={editing?.id||'new'} record={editing} year={year}/>}</Modal></>;
}
