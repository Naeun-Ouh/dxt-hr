import type { BrowserContext } from "@playwright/test";
import type { Role, ExplicitCapability } from "../../src/lib/permissions";
export const cases: Record<string, { roles: Role[]; capabilities?: ExplicitCapability[]; status?: string }> = {
  employee: { roles: ["EMPLOYEE"] }, leader: { roles: ["EMPLOYEE", "TEAM_LEADER"] },
  division: { roles: ["DIVISION_HEAD"] }, expense: { roles: ["EXPENSE_ADMIN"] },
  it: { roles: ["IT_ADMIN"] }, admin: { roles: ["ADMIN"] }, ceo: { roles: ["CEO"] },
  designated: { roles: ["ADMIN"], capabilities: ["PRIVATE_HR_ACCESS"] },
  privateCeo: { roles: ["CEO"], capabilities: ["PRIVATE_HR_ACCESS"] },
  combined: { roles: ["EMPLOYEE", "TEAM_LEADER", "EXPENSE_ADMIN", "IT_ADMIN"] },
  inactive: { roles: ["ADMIN"], status: "INACTIVE" }, unprovisioned: { roles: [] },
};
export function tokenFor(name: string) {
  const encode = (data: object) => Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: name, exp: 4102444800, role: "authenticated" })}.fixture-signature`;
}
export async function loginAs(context: BrowserContext, name: string) {
  await context.clearCookies();
  await context.addCookies([{ name: "sb-localhost-auth-token", value: "base64-" + Buffer.from(JSON.stringify({
    access_token: tokenFor(name), refresh_token: `refresh-${name}`, token_type: "bearer", expires_at: 4102444800,
    user: { id: name, app_metadata: {}, user_metadata: { roles: ["CEO"], capabilities: ["PRIVATE_HR_ACCESS"] }, aud: "authenticated" },
  })).toString("base64url"), domain: "localhost", path: "/" }]);
}
