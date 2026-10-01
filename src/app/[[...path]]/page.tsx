import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireCapability } from "@/lib/auth/access";
import { can, type Principal } from "@/lib/permissions";
import { EmployeeList, EmployeeEditor, EmployeeDetail, HrPrivateScreen, OrganizationScreen } from "@/components/employees/screens";
import type { SearchParams } from "@/lib/employees/data";
import { resolveRoute } from "@/lib/routes";
import { ProjectList, ProjectEditor, ProjectDetail, MyProjects, ResourceView, CareerScreen } from "@/components/projects/screens";
import { ExpenseList, ExpenseEditor, ExpenseDetail, ExpenseImport } from "@/components/expenses/screens";
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
    {screen || (pathname === "/" ? <Home principal={principal} /> : <>
      <div className="page-heading"><h1>{route.title}</h1><p>디엑스티 임직원 운영 관리</p></div>
      <section className="surface empty-state"><h2>{route.title} 화면을 준비하고 있습니다</h2><p>서비스 준비가 완료되면 이곳에서 이용하실 수 있습니다.</p><Link href="/" className="button">홈으로 돌아가기</Link></section>
    </>)}
  </AppShell>;
}
function Home({ principal }: { principal: Principal }) {
  const shortcuts = [
    { path: "/leave/request", description: "휴가 신청과 내 휴가 내역을 확인하세요." },
    { path: "/expenses/new", description: "사용한 경비를 등록하고 관리하세요." },
    { path: "/projects/me", description: "내가 참여하는 프로젝트를 확인하세요." },
    { path: "/people", description: "함께 일하는 동료를 찾아보세요." },
    { path: "/leave/approvals", description: "팀원의 휴가 신청을 확인하세요." },
    { path: "/admin/expenses", description: "제출된 경비 내역을 확인하세요." },
    { path: "/admin/assets", description: "회사 장비 현황을 확인하세요." },
    { path: "/admin/employees", description: "임직원 정보를 관리하세요." },
  ].filter(item => can(principal, resolveRoute(item.path)!.capability));
  return <><div className="page-heading"><h1>DXT People &amp; Operations</h1><p>{principal.name}님, 안녕하세요. 필요한 업무를 빠르게 찾아보세요.</p></div>
    <section className="surface app-map"><h2>자주 사용하는 업무 바로가기</h2><div className="shortcut-grid">{shortcuts.map(item => <Link className="shortcut-card" href={item.path} key={item.path}><h3>{resolveRoute(item.path)!.title}</h3><p>{item.description}</p></Link>)}</div></section></>;
}
