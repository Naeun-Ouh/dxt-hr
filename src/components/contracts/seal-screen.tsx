import { PageHeader, SectionCard } from '@/components/ui/primitives';
import Link from 'next/link';
import {companySeals} from '@/lib/contracts/seals';
import {seoulTime} from '@/lib/contracts/types';
import {SealForm} from './seal-form';
export async function SealScreen(){
 const seals=await companySeals(),active=seals.find(s=>s.active);
 return <div className="contracts-workspace"><PageHeader title={<>회사 직인 관리</>} description={<>회사 서명에 사용할 직인을 안전하게 관리합니다.</>}><Link className="text-link" href="/admin/contracts">← 근로계약 관리</Link></PageHeader>
 <div className="seal-layout"><SectionCard className="contract-panel"><div className="contract-section-heading"><h2>현재 사용 중인 직인</h2><span className={`contract-badge ${active?'contract-COMPLETED':''}`}>{active?'사용 중':'미등록'}</span></div>
 <div className="seal-preview">{active?<><img src={`/api/contracts/seals/${active.id}`} width={160} height={160} alt="현재 활성 회사 직인"/></>:<span>등록된 직인이 없습니다</span>}</div>
 {active?<dl className="contract-facts"><div><dt>회사명</dt><dd>{active.company_name}</dd></div><div><dt>대표자명</dt><dd>{active.representative_name}</dd></div><div><dt>업로드</dt><dd>{seoulTime(active.uploaded_at)}</dd></div></dl>:<p className="contract-muted">직인 없이도 직원 서명과 회사 서명, PDF 보관을 이용할 수 있습니다.</p>}
 <div className="contract-assurance"><strong>원본은 관리자와 대표에게만 공개</strong><p>직원은 본인의 완료 PDF에서만 직인을 확인합니다. 직인을 교체해도 기존 계약 문서는 바뀌지 않습니다.</p></div></SectionCard><SealForm key={active?.id||'none'} active={active}/></div>
 <SectionCard className="contract-panel"><h2>직인 등록 이력</h2><div className="table-scroll"><table className="employee-table"><thead><tr><th>회사 / 대표자</th><th>등록 시각 (서울)</th><th>상태</th><th>업로더</th></tr></thead><tbody>{seals.map(s=><tr key={s.id}><td>{s.company_name}<small className="contract-email">{s.representative_name}</small></td><td>{seoulTime(s.uploaded_at)}</td><td>{s.active?'사용 중':'이전 직인 · 보존'}</td><td className="contract-actor">{s.uploaded_by}</td></tr>)}</tbody></table></div>{!seals.length&&<p className="table-empty">직인 등록 이력이 없습니다.</p>}</SectionCard></div>;
}
