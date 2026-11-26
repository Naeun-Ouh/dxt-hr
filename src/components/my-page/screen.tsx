import Link from 'next/link';
import {Suspense} from 'react';
import {myPageData} from '@/lib/my-page/data';
import {PageHeader,SectionCard,SummaryStrip,SummaryCard,Alert,EmptyState,StatusTag} from '@/components/ui/primitives';
const shortcuts=[['/expenses','내 경비','월별 경비 입력과 첨부파일'],['/assets/me','내 장비','현재 장비 · 인계 확인'],['/career','내 커리어','프로젝트 경험 기록'],['/contracts/me','내 계약','계약 확인과 직원 서명'],['/certificates/me','내 증명서','재직증명서 요청과 다운로드'],['/leave','내 휴가','사용 가능한 휴가와 신청 내역']] as const;
function Count({result,label,href}:{result:PromiseSettledResult<number>;label:string;href:string}){return <Link href={href}><SummaryCard label={label} value={result.status==='fulfilled'?`${result.value}건`:'확인 필요'}/></Link>;}
async function Content(){
 let data:Awaited<ReturnType<typeof myPageData>>;
 try{data=await myPageData();}catch{return <Alert tone="error" title="내 정보를 불러오지 못했습니다."><p>잠시 후 다시 시도해 주세요. 계속되면 관리자에게 직원 연결 상태를 확인해 주세요.</p><Link className="button" href="/me">다시 불러오기</Link></Alert>;}
 if(!data)return <EmptyState><h2>연결된 직원 정보가 없습니다</h2><p>관리자에게 로그인 계정과 직원 정보의 연결을 요청해 주세요.</p></EmptyState>;
 const {profile,department,leave,projects,signatures,pendingCertificates,issuedCertificates}=data;
 const unavailable=[leave,projects,signatures,pendingCertificates,issuedCertificates].some(r=>r.status==='rejected');
 return <>
 <SectionCard className="profile-summary"><span className="person-avatar large" aria-hidden="true">{profile.name.slice(0,1)}</span><div className="profile-meta"><div className="button-row"><h2>{profile.name}</h2><StatusTag status={profile.employment_status}>{profile.employment_status==='ACTIVE'?'재직':'퇴사'}</StatusTag></div><p>{department} · {profile.title}</p><p>{profile.company_email} · 입사 {profile.hire_date}</p></div><Link className="button" href={`/people/${profile.id}`}>내 기본정보</Link></SectionCard>
 <SummaryStrip label="내 업무 요약"><Link href="/leave"><SummaryCard label={`${data.today} 사용 가능한 휴가`} value={leave.status==='fulfilled'?`${leave.value.usable}일`:'확인 필요'}/></Link><Count result={projects} label="현재 참여 프로젝트" href="/projects/me"/><Count result={signatures} label="직원 서명 필요" href="/contracts/me"/><Count result={pendingCertificates} label="증명서 처리 중" href="/certificates/me"/><Count result={issuedCertificates} label="발급된 증명서" href="/certificates/me"/></SummaryStrip>
 {leave.status==='fulfilled'&&leave.value.unverified&&<Alert title="사용기간 확인이 필요한 휴가가 있습니다">확인되지 않은 기존 원장 잔액은 사용 가능 일수에 포함하지 않습니다. <Link href="/leave">휴가 내역 확인</Link></Alert>}
 {unavailable&&<Alert tone="warning">일부 업무 요약을 불러오지 못했습니다. 0건으로 표시하지 않으며 각 업무 화면에서 다시 확인할 수 있습니다. <Link href="/me">다시 불러오기</Link></Alert>}
 <SectionCard><h2>내 업무 바로가기</h2><div className="my-page-links">{shortcuts.map(([href,label,description])=><Link key={href} href={href}><strong>{label}</strong><span>{description}</span></Link>)}<Link href="/projects/me"><strong>내 프로젝트</strong><span>투입 일정과 역할</span></Link><Link href={`/people/${profile.id}?tab=documents`}><strong>내 인사서류</strong><span>본인에게 공개된 서류 확인</span></Link></div></SectionCard>
 </>;
}
export function MyPage(){return <div className="my-page"><PageHeader title="마이페이지" description="내 직원 정보와 지금 처리할 업무를 한곳에서 확인하세요."/><Suspense fallback={<SectionCard aria-busy="true"><p role="status">내 업무를 불러오는 중입니다…</p></SectionCard>}><Content/></Suspense></div>;}
