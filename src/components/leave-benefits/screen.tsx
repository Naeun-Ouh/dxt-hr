import {PageHeader} from '@/components/ui/primitives';
import {benefitData} from '@/lib/leave-benefits/data';
import {BenefitWorkspace} from './workspace';
export async function LeaveBenefitsScreen(){const data=await benefitData();return <><PageHeader title="대휴 · 이월 반영" description="확정된 근거와 기존 원장을 대조한 뒤 회사 복지 재원을 반영합니다."/><p className="asset-notice">주말근무 대휴는 회사 복지이며 임금·수당을 대체하지 않습니다. 이월은 연말 사용·대기 내역을 마감한 다음 회계연도에만 반영합니다. 실제 사용·법정 권리 소멸·급여 정산을 자동 처리하지 않습니다.</p><BenefitWorkspace {...data}/></>;}
