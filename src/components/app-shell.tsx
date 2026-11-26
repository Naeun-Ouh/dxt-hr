import {WorkspaceNavigation} from "./workspace-navigation";
import { NavigationPanel } from "./ui/navigation-panel";
import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "./brand";
import { type AppRoute } from "@/lib/routes";
import { ROLE_LABELS, type Principal } from "@/lib/permissions";
import { signOut } from "@/app/login/actions";
export function Icon({ name }: { name: string }) { return <img className="nav-icon" src={`/figma/${name}.svg`} alt="" />; }
export function AppShell({ principal, route, children }: { principal: Principal; route: AppRoute; children: ReactNode }) {
  return <div className="app-shell">
    <a className="skip-link" href="#main">본문으로 건너뛰기</a>
    <aside className="sidebar"><Brand />
      <NavigationPanel><WorkspaceNavigation principal={principal}/></NavigationPanel>
      <div className="user-card"><img src="/figma/Avatar.svg" alt="" /><div><strong>{principal.name}</strong><div className="role-tags">{principal.roles.map(role => <span key={role} className={role === "TEAM_LEADER" ? "team" : ""}>{ROLE_LABELS[role]}</span>)}</div></div></div>
    </aside>
    <div className="main-view"><header className="top-header">
      <nav aria-label="현재 위치" className="breadcrumbs"><Link href="/">홈</Link>{route.path !== "/" && <><img src="/figma/ChevronRight.svg" alt="" /><span>{route.title}</span></>}</nav>
      <div className="header-profile"><img src="/figma/UserAvatar.svg" alt="" /><span className="profile-badge">{ROLE_LABELS[principal.roles.at(-1)!]}</span><form action={signOut}><button className="text-button" type="submit">로그아웃</button></form></div>
    </header><main className="content-view" id="main" tabIndex={-1}><WorkspaceNavigation principal={principal} tabs/>{children}</main></div>
  </div>;
}
