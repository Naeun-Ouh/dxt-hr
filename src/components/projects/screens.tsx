import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireCapability } from '@/lib/auth/access';
import { can } from '@/lib/permissions';
import type { SearchParams } from '@/lib/employees/data';
import { isUuid } from '@/lib/employees/validation';
import { careerData, projectData, projectExtensions } from '@/lib/projects/data';
import { canReadCareerFor } from '@/lib/projects/access';
import { coveredPeriods } from '@/lib/projects/coverage';
import { isCurrent, STATUSES, todayInSeoul, type Assignment, type Project, type Status } from '@/lib/projects/types';
import { AssignmentForm, CareerForm, DeleteRecord, ExtensionForm, ProjectForm } from './forms';
const text = (query:SearchParams,key:string) => typeof query[key]==='string' ? query[key] as string : '';
function Heading({title,description,children}:{title:string;description:string;children?:React.ReactNode}) {return <div className="page-heading heading-row project-heading"><div><h1>{title}</h1><p>{description}</p></div>{children}</div>;}
function Notice({query}:{query:SearchParams}) { return query.saved==='1' || query.deleted==='1' ? <p role="status" className="success-banner">{query.saved==='1'?'저장했습니다.':'삭제했습니다.'}</p> : null; }
function Badge({status}:{status:Status}) {return <span className={`status-badge project-${status.toLowerCase()}`}>{STATUSES[status]}</span>;}
function Empty({children}:{children:React.ReactNode}) {return <div className="table-empty">{children}</div>;}
function Table({head,children}:{head:string[];children:React.ReactNode}) {return <div className="project-table table-scroll"><table><thead><tr>{head.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;}
const period = (start:string,end:string) => `${start} – ${end}`;
export async function ProjectList({query}:{query:SearchParams}) {
 const {projects,assignments,employees}=await projectData(true), today=todayInSeoul();
 const q=text(query,'q').trim().slice(0,100), status=text(query,'status'), customer=text(query,'customer');
 const filtered=projects.filter(p=>(!q || `${p.name} ${p.customer_name}`.toLocaleLowerCase().includes(q.toLocaleLowerCase())) && (!status || p.status===status) && (!customer || p.customer_name===customer)).sort((a,b)=>b.start_date.localeCompare(a.start_date)||a.name.localeCompare(b.name));
 const pages=Math.max(1,Math.ceil(filtered.length/12)), page=Math.min(pages,Math.max(1,Math.floor(Number(text(query,'page'))) || 1));
 const link=(n:number)=>`/admin/projects?${new URLSearchParams({q,status,customer,page:String(n)})}`;
 return <><Heading title="프로젝트 관리" description="유상 외부 고객 프로젝트와 인력 투입 현황을 관리합니다."><Link className="button primary" href="/admin/projects/new">+ 프로젝트 등록</Link></Heading><Notice query={query}/>
 <div className="project-stats">{[['진행 중 프로젝트',projects.filter(p=>p.status==='ACTIVE').length,'개'],['현재 투입 인원',new Set(assignments.filter(a=>isCurrent(a,today)).map(a=>`${a.project_id}:${a.employee_id}`)).size,'명 · 프로젝트 중복 포함'],['30일 이내 종료 예정',projects.filter(p=>p.status!=='COMPLETED' && p.current_end_date>=today && Date.parse(p.current_end_date)-Date.parse(today)<=30*86400000).length,'개']].map(([label,value,unit])=><section className="surface" key={label}><p>{label}</p><strong>{value}</strong><span>{unit}</span></section>)}</div>
 <form className="filter-bar project-filter"><label>상태<select name="status" defaultValue={status}><option value="">전체 상태</option>{Object.entries(STATUSES).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>고객사<select name="customer" defaultValue={customer}><option value="">전체 고객사</option>{[...new Set(projects.map(p=>p.customer_name))].sort().map(c=><option key={c}>{c}</option>)}</select></label><input name="q" aria-label="프로젝트 검색" placeholder="프로젝트명 또는 고객사 검색" defaultValue={q}/><button className="button">검색</button></form>
 <section className="project-list"><Table head={['고객사','프로젝트명','기간','PM','투입','상태','관리']}>{filtered.slice((page-1)*12,page*12).map(p=><tr key={p.id}><td>{p.customer_name}</td><td><Link className="project-name" href={`/admin/projects/${p.id}`}>{p.name}</Link></td><td>{period(p.start_date,p.current_end_date)}</td><td>{employees.find(e=>e.id===p.pm_employee_id)?.name}</td><td>{new Set(assignments.filter(a=>a.project_id===p.id).map(a=>a.employee_id)).size}명</td><td><Badge status={p.status}/></td><td><Link className="text-link" href={`/admin/projects/${p.id}/edit`}>수정</Link></td></tr>)}</Table>{!filtered.length && <Empty>조건에 맞는 프로젝트가 없습니다.</Empty>}<footer className="table-footer"><span>총 {filtered.length}개</span><div className="button-row">{page>1 && <Link href={link(page-1)}>이전</Link>}<span>{page} / {pages}</span>{page<pages && <Link href={link(page+1)}>다음</Link>}</div></footer></section>
 <aside className="project-info"><strong>외부 유상 프로젝트만 관리합니다</strong><p>내부 R&amp;D, 무상 업무, 일반 작업은 포함하지 않습니다. 동시 투입은 개별 기록으로 유지됩니다.</p></aside></>;
}
export async function ProjectEditor({id}:{id?:string}) {
 const data=await projectData(true), project=data.projects.find(p=>p.id===id);
 if(id && (!isUuid(id)||!project)) notFound();
 return <><Heading title={id?'프로젝트 수정':'프로젝트 등록'} description="고객 계약과 투입 기간의 기준 정보를 입력합니다."/><ProjectForm project={project} employees={data.employees}/></>;
}
function ProjectFacts({project,pm}:{project:Project;pm:string}) {
 return <section className="surface project-summary"><div className="panel-heading"><h2>{project.name}</h2><Badge status={project.status}/></div><dl className="project-facts">{[['고객사',project.customer_name],['시작일',project.start_date],['현재 종료일',project.current_end_date],['PM',pm],['근무지',project.work_location]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>;
}
export async function ProjectDetail({id,query}:{id:string;query:SearchParams}) {
 const data=await projectData(true), project=data.projects.find(p=>p.id===id);
 if(!isUuid(id)||!project) notFound();
 const assignments=data.assignments.filter(a=>a.project_id===id), history=await projectExtensions(id), edit=text(query,'assignment');
 const selected=assignments.find(a=>a.id===edit); if(edit && edit!=='new' && !selected) notFound();
 return <><Heading title="프로젝트 상세" description="프로젝트 기본 정보, 인력 투입과 종료일 변경 이력을 관리합니다."><div className="button-row"><Link className="button" href="/admin/projects">목록</Link><Link className="button primary" href={`/admin/projects/${id}/edit`}>프로젝트 수정</Link></div></Heading><Notice query={query}/><ProjectFacts project={project} pm={data.employees.find(e=>e.id===project.pm_employee_id)?.name || '—'}/>
 <section className="project-section"><div className="panel-heading"><h2>투입 인력 <span>{new Set(assignments.map(a=>a.employee_id)).size}명</span></h2><Link className="button primary" href={`/admin/projects/${id}?assignment=new`}>+ 투입 추가</Link></div><Table head={['직원','역할','시작일','종료일','상태','관리']}>{assignments.map(a=><tr key={a.id}><td>{data.employees.find(e=>e.id===a.employee_id)?.name}</td><td>{a.role}</td><td>{a.start_date}</td><td>{a.end_date}</td><td><Badge status={a.status}/></td><td><Link className="text-link" href={`/admin/projects/${id}?assignment=${a.id}`}>수정</Link><DeleteRecord kind="assignment" id={a.id} projectId={id} version={a.version}/></td></tr>)}</Table>{!assignments.length && <Empty>등록된 투입 인력이 없습니다.</Empty>}</section>
 {edit && <AssignmentForm project={project} assignment={selected} employees={data.employees}/>}
 <section className="surface extension-section"><h2>종료일 변경 / 연장 이력</h2><ExtensionForm project={project}/>{history.length?<Table head={['이전 종료일','새 종료일','사유','변경 시각 (서울)','변경 계정']}>{history.map(h=><tr key={h.id}><td>{h.previous_end_date}</td><td>{h.new_end_date}</td><td>{h.reason || '—'}</td><td>{new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}).format(new Date(h.changed_at))}</td><td>{h.changed_by_name}</td></tr>)}</Table>:<p className="project-note">아직 변경 이력이 없습니다.</p>}</section><DeleteRecord kind="project" id={id} projectId={id} version={project.version}/></>;
}
function AssignmentCard({a,p,pm}:{a:Assignment;p:Project;pm:string}) {return <section className="surface assignment-card"><div className="panel-heading"><h2><Link href={`/projects/assignments/${a.id}`}>{p.name}</Link></h2><Badge status={a.status}/></div><dl className="project-facts">{[['고객사',p.customer_name],['투입 기간',period(a.start_date,a.end_date)],['역할',a.role],['PM',pm],['근무지',p.work_location]].map(([l,v])=><div key={l}><dt>{l}</dt><dd>{v}</dd></div>)}</dl></section>;}
export async function MyProjects({id}:{id?:string}) {
 const data=await projectData(), own=data.assignments.filter(a=>a.employee_id===data.selfId), today=todayInSeoul();
 if(id && (!isUuid(id)||!own.some(a=>a.id===id))) notFound();
 const active=own.filter(a=>isCurrent(a,today)), history=own.filter(a=>!isCurrent(a,today));
 const cards=(list:Assignment[])=>list.map(a=>{const p=data.projects.find(p=>p.id===a.project_id)!;return <AssignmentCard key={a.id} a={a} p={p} pm={data.employees.find(e=>e.id===p.pm_employee_id)?.name || '—'}/>;});
 return <><Heading title={id?'내 투입 상세':'내 프로젝트'} description="현재 참여 중인 프로젝트와 이전 투입 이력을 확인합니다."/>{!data.selfId?<Empty>연결된 직원 프로필이 없습니다. 관리자에게 계정 연결을 요청해 주세요.</Empty>:id?cards(own.filter(a=>a.id===id)):<><h2 className="project-section-title">현재 투입 프로젝트</h2>{active.length?cards(active):<section className="surface"><Empty>현재 투입 중인 프로젝트가 없습니다.</Empty></section>}<section className="project-section"><h2 className="project-section-title">예정 / 이전 프로젝트</h2><Table head={['프로젝트','고객사','투입 기간','역할','PM / 근무지','상태']}>{history.map(a=>{const p=data.projects.find(p=>p.id===a.project_id)!;return <tr key={a.id}><td><Link className="project-name" href={`/projects/assignments/${a.id}`}>{p.name}</Link></td><td>{p.customer_name}</td><td>{period(a.start_date,a.end_date)}</td><td>{a.role}</td><td>{data.employees.find(e=>e.id===p.pm_employee_id)?.name} / {p.work_location}</td><td><Badge status={a.status}/></td></tr>;})}</Table>{!history.length && <Empty>예정 또는 이전 투입 이력이 없습니다.</Empty>}</section></>}
 <section className="surface career-cta"><div><h2>프로젝트 경험을 커리어에 정리해보세요</h2><p>진행 중인 프로젝트도 승인 없이 직접 기록할 수 있습니다.</p></div><Link className="button primary" href="/career/new">커리어 작성</Link></section></>;
}
export async function ResourceView({team,query}:{team?:boolean;query:SearchParams}) {
 await requireCapability(team?'TEAM_PROJECT_READ':'PROJECT_MANAGE');
 const data=await projectData(!team), today=todayInSeoul(), raw=Number(text(query,'year')), year=Number.isInteger(raw)&&raw>=1900&&raw<=9999?raw:Number(today.slice(0,4));
 const self=data.employees.find(e=>e.id===data.selfId), employees=team&&!can(data.principal,'PROJECT_MANAGE')?data.employees.filter(e=>self?.department_id && e.department_id===self.department_id):data.employees;
 return <><Heading title={team?'팀 프로젝트 현황':'인력 투입 현황'} description="직원별 프로젝트 투입과 선택 연도의 중복 없는 기간을 확인합니다."><form className="button-row"><label className="field">기준 연도<input aria-label="기준 연도" name="year" type="number" min="1900" max="9999" defaultValue={year}/></label><button className="button">조회</button></form></Heading><aside className="project-info"><strong>중복 없는 투입 기간 · {year}년</strong><p>동시 프로젝트의 겹치는 날짜는 한 번만 셉니다. 예정 투입을 포함한 등록 기간 기준입니다. 가동률 분모 정책은 미정이므로 비율을 표시하지 않으며, 휴가 이월 판정에 사용하지 않습니다.</p>{team && <p>팀장은 본인과 같은 부서만 조회합니다. 부서가 없으면 팀 범위를 조회할 수 없습니다.</p>}</aside>
 <Table head={['직원','부서','현재 프로젝트','중복 제외 일수','해당 연도 투입 기간','근무 상태']}>{employees.map(e=>{const assignments=data.assignments.filter(a=>a.employee_id===e.id),coverage=coveredPeriods(assignments,year);return <tr key={e.id}><td><strong>{e.name}</strong><small>{e.title}</small>{team && canReadCareerFor(data.principal,self,e) && <Link className="text-link" href={`/people/${e.id}?tab=career`}>커리어 보기</Link>}</td><td>{data.organizations.find(o=>o.id===e.department_id)?.name || '미지정'}</td><td>{assignments.filter(a=>isCurrent(a,today)).map(a=><div key={a.id}>{data.projects.find(p=>p.id===a.project_id)?.name} · {a.role}</div>)}</td><td><strong className="coverage-days">{coverage.days}일</strong></td><td>{coverage.periods.length?coverage.periods.map(p=><div key={p.start_date}>{period(p.start_date,p.end_date)}</div>):'투입 없음'}</td><td>{e.employment_status==='ACTIVE'?'재직':'퇴사'}</td></tr>;})}</Table>{!employees.length && <Empty>조회 가능한 팀 직원이 없습니다.</Empty>}</>;
}
export async function CareerScreen({id,create,query}:{id?:string;create?:boolean;query:SearchParams}) {
 const data=await careerData(), career=data.careers.find(c=>c.id===id);
 if(id && (!isUuid(id)||!career)) notFound();
 return <><Heading title={id||create?'커리어 작성':'커리어'} description="프로젝트 경험과 역할을 직접 기록하여 회사 인력 프로필로 관리합니다.">{!id&&!create ? <Link href="/career/new" className="button primary">+ 커리어 작성</Link> : data.assignments.length>0 && <button form="career-editor" className="button primary">저장</button>}</Heading><Notice query={query}/>
 {!data.selfId?<section className="surface"><Empty>연결된 직원 프로필이 없습니다. 관리자에게 계정 연결을 요청해 주세요.</Empty></section>:id||create?data.assignments.length?<CareerForm career={career} assignments={data.assignments} projects={data.projects} name={data.employees.find(e=>e.id===data.selfId)?.name || data.principal.name}/>:<section className="surface"><Empty>등록된 본인 투입 이력이 있어야 커리어를 작성할 수 있습니다.</Empty></section>:<>{data.careers.length?data.careers.map(c=>{const a=data.assignments.find(a=>a.id===c.assignment_id)!,p=data.projects.find(p=>p.id===a.project_id)!;return <section className="surface career-record" key={c.id}><div className="panel-heading"><h2>{p.name}</h2><Link className="button" href={`/career/${c.id}/edit`}>커리어 수정</Link></div><p>{p.customer_name} · {period(a.start_date,a.end_date)}</p><h3>{c.job_function} · {c.role}</h3><p className="responsibilities">{c.responsibilities}</p><div className="skill-tags">{c.skills.map(s=><span className="status-badge" key={s}>{s}</span>)}</div></section>;}):<section className="surface"><Empty>아직 작성한 커리어가 없습니다. 본인의 프로젝트 경험을 기록해 보세요.</Empty></section>}</>}
 </>;
}
