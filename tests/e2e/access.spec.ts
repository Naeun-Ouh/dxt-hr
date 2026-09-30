import { test, expect } from "@playwright/test";
import { loginAs, cases } from "./fixtures";
import { ROUTES } from "../../src/lib/routes";
const employeePaths = ["/", "/people", "/organization", "/career", "/projects/me", "/leave", "/leave/team-calendar", "/leave/requests", "/expenses", "/expenses/new", "/expenses/upload", "/assets/me", "/announcements", "/family-events"];
const additions: Record<string, string[]> = {
  employee: [], leader: ["/projects/team", "/leave/approvals"], division: [], expense: ["/admin/expenses"],
  it: ["/admin/assets", "/admin/windows-licenses", "/admin/accounts"],
  combined: ["/projects/team", "/leave/approvals", "/admin/expenses", "/admin/assets", "/admin/windows-licenses", "/admin/accounts"],
};
for (const [name, extra] of Object.entries(additions)) {
  test(`${name}: exact rendered navigation, assets and screenshot`, async ({ page, context }) => {
    await loginAs(context, name);
    await page.goto("/people");
    const expected = [...employeePaths.filter(path => !(path === "/assets/me" && ["it", "combined"].includes(name))), ...extra].sort();
    expect((await page.locator('nav[aria-label="주 메뉴"] a').evaluateAll(links => links.map(a => a.getAttribute("href")))).sort()).toEqual(expected);
    await expect(page.getByRole("link", { name: "직원", exact: true })).toHaveAttribute("aria-current", "page");
    const images = await page.locator("img").evaluateAll(images => images.map(element => { const img = element as HTMLImageElement; return ({ loaded: img.complete && img.naturalWidth > 0, width: img.width, naturalWidth: img.naturalWidth, height: img.height, naturalHeight: img.naturalHeight }); }));
    expect(images.every(img => img.loaded && img.width === img.naturalWidth && img.height === img.naturalHeight)).toBe(true);
    expect(await page.locator(".sidebar").evaluate(el => el.getBoundingClientRect().width)).toBe(240);
    expect(await page.locator(".top-header").evaluate(el => el.getBoundingClientRect().height)).toBe(60);
    await page.screenshot({ path: `docs/screenshots/sidebar-${name}.png`, fullPage: true });
  });
}
test("anonymous, inactive, unprovisioned and tampered sessions are denied", async ({ page, context }) => {
  for (const name of [null, "inactive", "unprovisioned", "forged-admin"]) {
    await context.clearCookies();
    if (name) await loginAs(context, name);
    await page.goto("/admin/employees");
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page.locator(".sidebar")).toHaveCount(0);
  }
});
test("employee cannot directly request any restricted route even with forged user_metadata", async ({ page, context }) => {
  await loginAs(context, "employee");
  for (const route of ROUTES.filter(route => route.capability !== "EMPLOYEE_ACCESS")) {
    const response = await page.goto(route.path.replace("[id]", "test-person"));
    expect(response!.status(), route.path).toBe(404);
    await expect(page.locator(".sidebar")).toHaveCount(0);
  }
});
test("specialists and multi-role users cannot reach unrelated admin or private HR pages", async ({ page, context }) => {
  for (const [name, denied] of Object.entries({ leader: ["/admin/expenses", "/admin/assets"], division: ["/leave/approvals", "/admin/expenses"], expense: ["/leave/approvals", "/admin/accounts"], it: ["/admin/expenses", "/leave/approvals"], combined: ["/admin/employees"] })) {
    await loginAs(context, name);
    for (const path of [...denied, "/admin/employees/10000000-0000-4000-8000-000000000001/private"]) expect((await page.goto(path))!.status()).toBe(404);
  }
});
test("CEO reaches private HR by role while ADMIN requires the designated grant", async ({ page, context }) => {
  for (const name of ["admin", "ceo", "designated", "privateCeo"]) {
    await loginAs(context, name);
    for (const path of ["/admin/employees", "/admin/expenses", "/admin/accounts", "/admin/projects/test"]) expect((await page.goto(path))!.status()).toBe(200);
    const hasPrivateHr = cases[name].roles.includes("CEO") || Boolean(cases[name].capabilities?.includes("PRIVATE_HR_ACCESS"));
    await page.goto("/admin/employees/10000000-0000-4000-8000-000000000001");
    await expect(page.getByRole("link", { name: "HR Private" })).toHaveCount(hasPrivateHr ? 1 : 0);
    expect((await page.goto("/admin/employees/10000000-0000-4000-8000-000000000001/private"))!.status()).toBe(hasPrivateHr ? 200 : 404);
  }
});
test("RSC requests, unknown descendants and privilege-shaped query strings fail closed", async ({ context, page }) => {
  await loginAs(context, "employee");
  const response = await context.request.get("/admin/employees/10000000-0000-4000-8000-000000000001/private", { headers: { RSC: "1" } });
  // Next streams RSC errors with HTTP 200; the server error digest must reject rendering.
  const flight = await response.text();
  expect(flight).toContain('NEXT_HTTP_ERROR_FALLBACK;404');
  expect(flight).not.toContain('HR Private');
  expect(flight).not.toContain('sidebar');
  expect((await page.goto("/people/admin"))!.status()).toBe(404);
  expect((await page.goto("/admin/expenses?role=CEO&PRIVATE_HR_ACCESS=true"))!.status()).toBe(404);
});
test("navigation, home shortcuts, logout and responsive layout work", async ({ page, context }) => {
  await loginAs(context, "admin");
  await page.goto("/");
  await page.screenshot({ path: "docs/screenshots/frame-01-shell.png", fullPage: true });
  await page.locator('.shortcut-card[href="/admin/employees"]').click();
  await expect(page.getByRole("heading", { name: "직원 관리", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("summary").click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: "docs/screenshots/mobile-shell.png", fullPage: true });
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?next=/);
});
test("login and callback reject missing OAuth code and unsafe return URL", async ({ page }) => {
  await page.goto("/auth/callback?next=https://evil.test");
  await expect(page).toHaveURL("http://localhost:3100/login?error=signin");
  await page.goto("/login?next=//evil.test");
  await expect(page.locator('input[name="next"]')).toHaveValue("/");
  await page.screenshot({ path: "docs/screenshots/login.png", fullPage: true });
});

test("Google OAuth shell exchanges PKCE code and returns to the requested page", async ({ page }) => {
  await page.goto("/login?next=/projects/me");
  await page.getByRole("button", { name: "Google 계정으로 로그인" }).click();
  await expect(page).toHaveURL("http://localhost:3100/projects/me");
  await expect(page.getByRole("heading", { name: "내 프로젝트", exact: true })).toBeVisible();
  await expect(page.locator('nav[aria-label="주 메뉴"] a[href="/admin/employees"]')).toHaveCount(0);
});
