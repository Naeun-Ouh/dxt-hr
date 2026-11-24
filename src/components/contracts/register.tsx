'use client';
import Link from 'next/link';
import {useState} from 'react';
import {DataTable,EmptyState,StatusTag,SummaryStrip,KPIStat} from '@/components/ui/primitives';
import {GridToolbar,SearchInput} from '@/components/ui/workspace';
import {STATUS_LABELS,seoulTime,type ContractStatus} from '@/lib/contracts/types';
type Entry={id:string;name:string;email:string;status:ContractStatus;version:number;createdAt:string};
export function ContractRegister({rows,admin}:{rows:Entry[];admin:boolean}){
 const [search,setSearch]=useState(''),[status,setStatus]=useState('');
 const visible=rows.filter(r=>(!status||r.status===status)&&`${r.name} ${r.email}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
 return <><SummaryStrip><KPIStat label={admin?'발송 전 검토':'서명 필요'} value={rows.filter(r=>(admin?['DRAFT','READY_TO_SEND']:['SENT','VIEWED']).includes(r.status)).length} unit="건"/><KPIStat label="서명 진행" value={rows.filter(r=>['SENT','VIEWED'].includes(r.status)).length} unit="건"/><KPIStat label="회사 서명 대기" value={rows.filter(r=>r.status==='EMPLOYEE_SIGNED').length} unit="건"/><KPIStat label="완료됨" value={rows.filter(r=>r.status==='COMPLETED').length} unit="건"/><KPIStat label="과거 계약" value={rows.filter(r=>['CANCELLED','DECLINED'].includes(r.status)).length} unit="건"/></SummaryStrip>
 <GridToolbar><SearchInput label="계약 검색" placeholder="이름 · 이메일 검색" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="계약 상태" value={status} onChange={e=>setStatus(e.target.value)}><option value="">전체 상태</option>{Object.entries(STATUS_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><button className="button" onClick={()=>{setSearch('');setStatus('');}}>초기화</button><span>{visible.length}건</span></GridToolbar>
 <DataTable label="근로계약 목록" head={['직원 / 이메일','상태','버전','생성일 (서울)','다음 단계']}>{visible.map(r=><tr key={r.id}><td><strong>{r.name}</strong><small className="contract-email">{r.email}</small></td><td><StatusTag status={r.status}>{STATUS_LABELS[r.status]}</StatusTag></td><td>v{r.version}</td><td>{seoulTime(r.createdAt)}</td><td><Link className="text-link" href={`${admin?'/admin/contracts':'/contracts/me'}/${r.id}`}>{['DRAFT','READY_TO_SEND'].includes(r.status)?'발송 전 검토':r.status==='COMPLETED'?'완료 문서 보기':!admin&&['SENT','VIEWED'].includes(r.status)?'계약 확인 및 서명':'상세 보기'} →</Link></td></tr>)}</DataTable>{!visible.length&&<EmptyState>조건에 맞는 근로계약이 없습니다.</EmptyState>}</>;
}
