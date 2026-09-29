import Link from "next/link";
import { notFound } from "next/navigation";
import { can, type Principal } from "@/lib/permissions";
import { employeeDirectory, organizations, getEmployee, birthRecord, privateRecord, type SearchParams } from "@/lib/employees/data";
import type { Employee, Organization } from "@/lib/employees/types";
import { EmployeeForm, OrganizationForm, PrivatePanel } from "./forms";
export function Status({ status }: { status: Employee["employment_status"] }) {
  return <span className={`status-chip ${status === "ACTIVE" ? "is-active" : "is-inactive"}`}>{status === "ACTIVE" ? "재직" : "퇴사"}</span>;
}
function Person({ person }: { person: Employee }) {
  return <span className="person-cell"><span className="person-avatar">{person.name.slice(0, 1)}</span><span><strong>{person.name}</strong><small>{person.company_email}</small></span></span>;
}
export async function EmployeeList({ admin, query }: { admin: boolean; query: SearchParams }) {
  const [{ employees, filters, count, pageSize }, departments] = await Promise.all([employeeDirectory(query), organizations()]);
  const base = admin ? "/admin/employees" : "/people";
  const pageLink = (page: number) => `${base}?${new URLSearchParams({ q: filters.q, department: filters.department, status: filters.status, page: String(page) })}`;
  return <>
    <div className="page-heading heading-row"><div><h1>{admin ? "직원 관리" : "직원"}</h1><p>{admin ? "사내 전체 임직원의 프로필, 직책 및 근무 상태를 관리합니다." : "함께 일하는 동료와 조직 정보를 확인하세요."}</p></div>{admin && <Link className="button primary" href="/admin/employees/new">+ 직원 등록</Link>}</div>
    <form className="filter-bar" action={base}>
      <label><span className="sr-only">부서 필터</span><select aria-label="부서 필터" name="department" defaultValue={filters.department}><option value="">전체 부서</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <label><span className="sr-only">근무 상태 필터</span><select aria-label="근무 상태 필터" name="status" defaultValue={filters.status}><option value="ACTIVE">재직 상태: 재직</option><option value="INACTIVE">재직 상태: 퇴사</option><option value="ALL">재직 상태: 전체</option></select></label>
      <label className="directory-search"><img src="/figma/SearchP2.svg" alt="" /><span className="sr-only">이름 또는 이메일</span><input name="q" defaultValue={filters.q} placeholder="이름 또는 이메일로 검색…" maxLength={100} /></label><button className="button">검색</button>
    </form>
    <section className="employee-table-container"><div className="table-scroll"><table className="employee-table"><caption className="sr-only">직원 목록</caption><thead><tr><th>이름 / 이메일</th><th>부서</th><th>직책</th><th>근무 상태</th><th>입사일</th><th>근무지</th>{admin && <th>관리</th>}</tr></thead>
      <tbody>{employees.map(person => <tr key={person.id}><td><Link href={`${base}/${person.id}`}><Person person={person} /></Link></td><td>{departments.find(d => d.id === person.department_id)?.name || "미배정"}</td><td>{person.title}</td><td><Status status={person.employment_status} /></td><td>{person.hire_date.replaceAll("-", ".")}</td><td>{person.work_location || "—"}</td>{admin && <td><Link className="table-edit" href={`${base}/${person.id}/edit`} aria-label={`${person.name} 수정`}>수정</Link></td>}</tr>)}</tbody>
    </table></div>{!employees.length && <div className="table-empty"><h2>{count ? "이 페이지에 직원이 없습니다" : "조건에 맞는 직원이 없습니다"}</h2><p>검색 조건을 변경하거나 직원을 등록해 주세요.</p><Link href={base} className="text-link">검색 초기화</Link></div>}
      <footer className="table-footer"><p>검색 결과: {employees.length ? `${(filters.page - 1) * pageSize + 1}–${(filters.page - 1) * pageSize + employees.length}` : "0"} / 전체 {count}명 직원</p><nav className="pagination" aria-label="직원 목록 페이지">
        {filters.page > 1 && <Link href={pageLink(filters.page - 1)} aria-label="이전 페이지"><img src="/figma/ChevronLeftP2.svg" alt="" /></Link>}
        <span aria-current="page">{filters.page}</span>
        {filters.page * pageSize < count && <Link href={pageLink(filters.page + 1)} aria-label="다음 페이지"><img src="/figma/ChevronRight1P2.svg" alt="" /></Link>}
      </nav></footer>
    </section>
  </>;
}
export async function EmployeeEditor({ id, principal }: { id?: string; principal: Principal }) {
  const [departments, employee, birth] = await Promise.all([organizations(), id ? getEmployee(id) : undefined, id ? birthRecord(id) : undefined]);
  return <><div className="page-heading"><h1>{employee ? "직원 프로필 수정" : "신규 직원 프로필 생성"}</h1><p>사내 정보 및 운영 관리를 위한 임직원 프로필을 {employee ? "수정" : "등록"}합니다.</p></div><EmployeeForm key={id || "new"} employee={employee} departments={departments} privateAccess={can(principal, "PRIVATE_HR_ACCESS")} hasBirth={Boolean(birth)} /></>;
}
export async function EmployeeDetail({ id, admin, principal, query }: { id: string; admin: boolean; principal: Principal; query: SearchParams }) {
  const [employee, departments] = await Promise.all([getEmployee(id), organizations()]);
  const tab = ["projects", "career", "assets"].includes(String(query.tab)) ? String(query.tab) : "profile";
  const base = `${admin ? "/admin/employees" : "/people"}/${id}`;
  return <>
    {query.saved === "1" && <p role="status" className="success-notice">프로필이 저장되었습니다.</p>}
    <section className="surface profile-summary"><span className="person-avatar large">{employee.name.slice(0, 1)}</span><div className="profile-meta"><div className="button-row"><h1>{employee.name}</h1><Status status={employee.employment_status} /></div><p>{employee.company_email}<span>｜</span>{departments.find(d => d.id === employee.department_id)?.name || "미배정"}<span>｜</span>{employee.title}</p></div>{admin && <Link className="button" href={`${base}/edit`}>프로필 수정</Link>}</section>
    <nav className="employee-tabs" aria-label="직원 상세 탭">{[["profile", "프로필"], ["projects", "프로젝트"], ["career", "커리어"], ["assets", "장비"]].map(([key, label]) => <Link key={key} href={`${base}?tab=${key}`} aria-current={tab === key ? "page" : undefined}>{label}</Link>)}{can(principal, "PRIVATE_HR_ACCESS") && <Link href={`/admin/employees/${id}/private`}>HR Private</Link>}</nav>
    {tab === "profile" ? <section className="surface"><h2>기본 / 근무 정보</h2><dl className="profile-facts">{[["이름", employee.name], ["영문명", employee.english_name], ["회사 이메일", employee.company_email], ["휴대폰 번호", employee.phone], ["부서", departments.find(d => d.id === employee.department_id)?.name], ["직책", employee.title], ["입사일", employee.hire_date], ["근무지", employee.work_location]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "—"}</dd></div>)}</dl></section> : <section className="surface empty-state"><h2>{tab === "projects" ? "프로젝트 정보를 준비하고 있습니다" : tab === "career" ? "커리어 정보를 준비하고 있습니다" : "장비 정보를 준비하고 있습니다"}</h2><p>서비스 준비가 완료되면 이곳에서 확인할 수 있습니다.</p></section>}
  </>;
}
export async function HrPrivateScreen({ id, query }: { id: string; query: SearchParams }) {
  const [employee, record, birth] = await Promise.all([getEmployee(id), privateRecord(id), birthRecord(id)]);
  return <><div className="page-heading"><h1>{employee.name} · HR Private</h1><p>민감 인사정보는 대표와 지정 관리자만 열람할 수 있습니다.</p></div><Link className="text-link" href={`/admin/employees/${id}`}>직원 프로필로 돌아가기</Link>{query.saved === "1" && <p role="status" className="success-notice">민감정보가 저장되었습니다.</p>}<PrivatePanel key={`${id}-${record?.version || 0}`} id={id} version={record?.version || 0} hasBirth={Boolean(birth)} /></>;
}
function OrganizationTree({ rows, parent, admin, trail = [] }: { rows: Organization[]; parent: string | null; admin: boolean; trail?: string[] }) {
  return <ul className="organization-tree">{rows.filter(o => o.parent_id === parent && !trail.includes(o.id)).map(o => <li key={o.id}><div><strong>{o.name}</strong><span>{o.type || ""}</span><Link className="text-link" href={`/people?department=${o.id}`}>직원 보기</Link>{admin && <Link className="text-link" href={`/organization?edit=${o.id}`}>수정</Link>}</div><OrganizationTree rows={rows} parent={o.id} admin={admin} trail={[...trail, o.id]} /></li>)}</ul>;
}
export async function OrganizationScreen({ principal, query }: { principal: Principal; query: SearchParams }) {
  const rows = await organizations(), admin = can(principal, "EMPLOYEE_MANAGE");
  const editing = typeof query.edit === "string" ? rows.find(o => o.id === query.edit) : undefined;
  if (query.edit && (!admin || !editing)) notFound();
  return <><div className="page-heading"><h1>조직도</h1><p>디엑스티의 조직과 소속 직원을 확인하세요.</p></div>{query.saved === "1" && <p role="status" className="success-notice">조직이 저장되었습니다.</p>}<section className="surface"><h2>조직 구성</h2>{rows.length ? <OrganizationTree rows={rows} parent={null} admin={admin} /> : <p className="table-empty">등록된 조직이 없습니다.</p>}</section>{admin && <OrganizationForm key={editing?.id || "new"} organization={editing} organizations={rows} />}</>;
}
