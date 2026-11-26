import Link from 'next/link';
import {employeeAssets} from '@/lib/assets/data';
import {ASSET_TYPES,ASSET_STATUSES} from '@/lib/assets/types';
import {SectionCard,DataTable,EmptyState,StatusTag} from '@/components/ui/primitives';
export async function EmployeeAssets({employeeId}:{employeeId:string}){
 const {assets,own}=await employeeAssets(employeeId);
 return <SectionCard><div className="heading-row"><h2>현재 사용 장비</h2>{own&&<Link className="button" href="/assets/me">내 장비 · 인계 및 전체 이력</Link>}</div>
 {assets.length?<DataTable head={['구분','모델','시리얼 번호','운영 상태','지급일','상세']} label="직원 현재 장비">{assets.map(a=><tr key={a.id}><td>{ASSET_TYPES[a.type]}</td><td>{a.model}</td><td>{a.serial_number}</td><td><StatusTag status={a.status}>{ASSET_STATUSES[a.status]}</StatusTag></td><td>{a.assigned_at?.slice(0,10)||'—'}</td><td><Link href={own?`/assets/me/${a.id}`:`/admin/assets/${a.id}`}>장비 상세</Link></td></tr>)}</DataTable>:<EmptyState>현재 지급된 장비가 없습니다.</EmptyState>}
 {assets.length===100&&<p className="muted">표시 한도 100건입니다. 장비 화면에서 전체 내역을 확인하세요.</p>}
 </SectionCard>;
}
