'use client';
import { Children, cloneElement, Fragment, isValidElement, useActionState, useId, useState } from 'react';
import Link from 'next/link';
import { saveProjectRecord, deleteProjectRecord } from '@/app/actions/projects';
import type { Employee, FormState } from '@/lib/employees/types';
import { STATUSES, type Project, type Assignment, type Career } from '@/lib/projects/types';
function Feedback({state}:{state:FormState}) { return state.error ? <p role="alert" className="form-error">{state.error}</p> : null; }
function Field({name,label,state,children}:{name:string;label:string;state:FormState;children:React.ReactNode}) {
 const id=useId();
 const controls=(nodes:React.ReactNode):React.ReactNode=>Children.map(nodes,child=>{
  if(!isValidElement<{id?:string;type?:string;children?:React.ReactNode;'aria-invalid'?:boolean;'aria-describedby'?:string}>(child))return child;
  if(child.type===Fragment)return cloneElement(child,{},controls(child.props.children));
  return (typeof child.type==='function' || ['input','select','textarea'].includes(String(child.type))) && child.props.type!=='hidden' ? cloneElement(child,{id,'aria-invalid':Boolean(state.fields?.[name]),'aria-describedby':state.fields?.[name]?`${id}-error`:undefined}):child;
 });
 return <div className="field"><label htmlFor={id}>{label}</label>{controls(children)}{state.fields?.[name] && <small id={`${id}-error`} className="field-error">{state.fields[name]}</small>}</div>;
}
function StatusField({value,...props}:{value?:string}&Omit<React.ComponentProps<'select'>,'value'>) { return <select {...props} name="status" defaultValue={value || 'PLANNED'}>{Object.entries(STATUSES).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>; }
export function ProjectForm({project,employees}:{project?:Project;employees:Employee[]}) {
 const [state,action,pending] = useActionState(saveProjectRecord.bind(null,'project',project?.id || null),{});
 return <form action={action} className="surface project-form"><input type="hidden" name="version" value={project?.version || 0}/><Feedback state={state}/><div className="field-grid">
 {(['customer_name','name','start_date','current_end_date','work_location'] as const).map(key=><Field key={key} name={key} label={{customer_name:'고객사',name:'프로젝트명',start_date:'시작일',current_end_date:'현재 종료일',work_location:'근무지'}[key]} state={state}><input name={key} type={key.endsWith('date')?'date':'text'} required maxLength={200} defaultValue={project?.[key]}/></Field>)}
 <Field name="pm_employee_id" label="PM" state={state}><select name="pm_employee_id" required defaultValue={project?.pm_employee_id || ''}><option value="">직원 선택</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}{e.employment_status==='INACTIVE'?' (퇴사)':''}</option>)}</select></Field>
 <Field name="status" label="상태" state={state}><StatusField value={project?.status}/></Field>
 {project && <Field name="reason" label="종료일 변경 사유 (선택)" state={state}><input name="reason" maxLength={1000}/></Field>}
 </div><p className="project-note">유상 외부 고객 계약 프로젝트만 등록합니다. 종료일 변경 시 이전 날짜와 변경 이력이 보존됩니다.</p><div className="button-row"><Link className="button" href={project?`/admin/projects/${project.id}`:'/admin/projects'}>취소</Link><button className="button primary" disabled={pending}>프로젝트 저장</button></div></form>;
}
export function AssignmentForm({project,assignment,employees}:{project:Project;assignment?:Assignment;employees:Employee[]}) {
 const [state,action,pending]=useActionState(saveProjectRecord.bind(null,'assignment',assignment?.id || null),{});
 return <form action={action} className="surface project-form"><h2>{assignment?'투입 수정':'투입 추가'}</h2><Feedback state={state}/><input type="hidden" name="version" value={assignment?.version || 0}/><input type="hidden" name="project_id" value={project.id}/>
 <div className="field-grid"><Field name="employee_id" label="직원" state={state}>{assignment?<><input readOnly value={employees.find(e=>e.id===assignment.employee_id)?.name || ''}/><input type="hidden" name="employee_id" value={assignment.employee_id}/></>:<select name="employee_id" required defaultValue=""><option value="">직원 선택</option>{employees.filter(e=>e.employment_status==='ACTIVE').map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select>}</Field>
 <Field name="role" label="투입 역할" state={state}><input required name="role" maxLength={100} defaultValue={assignment?.role}/></Field>
 {(['start_date','end_date'] as const).map(key=><Field key={key} name={key} label={key==='start_date'?'투입 시작일':'투입 종료일'} state={state}><input type="date" required min={project.start_date} max={project.current_end_date} name={key} defaultValue={assignment?.[key] || (key==='start_date'?project.start_date:project.current_end_date)}/></Field>)}
 <Field name="status" label="투입 상태" state={state}><StatusField value={assignment?.status}/></Field></div>
 <p className="project-note">프로젝트 기간 내에서 투입 기간을 입력하세요. 다른 프로젝트와 기간이 겹쳐도 등록할 수 있습니다.</p><div className="button-row"><Link className="button" href={`/admin/projects/${project.id}`}>취소</Link><button className="button primary" disabled={pending}>투입 저장</button></div></form>;
}
export function ExtensionForm({project}:{project:Project}) {
 const [state,action,pending]=useActionState(saveProjectRecord.bind(null,'project',project.id),{});
 return <form action={action} className="extension-form"><Feedback state={state}/>{Object.entries(project).filter(([key])=>!['id','current_end_date'].includes(key)).map(([key,value])=><input type="hidden" name={key} value={value} key={key}/>)}
 <Field name="previous" label="현재 종료일" state={state}><input readOnly value={project.current_end_date}/></Field>
 <Field name="current_end_date" label="새 종료일" state={state}><input name="current_end_date" type="date" required min={project.start_date} defaultValue={project.current_end_date}/></Field>
 <Field name="reason" label="사유 (선택)" state={state}><input name="reason" maxLength={1000}/></Field><button className="button primary" disabled={pending}>종료일 변경</button></form>;
}
export function DeleteRecord({kind,id,projectId,version}:{kind:'project'|'assignment';id:string;projectId:string;version:number}) {
 const [state,action,pending]=useActionState(deleteProjectRecord.bind(null,kind,id,projectId),{});
 return <details className="delete-record"><summary>삭제</summary><form action={action}><input type="hidden" name="version" value={version}/><p>삭제하시겠습니까? 연결된 이력이 있으면 삭제할 수 없습니다.</p><Feedback state={state}/><button className="button danger" disabled={pending}>삭제 확인</button></form></details>;
}
export function CareerForm({career,assignments,projects,name}:{career?:Career;assignments:Assignment[];projects:Project[];name:string}) {
 const [state,action,pending]=useActionState(saveProjectRecord.bind(null,'career',career?.id || null),{});
 const [assignmentId,setAssignmentId]=useState(career?.assignment_id || assignments[0]?.id || '');
 const [job,setJob]=useState(career?.job_function || ''), [role,setRole]=useState(career?.role || ''), [responsibilities,setResponsibilities]=useState(career?.responsibilities || '');
 const [skills,setSkills]=useState(career?.skills || []), [skill,setSkill]=useState('');
 const assignment=assignments.find(a=>a.id===assignmentId), project=projects.find(p=>p.id===assignment?.project_id);
 const period=assignment?`${assignment.start_date} – ${assignment.end_date}`:'';
 const addSkill=()=>{const next=skill.trim();if(next && next.length<=100 && skills.length<30) {setSkills([...new Set([...skills,next])]);setSkill('');}};
 return <form id="career-editor" action={action} className="career-layout"><div className="surface career-form"><h2>프로젝트 연결</h2><input type="hidden" name="version" value={career?.version || 0}/><Feedback state={state}/>
 <Field name="assignment_id" label="프로젝트 선택" state={state}><select required name="assignment_id" value={assignmentId} onChange={e=>setAssignmentId(e.target.value)}>{assignments.map(a=><option key={a.id} value={a.id}>{projects.find(p=>p.id===a.project_id)?.name} · {a.role} ({a.start_date} – {a.end_date})</option>)}</select></Field>
 <Field name="customer" label="고객사" state={state}><input readOnly value={project?.customer_name || ''}/></Field><Field name="period" label="기간" state={state}><input readOnly value={period}/></Field>
 <Field name="job_function" label="직무" state={state}><input required maxLength={100} name="job_function" value={job} onChange={e=>setJob(e.target.value)}/></Field>
 <Field name="role" label="역할" state={state}><input required maxLength={100} name="role" value={role} onChange={e=>setRole(e.target.value)}/></Field>
 <Field name="responsibilities" label="주요 업무" state={state}><textarea required maxLength={10000} name="responsibilities" value={responsibilities} onChange={e=>setResponsibilities(e.target.value)}/></Field>
 <div className="field"><span>기술 / 경험</span><div className="skill-tags">{skills.map(s=><button type="button" className="status-badge" aria-label={`${s} 삭제`} key={s} onClick={()=>setSkills(skills.filter(x=>x!==s))}>{s} ×</button>)}</div><div className="button-row"><input aria-label="기술 입력" value={skill} maxLength={100} onChange={e=>setSkill(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addSkill();}}}/><button className="button" type="button" onClick={addSkill}>+ 기술 추가</button></div><small>기술명을 입력한 후 추가하세요. 쉼표로 구분한 기술도 저장 시 분리됩니다.</small><input type="hidden" name="skills" value={skills.join(',')}/>{state.fields?.skills && <small className="field-error">{state.fields.skills}</small>}</div>
 <p className="project-note">커리어는 직원 본인이 작성하며 관리자 승인 없이 저장됩니다.</p><div className="button-row"><Link className="button" href="/career">목록</Link><button className="button primary" disabled={pending || !assignment}>커리어 저장</button></div></div>
 <aside className="surface career-preview" aria-label="프로필 미리보기"><h2>프로필 미리보기</h2><h3>{name}</h3><p>{job || '직무'} · {role || '역할'}</p><hr/><h4>{project?.name || '프로젝트 선택'}</h4><p>{project?.customer_name} | {period}</p><h5>주요 업무</h5><p className="responsibilities">{responsibilities || '프로젝트에서 수행한 업무를 기록해 주세요.'}</p><h5>기술 / 경험</h5><div className="skill-tags">{skills.map(s=><span className="status-badge" key={s}>{s}</span>)}</div></aside></form>;
}
