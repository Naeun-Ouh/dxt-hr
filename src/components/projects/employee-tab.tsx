import Link from 'next/link';
import { projectData } from '@/lib/projects/data';
export async function EmployeeProjectTab({id,career}:{id:string;career:boolean}) {
 const data=await projectData();
 if(career) return <section className="surface"><h2>커리어</h2><p className="project-note">커리어는 본인만 조회하고 수정할 수 있습니다.</p>{id===data.selfId && <Link className="button" href="/career">내 커리어 보기</Link>}</section>;
 const assignments=data.assignments.filter(a=>a.employee_id===id);
 return <section className="surface"><h2>프로젝트 투입 이력</h2>{assignments.length?<ul className="employee-projects">{assignments.map(a=><li key={a.id}><strong>{data.projects.find(p=>p.id===a.project_id)?.name}</strong><p>{a.start_date} – {a.end_date} · {a.role}</p></li>)}</ul>:<p className="project-note">조회 가능한 투입 이력이 없습니다. 본인 또는 허용된 팀·관리 범위의 정보만 표시합니다.</p>}</section>;
}
