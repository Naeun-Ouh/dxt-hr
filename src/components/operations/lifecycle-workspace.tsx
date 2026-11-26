'use client';
import {useState} from 'react';
import Link from 'next/link';
import {DataTable,StatusTag} from '@/components/ui/primitives';
import {WorkToolbar,SearchInput} from '@/components/ui/workspace';
import {lifecycleReadiness,type LifecycleTask} from '@/lib/operations/lifecycle';
import type {OperationCase} from '@/lib/operations/types';
import type {Person} from '@/lib/operations/data';
export function LifecycleWorkspace({records,people,tasks,today}:{records:OperationCase[];people:Person[];tasks:LifecycleTask[];today:string}){
 const [search,setSearch]=useState(''),[kind,setKind]=useState('ALL'),[status,setStatus]=useState('OPEN');
 const person=(id:string)=>people.find(p=>p.id===id);
 const rows=records.filter(r=>(kind==='ALL'||r.kind===kind)&&(status==='ALL'||Boolean(r.completed_at)===(status==='DONE'))&&`${person(r.employee_id)?.name||''} ${person(r.employee_id)?.title||''}`.toLowerCase().includes(search.toLowerCase()));
 return <><WorkToolbar><SearchInput label="입퇴사 업무 검색" placeholder="직원 이름·직책 검색" value={search} onChange={e=>setSearch(e.target.value)}/><label>업무 <select value={kind} onChange={e=>setKind(e.target.value)}><option value="ALL">전체 업무</option><option value="onboarding">온보딩</option><option value="offboarding">오프보딩</option></select></label><label>처리 상태 <select value={status} onChange={e=>setStatus(e.target.value)}><option value="OPEN">진행 중</option><option value="DONE">완료</option><option value="ALL">전체</option></select></label></WorkToolbar><DataTable label="입퇴사 업무 목록" head={['직원','업무','기준일','확인 항목','상태','바로가기']}>{rows.map(r=>{const p=person(r.employee_id),ready=lifecycleReadiness(r,tasks,today);return <tr key={r.id}><td><Link href={`/admin/lifecycle/${r.employee_id}`}>{p?.name||'직원 정보 확인'}</Link><div className="muted">{p?.title}</div></td><td>{r.kind==='onboarding'?'온보딩':'오프보딩'}</td><td>{r.kind==='onboarding'?p?.hire_date:r.resignation_date||'미입력'}</td><td>{ready.checks.join(' · ')||'추가 확인 항목 없음'}</td><td><StatusTag tone={r.completed_at?'success':ready.checks.length?'warning':'info'}>{ready.label}</StatusTag></td><td><Link className="button size-small" href={`/admin/${r.kind}/${r.id}`}>{r.completed_at?'이력 보기':'체크리스트 열기'}</Link></td></tr>;})}{!rows.length&&<tr><td colSpan={6}>현재 조건에 해당하는 입퇴사 업무가 없습니다. 직원 등록 후 기존 온보딩 또는 퇴사 등록으로 시작하세요.</td></tr>}</DataTable></>;
}
