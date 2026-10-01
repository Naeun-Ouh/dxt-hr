import { can, type Capability, type Principal } from "./permissions";
export interface AppRoute {
  path: string;
  title: string;
  capability: Capability;
  group?: string;
  icon: string;
  hideWhen?: Capability;
}
const employee = (path: string, title: string, group?: string, icon = "CircleX"): AppRoute => ({ path, title, group, icon, capability: "EMPLOYEE_ACCESS" });
const managed = (path: string, title: string, capability: Capability, group: string, icon: string): AppRoute => ({ path, title, capability, group, icon });
export const ROUTES: AppRoute[] = [
  employee("/", "홈", "홈"),
  employee("/people", "직원", "인사", "Users2"),
  employee("/people/[id]", "직원 프로필"),
  employee("/organization", "조직도", "인사", "ChartNetwork"),
  employee("/career", "커리어", "인사", "ChartNetwork"),
  employee("/career/new", "커리어 작성"),
  employee("/career/[id]/edit", "커리어 수정"),
  employee("/projects/assignments/[id]", "내 투입 상세"),
  employee("/projects/me", "내 프로젝트", "프로젝트", "FolderLock"),
  managed("/projects/team", "팀 프로젝트 현황", "TEAM_PROJECT_READ", "프로젝트", "Users3"),
  managed("/admin/resources", "인력 투입 현황", "PROJECT_MANAGE", "프로젝트", "Users3"),
  employee("/leave", "내 휴가", "휴가", "CalendarCheck"),
  employee("/leave/request", "휴가 신청"),
  employee("/leave/team-calendar", "팀 휴가 캘린더", "휴가", "Calendar"),
  employee("/leave/requests", "휴가 신청 내역", "휴가"),
  employee("/leave/weekend-work", "주말근무 등록"),
  managed("/leave/approvals", "휴가 승인", "TEAM_LEAVE_APPROVE", "휴가", "ShieldCheck"),
  employee("/expenses", "내 경비", "경비", "CreditCard"),
  employee("/expenses/new", "경비 등록", "경비", "ReceiptText"),
  employee("/expenses/[id]", "경비 상세"),
  employee("/expenses/items/[id]/edit", "경비 수정"),
  {path:"/admin/expenses/[id]",title:"경비 상세",capability:"EXPENSE_MANAGE",icon:"CreditCard"},
  employee("/expenses/upload", "Excel 업로드", "경비", "FileSpreadsheet"),
  { ...employee("/assets/me", "내 장비", "자산", "Laptop"), hideWhen: "ASSET_MANAGE" },
  managed("/admin/assets", "장비 관리", "ASSET_MANAGE", "자산", "Laptop"),
  managed("/admin/windows-licenses", "Windows 라이선스", "WINDOWS_MANAGE", "자산", "KeyRound"),
  managed("/admin/accounts", "계정 관리", "ACCOUNT_MANAGE", "자산", "KeyRound"),
  employee("/announcements", "공지사항", "회사", "Megaphone"),
  employee("/family-events", "경조사", "회사", "Heart"),
  employee("/family-events/new", "경조사 등록"),
  managed("/admin/employees", "직원 관리", "EMPLOYEE_MANAGE", "관리", "UserCog"),
  managed("/admin/projects", "프로젝트 관리", "PROJECT_MANAGE", "관리", "FolderCog"),
  managed("/admin/leave", "휴가 관리", "LEAVE_MANAGE", "관리", "CalendarCog"),
  managed("/admin/holidays", "근무 캘린더", "HOLIDAY_MANAGE", "관리", "Calendar"),
  managed("/admin/expenses", "경비 관리", "EXPENSE_MANAGE", "관리", "CircleX"),
  managed("/admin/onboarding", "온보딩", "ONBOARDING_MANAGE", "관리", "UserPlus"),
  managed("/admin/offboarding", "퇴사 관리", "OFFBOARDING_MANAGE", "관리", "UserMinus"),
  managed("/admin/settings/birthday-email", "생일 메일 설정", "SETTINGS_MANAGE", "관리", "Settings"),
  { path: "/admin/employees/new", title: "직원 등록", capability: "EMPLOYEE_MANAGE", icon: "UserPlus" },
  { path: "/admin/employees/[id]", title: "직원 상세", capability: "EMPLOYEE_MANAGE", icon: "Users2" },
  { path: "/admin/employees/[id]/edit", title: "직원 수정", capability: "EMPLOYEE_MANAGE", icon: "UserCog" },
  { path: "/admin/employees/[id]/private", title: "HR Private", capability: "PRIVATE_HR_ACCESS", icon: "FolderLock" },
  { path: "/admin/projects/new", title: "프로젝트 등록", capability: "PROJECT_MANAGE", icon: "FolderCog" },
  { path: "/admin/projects/[id]/edit", title: "프로젝트 수정", capability: "PROJECT_MANAGE", icon: "FolderCog" },
  { path: "/admin/projects/[id]", title: "프로젝트 상세", capability: "PROJECT_MANAGE", icon: "FolderCog" },
  { path: "/admin/assets/new", title: "장비 등록", capability: "ASSET_MANAGE", icon: "Laptop" },
  { path: "/admin/assets/[id]", title: "장비 상세", capability: "ASSET_MANAGE", icon: "Laptop" },
  { path: "/admin/windows-licenses/new", title: "라이선스 등록", capability: "WINDOWS_MANAGE", icon: "Laptop" },
  { path: "/admin/windows-licenses/[id]", title: "라이선스 상세", capability: "WINDOWS_MANAGE", icon: "Laptop" },
  { path: "/admin/accounts/new", title: "계정 등록", capability: "ACCOUNT_MANAGE", icon: "Laptop" },
  { path: "/admin/accounts/[id]", title: "계정 상세", capability: "ACCOUNT_MANAGE", icon: "Laptop" },
  { path: "/assets/me/[id]", title: "내 장비", capability: "EMPLOYEE_ACCESS", icon: "Laptop" },
];
export function resolveRoute(path: string): AppRoute | undefined {
  const segments = path.split("/");
  return ROUTES.find(route => route.path === path) ?? ROUTES.find(route => {
    const expected = route.path.split("/");
    return expected.length === segments.length && expected.every((segment, i) => segment === "[id]" ? /^[a-zA-Z0-9_-]+$/.test(segments[i]) && segments[i] !== "new" : segment === segments[i]);
  });
}
export function navigationFor(principal: Principal): AppRoute[] {
  return ROUTES.filter(route => route.group && can(principal, route.capability) && !(route.hideWhen && can(principal, route.hideWhen)));
}
export function safeReturnPath(value: unknown): string {
  return typeof value === "string" && resolveRoute(value) ? value : "/";
}
