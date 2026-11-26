import Link from 'next/link';
import {PageHeader,DataTable,Alert,StatusTag} from '@/components/ui/primitives';
import {lifecycleData} from '@/lib/operations/lifecycle-data';
import {lifecycleReadiness} from '@/lib/operations/lifecycle';
import {can} from '@/lib/permissions';
import {TASK_LABELS,TASK_STATES} from '@/lib/operations/types';
import {STATUS_LABELS} from '@/lib/contracts/types';
import {DOCUMENT_TYPES} from '@/lib/hr-documents/types';
import {LifecycleWorkspace} from './lifecycle-workspace';
export async function LifecycleScreen({id}:{id?:string}){
 const data=await lifecycleData(id),{principal,records,people,tasks,today}=data;
 if(!id)return <><PageHeader title="입퇴사 업무" description="진행 중인 체크리스트와 다음 확인 항목을 한곳에서 이어갑니다." actions={<><Link className="button primary" href="/admin/onboarding/new">온보딩 시작</Link>{can(principal,'OFFBOARDING_MANAGE')&&<Link className="button" href="/admin/offboarding/new">퇴사 등록</Link>}</>}/><LifecycleWorkspace records={records} people={people} tasks={tasks} today={today}/></>;
 const person=people[0],detail=data.detail!;
 return <><PageHeader title={`${person.name} · 입퇴사 업무`} description={`${person.title} · 입사일 ${person.hire_date} · ${person.employment_status==='ACTIVE'?'재직':'퇴사'}`} actions={<Link className="button" href={`/people/${id}`}>직원 인사카드</Link>}/><Link href="/admin/lifecycle">입퇴사 업무 목록</Link><Alert>연결 정보는 확인을 돕는 참고 사항입니다. 완료 처리는 기존 체크리스트에서 직접 수행하며 장비 미반납은 퇴사 완료를 차단하지 않습니다.</Alert>
 <div className="lifecycle-grid"><section className="surface lifecycle-panel"><h2>체크리스트</h2>{!records.length&&<p>등록된 업무가 없습니다. <Link href="/admin/onboarding/new">온보딩 시작</Link>{can(principal,'OFFBOARDING_MANAGE')&&<> · <Link href="/admin/offboarding/new">퇴사 등록</Link></>}</p>}{records.map(r=>{const ready=lifecycleReadiness(r,tasks,today);return <section key={r.id}><div className="heading-row"><h3>{r.kind==='onboarding'?'온보딩':'오프보딩'}</h3><StatusTag>{ready.label}</StatusTag><Link className="button size-small" href={`/admin/${r.kind}/${r.id}`}>업무 열기</Link></div><p className="muted">{ready.checks.join(' · ')||'기존 완료 조건을 확인했습니다. 최종 저장 시 다시 검증합니다.'}</p><DataTable head={['항목','상태','작업']} label={`${r.kind} 체크리스트`}>{tasks.filter(t=>t.case_id===r.id).map(t=><tr key={t.id}><td>{TASK_LABELS[t.type]}</td><td>{TASK_STATES[t.status]}</td><td><Link href={`/admin/${r.kind}/${r.id}${r.completed_at?'':`?task=${t.id}`}`}>{r.completed_at?'이력':'담당자·상태 수정'}</Link></td></tr>)}</DataTable></section>;})}</section>
 <aside className="lifecycle-related">{can(principal,'ASSET_MANAGE')&&<section className="surface lifecycle-panel"><h2>현재 장비 {detail.assets.length}대</h2>{detail.assets.map(a=><p key={a.id}><Link href={`/admin/assets/${a.id}`}>{a.model||a.serial_number} · {a.serial_number}</Link></p>)}{!detail.assets.length&&<p className="muted">현재 보유 장비가 없습니다.</p>}<p>인계 확인 대기 {detail.transfers.length}건 · 수신자 확인 전 현재 보유자 유지</p><p className="muted">반납·인계는 장비 화면에서 처리합니다. 자동 회수하지 않습니다.</p></section>}
 {can(principal,'EMPLOYMENT_CONTRACT_MANAGE')&&<section className="surface lifecycle-panel"><h2>근로계약</h2>{detail.contracts.map(c=><p key={c.id}><Link href={`/admin/contracts/${c.id}`}>계약 확인</Link> · {STATUS_LABELS[c.status]}</p>)}{!detail.contracts.length&&<p className="muted">등록된 계약이 없습니다.</p>}<Link href={`/people/${id}?tab=contracts`}>계약 이력 / 관리</Link><p className="muted">계약 내용·서명 권한은 기존 계약 화면에서 별도로 확인합니다.</p></section>}
 {can(principal,'PRIVATE_HR_ACCESS')&&<section className="surface lifecycle-panel"><h2>인사서류</h2>{Object.entries(DOCUMENT_TYPES).map(([type,label])=><p key={type}>{label} · {detail.documents.filter(d=>d.document_type===type).length}개</p>)}<Link href={`/people/${id}?tab=documents`}>인사서류 확인</Link></section>}
 {can(principal,'LEAVE_MANAGE')&&<section className="surface lifecycle-panel"><h2>휴가 확인</h2><Link href={`/admin/leave/${id}`}>휴가 원장 확인</Link><p className="muted">잔액 확인과 외부 정산은 별개입니다. 이 화면은 지급·차감·급여 처리를 하지 않습니다.</p></section>}</aside></div></>;
}
