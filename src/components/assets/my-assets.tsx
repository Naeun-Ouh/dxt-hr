import { randomUUID } from 'node:crypto';
import { myAssetRecords,transferRecipients } from '@/lib/assets/data';
import { ASSET_TYPES,ASSET_STATUSES,assignmentResult,type AssetTransfer } from '@/lib/assets/types';
import type { SearchParams } from '@/lib/employees/data';
import { TransferForm,ResolveTransfer } from './forms';
const date=(value:string)=>new Date(value).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'});
const isoDate=(value:string)=>new Date(value).toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'});
function TransferCard({transfer:t,incoming=false}:{transfer:AssetTransfer;incoming?:boolean}){
 return <article className="asset-card"><div className="heading-row"><span className="asset-type">{ASSET_TYPES[t.asset_type]}</span><span className="asset-badge REPAIR">{incoming?'인수 확인 필요':'인계 완료 / 상대 확인 대기'}</span></div>
 <h3>{t.asset_model||ASSET_TYPES[t.asset_type]}</h3><dl><div><dt>Serial Number</dt><dd>{t.serial_number}</dd></div><div><dt>{incoming?'지급자':'수신자'}</dt><dd>{incoming?t.sender_name:t.recipient_name}</dd></div><div><dt>인계일</dt><dd>{date(t.handoff_date)}</dd></div><div><dt>등록일</dt><dd>{date(t.requested_at)}</dd></div></dl>
 {t.memo&&<p className="transfer-memo">{t.memo}</p>}{incoming&&<ResolveTransfer id={t.id} mode="confirm"/>}</article>;
}
export async function MyAssets({id,query}:{id?:string;query:SearchParams}){
 const [records,people]=await Promise.all([myAssetRecords(id),transferRecipients()]);
 const {me,assets,assignments,transfers}=records;
 const outgoing=transfers.filter(t=>t.sender_id===me&&t.state==='PENDING');
 const incoming=transfers.filter(t=>t.recipient_id===me&&t.state==='PENDING');
 const current=assets.filter(a=>!outgoing.some(t=>t.asset_id===a.id));
 const past=assignments.filter(a=>a.state==='RETURNED');
 const today=isoDate(new Date().toISOString());
 return <><div className="page-heading"><h1>내 장비</h1><p>현재 보유 장비와 인계·인수 상태, 나의 지급 이력을 확인합니다.</p></div>
 {query.saved&&<p role="status" className="success-banner">처리했습니다.</p>}
 <section aria-labelledby="current-assets" className="asset-section"><h2 id="current-assets">현재 장비 <span>{current.length}</span></h2>
 {current.length?current.map(a=>{const assignment=assignments.find(h=>h.asset_id===a.id&&h.state==='ACTIVE');return <article className="asset-card" key={a.id}><div className="heading-row"><span className="asset-type">{ASSET_TYPES[a.type]}</span><span className={`asset-badge ${a.status}`}>{ASSET_STATUSES[a.status]}</span></div><h3>{a.model||ASSET_TYPES[a.type]}</h3><dl><div><dt>Serial Number</dt><dd>{a.serial_number}</dd></div><div><dt>지급일</dt><dd>{a.assigned_at?date(a.assigned_at):'—'}</dd></div></dl>{assignment&&<TransferForm assetId={a.id} assignmentId={assignment.id} requestId={randomUUID()} employees={people.filter(e=>e.id!==me)} minDate={isoDate(assignment.assigned_at)} today={today}/>}</article>;}):<div className="surface empty-state"><h3>지급된 장비가 없습니다</h3><p>인계 중인 장비는 아래 영역에서 확인할 수 있습니다.</p></div>}</section>
 <section aria-labelledby="outgoing-assets" className="asset-section"><h2 id="outgoing-assets">인계 확인 대기 중 <span>{outgoing.length}</span></h2>{outgoing.length?outgoing.map(t=><TransferCard key={t.id} transfer={t}/>):<p className="surface muted">상대방의 확인을 기다리는 장비가 없습니다.</p>}</section>
 <section aria-labelledby="incoming-assets" className="asset-section"><h2 id="incoming-assets">받을 장비 <span>{incoming.length}</span></h2>{incoming.length?incoming.map(t=><TransferCard key={t.id} transfer={t} incoming/>):<p className="surface muted">인수 확인할 장비가 없습니다.</p>}</section>
 <section aria-labelledby="past-assets" className="asset-section"><h2 id="past-assets">과거 장비 <span>{past.length}</span></h2>{past.length?<div className="asset-table-wrap"><table className="asset-table"><thead><tr>{['유형 / 모델','S/N','지급 시작','지급 종료','결과'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{past.map(h=><tr key={h.id}><td>{ASSET_TYPES[h.asset_type]}<br/><strong>{h.asset_model||'—'}</strong></td><td>{h.serial_number}</td><td>{date(h.assigned_at)}</td><td>{date(h.returned_at!)}</td><td>{assignmentResult(h.end_reason)}</td></tr>)}</tbody></table></div>:<p className="surface muted">이전 지급 이력이 없습니다.</p>}</section>
 <aside className="asset-notice"><strong>장비 정보가 실제와 다르면 IT 관리자에게 알려주세요.</strong><p>본인의 지급 이력과 직접 인계·인수한 기록만 볼 수 있습니다. 인계 취소·보정은 IT 관리자에게 요청해 주세요.</p></aside></>;
}
