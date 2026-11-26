import Link from 'next/link';
import {can,type Principal} from '@/lib/permissions';
import {weekendData} from '@/lib/leave/weekend-data';
import {projectData} from '@/lib/projects/data';
import {WeekendWorkspace} from './weekend-forms';
export async function WeekendScreen({review,principal}:{review:boolean;principal:Principal}){
 const [data,projects]=await Promise.all([weekendData(review),projectData()]);const own=new Set(projects.assignments.filter(a=>a.employee_id===data.self).map(a=>a.project_id));
 return <><div className="page-heading"><h1>{review?'주말근무 검토':'내 주말근무'}</h1><p>실제 근무 내역을 기록하고 팀 검토 이력을 남깁니다.</p></div><div className="button-row"><Link className="button" href="/leave">내 휴가</Link><Link className="button" href="/leave/weekend-work">내 주말근무</Link>{can(principal,'TEAM_LEAVE_APPROVE')&&<Link className="button" href="/leave/weekend-work/approvals">주말근무 검토</Link>}</div><p className="asset-notice">현재는 근무 사실 확인 단계입니다. 표시 일수는 참고 계산이며 대휴 잔액·임금에는 반영하지 않습니다. 지급 정책 확정 후 별도 처리합니다. 팀장 본인 근무는 승인자 정책 확인 전까지 대기합니다.</p><WeekendWorkspace {...data} review={review} names={Object.fromEntries(projects.employees.map(e=>[e.id,e.name]))} projects={projects.projects.filter(p=>own.has(p.id)).map(p=>({id:p.id,name:p.name}))}/></>;
}
