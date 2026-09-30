export const ROLES = ["EMPLOYEE", "TEAM_LEADER", "DIVISION_HEAD", "EXPENSE_ADMIN", "IT_ADMIN", "ADMIN", "CEO"] as const;
export type Role = typeof ROLES[number];
export const ROLE_LABELS: Record<Role, string> = {
  EMPLOYEE: "사원", TEAM_LEADER: "팀장", DIVISION_HEAD: "본부장", EXPENSE_ADMIN: "경비관리자",
  IT_ADMIN: "IT관리자", ADMIN: "관리자", CEO: "대표",
};
export const CAPABILITIES = [
  "EMPLOYEE_ACCESS", "TEAM_LEAVE_APPROVE", "TEAM_LEAVE_REASON_READ", "TEAM_PROJECT_READ", "TEAM_CAREER_READ",
  "EXPENSE_MANAGE", "ASSET_MANAGE", "WINDOWS_MANAGE", "ACCOUNT_MANAGE", "EMPLOYEE_MANAGE",
  "PROJECT_MANAGE", "LEAVE_MANAGE", "HOLIDAY_MANAGE", "ONBOARDING_MANAGE", "OFFBOARDING_MANAGE",
  "SETTINGS_MANAGE", "PRIVATE_HR_ACCESS", "WINDOWS_KEY_REVEAL", "ACCOUNT_PASSWORD_REVEAL", "RESIGNATION_REASON_ACCESS",
] as const;
export type Capability = typeof CAPABILITIES[number];
export const EXPLICIT_CAPABILITIES = ["PRIVATE_HR_ACCESS", "WINDOWS_KEY_REVEAL", "ACCOUNT_PASSWORD_REVEAL"] as const;
export type ExplicitCapability = typeof EXPLICIT_CAPABILITIES[number];
export interface Principal {
  id: string;
  name: string;
  roles: Role[];
  grants: ExplicitCapability[];
}
const operational: Capability[] = ["EMPLOYEE_MANAGE", "PROJECT_MANAGE", "TEAM_PROJECT_READ", "TEAM_LEAVE_APPROVE", "TEAM_LEAVE_REASON_READ", "LEAVE_MANAGE", "HOLIDAY_MANAGE", "EXPENSE_MANAGE", "ASSET_MANAGE", "WINDOWS_MANAGE", "ACCOUNT_MANAGE", "ONBOARDING_MANAGE", "OFFBOARDING_MANAGE", "SETTINGS_MANAGE"];
const roleCapabilities: Record<Role, readonly Capability[]> = {
  EMPLOYEE: [],
  TEAM_LEADER: ["TEAM_LEAVE_APPROVE", "TEAM_LEAVE_REASON_READ", "TEAM_PROJECT_READ", "TEAM_CAREER_READ"],
  // TODO(PERMISSIONS.md): broader DIVISION_HEAD scope is unresolved; employee base only.
  DIVISION_HEAD: [],
  EXPENSE_ADMIN: ["EXPENSE_MANAGE"],
  IT_ADMIN: ["ASSET_MANAGE", "WINDOWS_MANAGE", "ACCOUNT_MANAGE", "WINDOWS_KEY_REVEAL", "ACCOUNT_PASSWORD_REVEAL"],
  ADMIN: operational,
  CEO: [...operational, "PRIVATE_HR_ACCESS", "RESIGNATION_REASON_ACCESS"],
};
export function capabilitiesFor(principal: Principal): Set<Capability> {
  const capabilities = new Set<Capability>();
  for (const role of principal.roles) {
    if (!ROLES.includes(role)) continue;
    capabilities.add("EMPLOYEE_ACCESS");
    for (const capability of roleCapabilities[role]) capabilities.add(capability);
  }
  // CEO receives PRIVATE_HR_ACCESS by role; ADMIN requires an explicit grant.
  // The database allows at most one non-CEO ADMIN with that grant.
  if (principal.roles.some(role => role === "ADMIN" || role === "CEO")) {
    for (const grant of principal.grants) if (EXPLICIT_CAPABILITIES.includes(grant)) capabilities.add(grant);
  }
  return capabilities;
}
export function can(principal: Principal, capability: Capability): boolean {
  return capabilitiesFor(principal).has(capability);
}

// Only use records read from the protected membership table, never user_metadata.
export function parseMembership(id: string, value: unknown): Principal | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.status !== "ACTIVE" || typeof row.display_name !== "string" || !row.display_name.trim()) return null;
  if (!Array.isArray(row.roles) || !row.roles.length || !row.roles.every(role => ROLES.includes(role))) return null;
  if (!Array.isArray(row.capabilities) || !row.capabilities.every(cap => EXPLICIT_CAPABILITIES.includes(cap))) return null;
  return { id, name: row.display_name, roles: [...new Set(row.roles)] as Role[], grants: [...new Set(row.capabilities)] as ExplicitCapability[] };
}
