"use client";
import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { saveEmployee, saveOrganization, savePrivate, revealPrivate, revealBirth } from "@/app/actions/employees";
import { PRIVATE_FIELDS, PRIVATE_LABELS, type Employee, type Organization, type FormState, type PrivateValues } from "@/lib/employees/types";
function Feedback({ state }: { state: FormState }) {
  return state.error ? <div role="alert" className="form-error">{state.error}</div> : null;
}
function Field({ label, name, value, type = "text", required = false, state, maxLength = 100, hint }: {
  label: string; name: string; value?: string | null; type?: string; required?: boolean; state: FormState; maxLength?: number; hint?: string;
}) {
  return <label className="field"><span>{label}{required && <span className="required"> *</span>}</span>
    <input aria-label={label} name={name} defaultValue={value || ""} type={type} required={required} maxLength={maxLength} autoComplete={type === "password" ? "new-password" : "off"} aria-invalid={Boolean(state.fields?.[name])} aria-describedby={[hint ? `${name}-hint` : "", state.fields?.[name] ? `${name}-error` : ""].filter(Boolean).join(" ") || undefined} />
    {hint && <small id={`${name}-hint`}>{hint}</small>}{state.fields?.[name] && <small className="field-error" id={`${name}-error`}>{state.fields[name]}</small>}
  </label>;
}
function PrivateInputs({ state, editable = false }: { state: FormState; editable?: boolean }) {
  return <div className="field-grid">{PRIVATE_FIELDS.map(name => <div className={name === "emergency_contact" || name === "address" ? "span-two" : ""} key={name}>
    <Field label={PRIVATE_LABELS[name]} name={name} type="password" state={state} maxLength={500} hint={editable ? "비워두면 기존 정보를 유지합니다." : undefined} />
    {editable && <label className="check-label"><input type="checkbox" name={`clear_${name}`} />기존 {PRIVATE_LABELS[name]} 삭제</label>}
  </div>)}</div>;
}
export function EmployeeForm({ employee, departments, privateAccess, hasBirth }: { employee?: Employee; departments: Organization[]; privateAccess: boolean; hasBirth?: boolean }) {
  const [state, action, pending] = useActionState(saveEmployee.bind(null, employee?.id || null), {} as FormState);
  return <form action={action} className="employee-form">
    <input type="hidden" name="version" value={employee?.version || 0} />
    <Feedback state={state} />
    <div className="form-columns"><div className="form-main">
      <section className="surface form-section"><div className="section-intro"><h2>01. 기본 인적 사항</h2><p>등록 대상 직원의 인적 사항 및 연락처 정보를 입력합니다.</p></div>
        <div className="field-grid">
          <Field label="이름" name="name" value={employee?.name} required state={state} />
          <Field label="영문명 (선택사항)" name="english_name" value={employee?.english_name} state={state} />
          <Field label="회사 이메일" name="company_email" value={employee?.company_email} type="email" required maxLength={254} state={state} />
          <Field label="휴대폰 번호" name="phone" value={employee?.phone} type="tel" maxLength={30} state={state} />
          <div><Field label="생년월일" name="birth_date" type="date" state={state} hint={hasBirth ? "등록된 정보가 있습니다. 비워두면 유지합니다." : "관리자와 대표만 열람할 수 있습니다."} />
            {hasBirth && employee && <BirthReveal id={employee.id} />}{hasBirth && <label className="check-label"><input type="checkbox" name="clear_birth" />기존 생년월일 삭제</label>}
          </div>
        </div>
      </section>
      <section className="surface form-section"><div className="section-intro"><h2>02. 부서 및 근무 정보</h2><p>사내 조직 배치, 직책 및 근무 정보를 입력합니다.</p></div>
        <div className="field-grid">
          <label className="field"><span>부서</span><select aria-label="부서" name="department_id" defaultValue={employee?.department_id || ""}><option value="">미배정</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>{state.fields?.department_id && <small className="field-error">{state.fields.department_id}</small>}</label>
          <Field label="직책" name="title" value={employee?.title} required state={state} />
          <Field label="입사일" name="hire_date" value={employee?.hire_date} required type="date" state={state} />
          <label className="field"><span>근무 상태</span><select aria-label="근무 상태" name="employment_status" defaultValue={employee?.employment_status || "ACTIVE"}><option value="ACTIVE">재직</option><option value="INACTIVE">퇴사</option></select></label>
          <Field label="근무지" name="work_location" value={employee?.work_location} state={state} maxLength={200} />
        </div>
      </section>
      {!employee && privateAccess && <section className="surface form-section sensitive-section"><div className="section-intro"><h2><img src="/figma/LockKeyholeP2.svg" alt="" />03. 민감 정보 관리</h2><p>대표와 지정 관리자만 열람할 수 있습니다. 나중에 입력할 수도 있습니다.</p></div><PrivateInputs state={state} /></section>}
      {employee && privateAccess && <Link className="button" href={`/admin/employees/${employee.id}/private`}>HR Private 정보 관리</Link>}
    </div><aside className="form-side">
      <section className="surface"><h2>프로필</h2><div className="profile-placeholder"><span className="person-avatar large">{employee?.name.slice(0, 1) || "DXT"}</span><p>{employee?.name || "새 직원"}</p></div></section>
      <section className="surface helper-card"><h2>등록 시 유의 사항</h2><p>회사 이메일을 정확히 입력해 주세요.</p><p>직원 프로필과 로그인 계정은 별도로 관리합니다. 프로필을 등록해도 로그인 권한은 부여되지 않습니다.</p><p>퇴사 상태로 변경하면 연결된 계정의 서비스 접근이 제한됩니다.</p></section>
    </aside></div>
    <footer className="surface form-footer"><p>필수 입력 사항을 확인한 후 저장해 주세요.</p><div className="button-row"><Link className="button" href={employee ? `/admin/employees/${employee.id}` : "/admin/employees"}>취소</Link><button className="button primary" disabled={pending}>{pending ? "저장 중…" : "프로필 저장"}</button></div></footer>
  </form>;
}
export function PrivatePanel({ id, version, hasBirth }: { id: string; version: number; hasBirth: boolean }) {
  const [revealed, setRevealed] = useState<{ values: PrivateValues; birth: string } | null>(null);
  const [revealError, setRevealError] = useState("");
  const [editing, setEditing] = useState(false);
  const [reading, startReading] = useTransition();
  const [state, action, pending] = useActionState(savePrivate.bind(null, id), {} as FormState);
  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setRevealed(null), 60000);
    const hide = () => { if (document.hidden) setRevealed(null); };
    document.addEventListener("visibilitychange", hide);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", hide); };
  }, [revealed]);
  const reveal = () => startReading(async () => {
    setRevealError("");
    const result = await revealPrivate(id);
    if (result.error) setRevealError(result.error);
    else if (result.values) setRevealed({ values: result.values, birth: result.birth || "" });
  });
  return <>
    <div className="notice privacy-notice"><strong>민감정보</strong><p>이 화면은 대표와 지정 관리자만 접근할 수 있습니다.</p></div>
    <div className="private-columns"><section className="surface private-fields"><div className="panel-heading"><h2>개인 / 급여 정보</h2><button className="button primary" onClick={() => { setEditing(!editing); setRevealed(null); }}>{editing ? "수정 닫기" : "수정"}</button></div>
      {editing ? <form action={action} autoComplete="off"><input type="hidden" name="version" value={version} /><Feedback state={state} /><PrivateInputs state={state} editable /><button className="button primary" disabled={pending}>{pending ? "저장 중…" : "민감정보 저장"}</button></form> : <>
        <dl className="private-list">
          {PRIVATE_FIELDS.slice(0, 1).map(field => <div key={field}><dt>{PRIVATE_LABELS[field]}</dt><dd>{revealed ? revealed.values[field] || "미등록" : version ? "••••••-•••••••" : "미등록"}</dd></div>)}
          <div><dt>생년월일</dt><dd>{revealed ? revealed.birth || "미등록" : hasBirth ? "••••.••.••" : "미등록"}</dd></div>
          {PRIVATE_FIELDS.slice(1).map(field => <div key={field}><dt>{PRIVATE_LABELS[field]}</dt><dd>{revealed ? revealed.values[field] || "미등록" : version ? "••••••••" : "미등록"}</dd></div>)}
        </dl>
        {revealError && <p role="alert" className="form-error">{revealError}</p>}
        <button className="button" onClick={revealed ? () => setRevealed(null) : reveal} disabled={reading}>{reading ? "확인 중…" : revealed ? "다시 숨기기" : "민감정보 열람"}</button>
        <p className="helper-text">열람은 기록되며, 1분 후 또는 다른 탭으로 이동하면 다시 숨겨집니다.</p>
      </>}
    </section><aside className="form-side"><section className="surface helper-card"><h2>접근 권한</h2><dl className="access-policy"><dt>대표</dt><dd>전체 조회</dd><dt>지정 관리자</dt><dd>전체 조회</dd></dl></section><section className="privacy-note"><h2>보안 저장</h2><p>민감정보는 일반 프로필과 분리하여 암호화해 저장하며, 화면에서는 기본적으로 숨겨집니다.</p></section></aside></div>
  </>;
}
export function OrganizationForm({ organization, organizations }: { organization?: Organization; organizations: Organization[] }) {
  const [state, action, pending] = useActionState(saveOrganization.bind(null, organization?.id || null), {} as FormState);
  return <form action={action} className="surface form-section"><h2>{organization ? "조직 수정" : "조직 등록"}</h2><Feedback state={state} /><input type="hidden" name="version" value={organization?.version || 0} />
    <div className="field-grid"><Field name="name" label="조직명" value={organization?.name} required state={state} /><Field name="type" label="유형 (선택사항)" value={organization?.type} maxLength={50} state={state} />
      <label className="field"><span>상위 조직</span><select aria-label="상위 조직" name="parent_id" defaultValue={organization?.parent_id || ""}><option value="">최상위 조직</option>{organizations.filter(o => o.id !== organization?.id).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label></div>
    <div className="button-row"><button className="button primary" disabled={pending}>{pending ? "저장 중…" : "조직 저장"}</button>{organization && <Link className="button" href="/organization">취소</Link>}</div>
  </form>;
}

function BirthReveal({ id }: { id: string }) {
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => {
    if (!value) return;
    const timer = setTimeout(() => setValue(""), 60000);
    const hide = () => { if (document.hidden) setValue(""); };
    document.addEventListener("visibilitychange", hide);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", hide); };
  }, [value]);
  return <div className="birth-reveal"><button className="button" type="button" disabled={pending} onClick={() => value ? setValue("") : start(async () => { const result = await revealBirth(id); setValue(result.value || result.error || ""); })}>{value ? "생년월일 숨기기" : "등록된 생년월일 열람"}</button>{value && <p role="status">{value}</p>}</div>;
}
