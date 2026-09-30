import Link from 'next/link';
import { employeeCareerData, projectData } from '@/lib/projects/data';
export async function EmployeeProjectTab({id,career}:{id:string;career:boolean}) {
 if(career) {
  const data=await employeeCareerData(id);
  if(!data) return <section className="surface"><h2>커리어</h2><p className="project-note">조회 권한이 없는 커리어입니다. 본인 또는 같은 부서 팀장만 조회할 수 있습니다.</p></section>;
  return <><section className="surface"><h2>커리어</h2><p className="project-note">{id===data.selfId?'본인의 프로젝트 경험을 확인합니다.':'팀원 커리어 · 읽기 전용입니다. 작성과 수정은 직원 본인만 할 수 있습니다.'}</p>{id===data.selfId && <Link className="button" href="/career">내 커리어 보기</Link>}</section>
   {data.careers.length?data.careers.map(c=>{
    const assignment=data.assignments.find(a=>a.id===c.assignment_id),project=data.projects.find(p=>p.id===assignment?.project_id);
    return <section className="surface career-record" key={c.id}><h2>{project?.name || '프로젝트'}</h2><p>{project?.customer_name} · {assignment?.start_date} – {assignment?.end_date}</p><h3>{c.job_function} · {c.role}</h3><p className="responsibilities">{c.responsibilities}</p><div className="skill-tags">{c.skills.map(skill=><span className="status-badge" key={skill}>{skill}</span>)}</div></section>;
   }):<section className="surface"><p className="project-note">작성된 커리어가 없습니다.</p></section>}</>;
 }
 const data=await projectData();
 const assignments=data.assignments.filter(a=>a.employee_id===id);
 return <section className="surface"><h2>프로젝트 투입 이력</h2>{assignments.length?<ul className="employee-projects">{assignments.map(a=><li key={a.id}><strong>{data.projects.find(p=>p.id===a.project_id)?.name}</strong><p>{a.start_date} – {a.end_date} · {a.role}</p></li>)}</ul>:<p className="project-note">조회 가능한 투입 이력이 없습니다. 본인 또는 허용된 팀·관리 범위의 정보만 표시합니다.</p>}</section>;
}
