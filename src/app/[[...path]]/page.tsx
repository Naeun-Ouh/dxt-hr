import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireCapability } from "@/lib/auth/access";
import { can, type Principal } from "@/lib/permissions";
import { resolveRoute } from "@/lib/routes";
export const dynamic = "force-dynamic";
export default async function ProtectedPage({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  const pathname = `/${path.join("/")}`;
  const route = resolveRoute(pathname);
  if (!route) notFound();
  // Check every page navigation, including RSC requests and deep links, before rendering.
  const principal = await requireCapability(route.capability, pathname);
  return <AppShell principal={principal} route={route}>
    {pathname === "/" ? <Home principal={principal} /> : <>
      <div className="page-heading"><h1>{route.title}</h1><p>디엑스티 임직원 운영 관리</p></div>
      {route.path === "/admin/employees/[id]" && can(principal, "PRIVATE_HR_ACCESS") && <Link className="button" href={`${pathname}/private`}>HR Private</Link>}
      <section className="surface empty-state"><h2>{route.title} 화면을 준비하고 있습니다</h2><p>서비스 준비가 완료되면 이곳에서 이용하실 수 있습니다.</p><Link href="/" className="button">홈으로 돌아가기</Link></section>
    </>}
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
