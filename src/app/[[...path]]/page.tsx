import {LeaveSimulationScreen} from '@/components/leave-simulation/screen';
import {LeaveBenefitsScreen} from '@/components/leave-benefits/screen';
import {MyPage} from '@/components/my-page/screen';
import {CarryoverScreen} from "@/components/carryover/screen";

import {WeekendScreen} from '@/components/leave/weekend-screen';
import { MigrationReviewScreen } from "@/components/migration/screen";
import {LifecycleScreen} from "@/components/operations/lifecycle-screen";
import { CertificateScreen } from "@/components/certificates/screen";

import {HolidayWorkspace} from '@/components/leave/holidays';
import {holidayData} from '@/lib/leave/holidays';
import { SealScreen } from '@/components/contracts/seal-screen';
import { ContractsScreen } from "@/components/contracts/screens";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireCapability } from "@/lib/auth/access";

import { EmployeeList, EmployeeEditor, EmployeeDetail, HrPrivateScreen, OrganizationScreen } from "@/components/employees/screens";
import type { SearchParams } from "@/lib/employees/data";
import { resolveRoute } from "@/lib/routes";
import { ProjectList, ProjectEditor, ProjectDetail, MyProjects, ResourceView, CareerScreen } from "@/components/projects/screens";
import { ExpenseList, ExpenseEditor, ExpenseDetail, ExpenseImport } from "@/components/expenses/screens";
import { AssetList,AssetEditor,VaultScreen } from "@/components/assets/screens";
import { OperationsScreen,AnnouncementsScreen,FamilyScreen,BirthdayScreen } from "@/components/operations/screens";
import { LeaveScreen } from "@/components/leave/screens";
export const dynamic = "force-dynamic";
export default async function ProtectedPage({ params, searchParams }: { params: Promise<{ path?: string[] }>; searchParams: Promise<SearchParams> }) {
  const { path = [] } = await params;
  const pathname = `/${path.join("/")}`;
  const route = resolveRoute(pathname);
  if (!route) notFound();
  // Check every page navigation, including RSC requests and deep links, before rendering.
  const principal = await requireCapability(route.capability, pathname);
  const query = await searchParams;
  let screen: React.ReactNode;
  switch (route.path) {
    case "/":case "/me":screen=<MyPage/>;break;
    case "/admin/leave/simulation":screen=<LeaveSimulationScreen/>;break;
    case "/admin/leave/benefits":screen=<LeaveBenefitsScreen/>;break;
    case "/leave/carryover":case "/admin/leave/carryover":screen=<CarryoverScreen admin={path[0]==='admin'}/>;break;

    case "/leave/weekend-work":case "/leave/weekend-work/approvals":screen=<WeekendScreen review={path[2]==='approvals'} principal={principal}/>;break;
    case "/admin/migration-review":screen=<MigrationReviewScreen/>;break;
    case "/admin/lifecycle":case "/admin/lifecycle/[id]":screen=<LifecycleScreen id={path[2]}/>;break;
    case "/certificates/me":case "/admin/certificates":screen=<CertificateScreen admin={path[0]==='admin'}/>;break;
    case "/admin/contracts/seals":screen=<SealScreen/>;break;
    case "/contracts/me":case "/contracts/me/[id]":case "/admin/contracts":case "/admin/contracts/[id]":screen=<ContractsScreen admin={path[0]==='admin'} id={path[2]} principal={principal}/>;break;
    case "/leave":case "/leave/request":case "/leave/requests":case "/leave/requests/[id]":case "/leave/approvals":case "/leave/team-calendar":case "/admin/leave":case "/admin/leave/[id]":
      screen=<LeaveScreen mode={path[0]==='admin'?'admin':path[1]==='request'?'request':path[1]==='requests'?'requests':path[1]==='approvals'?'approvals':path[1]==='team-calendar'?'calendar':'overview'} id={path[2]} query={query} principal={principal}/>;break;
    case "/admin/onboarding": case "/admin/onboarding/new": case "/admin/onboarding/[id]":
    case "/admin/offboarding": case "/admin/offboarding/new": case "/admin/offboarding/[id]":
      screen=<OperationsScreen kind={path[1]==='onboarding'?'onboarding':'offboarding'} id={path[2]==='new'?undefined:path[2]} create={path[2]==='new'} query={query} principal={principal}/>;break;
    case "/announcements":case "/announcements/new":case "/announcements/[id]":case "/announcements/[id]/edit":
      screen=<AnnouncementsScreen id={path[1]==='new'?undefined:path[1]} create={path[1]==='new'} edit={path[2]==='edit'} query={query} principal={principal}/>;break;
    case "/family-events":case "/family-events/new":case "/family-events/[id]/edit":case "/family-events/review":case "/family-events/review/[id]":
      screen=<FamilyScreen id={path[1]==='review'?path[2]:path[1]==='new'?undefined:path[1]} create={path[1]==='new'} edit={path[2]==='edit'} review={path[1]==='review'} query={query} principal={principal}/>;break;
    case "/admin/holidays":screen=<HolidayWorkspace {...await holidayData()}/>;break;
    case "/admin/settings/birthday-email":screen=<BirthdayScreen query={query}/>;break;
    case "/assets/me": case "/assets/me/[id]": screen=<AssetList own query={query} id={path[2]}/>;break;
    case "/admin/assets":screen=<AssetList query={query}/>;break;
    case "/admin/assets/new":screen=<AssetEditor query={query}/>;break;
    case "/admin/assets/[id]":screen=<AssetEditor id={path[2]} query={query}/>;break;
    case "/admin/windows-licenses": case "/admin/windows-licenses/new": case "/admin/windows-licenses/[id]":
    case "/admin/accounts": case "/admin/accounts/new": case "/admin/accounts/[id]":
      screen=<VaultScreen kind={path[1]==='windows-licenses'?'windows':'account'} principal={principal} create={path[2]==='new'} id={path[2]==='new'?undefined:path[2]} query={query}/>;break;
    case "/expenses": screen=<ExpenseList query={query}/>; break;
    case "/admin/expenses": screen=<ExpenseList query={query} admin/>; break;
    case "/expenses/new": screen=<ExpenseEditor query={query}/>; break;
    case "/expenses/items/[id]/edit": screen=<ExpenseEditor id={path[2]} query={query}/>; break;
    case "/expenses/[id]": screen=<ExpenseDetail id={path[1]} query={query}/>; break;
    case "/admin/expenses/[id]": screen=<ExpenseDetail id={path[2]} query={query} admin/>; break;
    case "/expenses/upload": screen=<ExpenseImport/>; break;
    case "/admin/projects": screen = <ProjectList query={query}/>; break;
    case "/admin/projects/new": screen = <ProjectEditor/>; break;
    case "/admin/projects/[id]/edit": screen = <ProjectEditor id={path[2]}/>; break;
    case "/admin/projects/[id]": screen = <ProjectDetail id={path[2]} query={query}/>; break;
    case "/admin/resources": screen = <ResourceView query={query}/>; break;
    case "/projects/team": screen = <ResourceView team query={query}/>; break;
    case "/projects/me": screen = <MyProjects/>; break;
    case "/projects/assignments/[id]": screen = <MyProjects id={path[2]}/>; break;
    case "/career": screen = <CareerScreen query={query}/>; break;
    case "/career/new": screen = <CareerScreen create query={query}/>; break;
    case "/career/[id]/edit": screen = <CareerScreen id={path[1]} query={query}/>; break;
    case "/people": case "/admin/employees": screen = <EmployeeList admin={route.path.startsWith("/admin")} query={query} />; break;
    case "/admin/employees/new": screen = <EmployeeEditor principal={principal} />; break;
    case "/admin/employees/[id]/edit": screen = <EmployeeEditor id={path[2]} principal={principal} />; break;
    case "/admin/employees/[id]": screen = <EmployeeDetail id={path[2]} admin principal={principal} query={query} />; break;
    case "/people/[id]": screen = <EmployeeDetail id={path[1]} admin={false} principal={principal} query={query} />; break;
    case "/admin/employees/[id]/private": screen = <HrPrivateScreen id={path[2]} query={query} />; break;
    case "/organization": screen = <OrganizationScreen principal={principal} query={query} />; break;
  }
  return <AppShell principal={principal} route={route}>
    {screen || (<>
      <div className="page-heading"><h1>{route.title}</h1><p>디엑스티 임직원 운영 관리</p></div>
      <section className="surface empty-state"><h2>{route.title} 화면을 준비하고 있습니다</h2><p>서비스 준비가 완료되면 이곳에서 이용하실 수 있습니다.</p><Link href="/" className="button">홈으로 돌아가기</Link></section>
    </>)}
  </AppShell>;
}