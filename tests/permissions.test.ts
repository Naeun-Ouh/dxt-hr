import { test } from "node:test";
import assert from "node:assert/strict";
import { can, capabilitiesFor, parseMembership, ROLES, type Principal, type Role } from "../src/lib/permissions";
import { navigationFor, resolveRoute, ROUTES, safeReturnPath } from "../src/lib/routes";
const person = (...roles: Role[]): Principal => ({ id: "test", name: "테스트", roles, grants: [] });
test("each role gets employee base but no implicit private HR grant", () => {
  for (const role of ROLES) {
    assert(can(person(role), "EMPLOYEE_ACCESS"));
    assert(!can(person(role), "PRIVATE_HR_ACCESS"));
  }
});
test("all 128 role combinations are additive without sensitive HR inheritance", () => {
  for (let mask = 0; mask < 2 ** ROLES.length; mask++) {
    const roles = ROLES.filter((_, i) => mask & (1 << i));
    const expected = new Set(roles.flatMap(role => [...capabilitiesFor(person(role))]));
    assert.deepEqual(capabilitiesFor(person(...roles)), expected);
    assert(!can(person(...roles), "PRIVATE_HR_ACCESS"));
    const paths = navigationFor(person(...roles)).map(route => route.path);
    assert.equal(new Set(paths).size, paths.length);
  }
});
test("specialist roles do not acquire unrelated operational or secret access", () => {
  const expected: Partial<Record<Role, string[]>> = {
    TEAM_LEADER: ["/projects/team", "/leave/approvals"],
    DIVISION_HEAD: [], EXPENSE_ADMIN: ["/admin/expenses"],
    IT_ADMIN: ["/admin/assets", "/admin/windows-licenses", "/admin/accounts"],
  };
  for (const [role, paths] of Object.entries(expected)) {
    const routes = navigationFor(person(role as Role));
    assert.deepEqual(routes.filter(route => route.capability !== "EMPLOYEE_ACCESS").map(route => route.path).sort(), paths.sort());
  }
  for (const role of ["ADMIN", "CEO", "TEAM_LEADER", "EXPENSE_ADMIN", "DIVISION_HEAD"] as Role[]) {
    assert(!can(person(role), "WINDOWS_KEY_REVEAL"));
    assert(!can(person(role), "ACCOUNT_PASSWORD_REVEAL"));
  }
  assert(can(person("IT_ADMIN"), "WINDOWS_KEY_REVEAL"));
  assert(can(person("CEO"), "RESIGNATION_REASON_ACCESS"));
  assert(!can(person("ADMIN"), "RESIGNATION_REASON_ACCESS"));
});
test("private HR requires an eligible role AND an explicit grant", () => {
  for (const role of ROLES) {
    const user = { ...person(role), grants: ["PRIVATE_HR_ACCESS"] as const };
    assert.equal(can({ ...user, grants: [...user.grants] }, "PRIVATE_HR_ACCESS"), ["CEO", "ADMIN"].includes(role));
  }
});
test("IT navigation replaces personal assets without revoking own-asset capability", () => {
  assert(!navigationFor(person("IT_ADMIN")).some(route => route.path === "/assets/me"));
  assert(can(person("IT_ADMIN"), resolveRoute("/assets/me")!.capability));
});
test("private deep links cannot fall through to employee management", () => {
  assert.equal(resolveRoute("/admin/employees/user-1/private")?.capability, "PRIVATE_HR_ACCESS");
  assert.equal(resolveRoute("/admin/employees/new")?.capability, "EMPLOYEE_MANAGE");
  for (const path of ["/admin/employees/x/private/extra", "/admin/employees/new/private", "/admin/anything", "/people/anything", "/admin/employees/../private"]) assert.equal(resolveRoute(path), undefined);
  for (const route of ROUTES) assert(resolveRoute(route.path.replace("[id]", "test-id")));
});
test("return URLs allow only known local routes", () => {
  for (const value of ["https://evil.test", "//evil.test", "/\\evil.test", "/%2f%2fevil.test", "/login", "/people?next=evil", ["/people"], null]) assert.equal(safeReturnPath(value), "/");
  assert.equal(safeReturnPath("/leave/request"), "/leave/request");
});
test("invalid and inactive membership records fail closed", () => {
  const valid = { display_name: "테스트", status: "ACTIVE", roles: ["EMPLOYEE"], capabilities: [] };
  assert(parseMembership("id", valid));
  for (const bad of [null, {}, { ...valid, status: "INACTIVE" }, { ...valid, roles: [] }, { ...valid, roles: ["OWNER"] }, { ...valid, capabilities: ["ALL"] }, { ...valid, display_name: " " }]) assert.equal(parseMembership("id", bad), null);
});
