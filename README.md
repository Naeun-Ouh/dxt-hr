# DXT People & Operations

Internal HR & Operations system for DXT.

## Source of truth

- Product/UI source of truth: DXT HR Figma
  - https://www.figma.com/design/BL670ZpeySoSAhEZLgK62e/DXT-HR_AI?node-id=0-1
- Business policy source of truth: `docs/BUSINESS_RULES.md`
- Role/data access source of truth: `docs/PERMISSIONS.md`
- Implementation contract for Codex: `AGENTS.md`

## Product scope

DXT People & Operations consolidates employee, organization, project assignment, career, leave, expense, equipment, Windows license, onboarding/offboarding, announcements, and family events. Google OAuth login remains required; automatic Gmail delivery is deferred.

This repository is intentionally implementation-first:
- do not invent HR policies,
- do not add global payroll SaaS concepts,
- do not expose unauthorized navigation,
- preserve DXT-specific business rules,
- keep the UI aligned with the approved Figma frames.

## Development workflow

1. Read `AGENTS.md`.
2. Read the relevant files under `docs/`.
3. Implement only approved v1 scope.
4. Open focused PRs.
5. Reconcile implementation with Figma and documented validation/permission rules before merging.

## Development

Requires Node.js 22 or newer.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Without Supabase configuration, the sign-in screen shows a setup message and protected routes remain inaccessible. There is no demo user or production auth bypass.

Configure a Supabase project with Google OAuth, apply all migrations in `supabase/migrations/` in filename order, and provision a membership **after the employee joins** using trusted SQL/server administration. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `APP_ORIGIN`. Register `${APP_ORIGIN}/auth/callback` in Supabase's redirect allowlist and the Supabase OAuth callback URL in Google. An authenticated Google account alone does not grant application access.

Never use a Supabase service-role key as the publishable key. No service-role key is needed by this app. Membership writes are deliberately unavailable to browser clients and app users, including ADMIN.

```sql
-- Replace with an actual joined employee's auth.users UUID and name.
insert into public.app_memberships (user_id, display_name, roles)
values ('00000000-0000-0000-0000-000000000000', '직원 이름', array['EMPLOYEE']);
```

CEO receives `PRIVATE_HR_ACCESS` automatically by role. Grant it explicitly only to the designated ADMIN through trusted provisioning. A database constraint allows at most one non-CEO ADMIN with this grant. Other roles do not automatically receive it. Set `status = 'INACTIVE'` to revoke application access; each new protected request re-reads membership.

### Validation

```sh
npm run lint
npm test
npm run build
npm run typecheck
npx playwright install chromium
npm run test:e2e
```

Browser tests run the production build against an isolated local Supabase HTTP test double; no real employee data or credentials are used. To reuse an installed Chromium binary, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. The HTTP double executes domain queries against PGlite with the authenticated database role and the actual migrations; dedicated database tests also exercise constraints and RLS.

See [Phase 1 implementation and visual review](docs/PHASE_1.md) for boundaries, screenshots, and setup checks.


## Phase 2 employee setup

Configure the server-only `HR_ENCRYPTION_ACTIVE_KEY` and `HR_ENCRYPTION_KEYS` before entering birth dates or HR Private values. See [Phase 2 implementation](docs/PHASE_2.md) for the key format, rotation, schema, permissions, screenshots, and deployment validation.

Employee profiles are separate from login memberships. Trusted provisioning can link `employee.auth_user_id` to an existing `auth.users.id` after joining. A linked INACTIVE employee cannot access the app or domain tables even if their membership remains ACTIVE. Employee forms assign one or more HR roles in `employee_role`, but cannot set the auth link, application-membership roles, or capabilities. These domain roles do not grant service access.

## Phase 3 project and career setup

Apply migrations `202609300004_projects.sql` and `202609300005_team_career_read.sql` in order after the employee migrations. Trusted provisioning must link `employee.auth_user_id` for own-project/career and team scope. See [Phase 3 implementation](docs/PHASE_3.md) for routes, history/retention behavior, row policies, unresolved team/denominator policies, validation, and Figma screenshots.

## Phase 7 company operations setup

Apply all migrations through `202610060011_defer_automatic_mail.sql`. Google OAuth / Supabase Auth login stays unchanged. Keep the server-only service key for the private document proxy; Gmail OAuth and cron credentials are not required. Family registration, CEO inbox, public board, birthday privacy and saved templates remain available, but no automatic mail is queued, claimed or sent and no company-mail cron is configured. See [current v1 scope and rollout](docs/ISSUE_15_DELIVERY.md) and [historical Phase 7 implementation](docs/PHASE_7_DELIVERY.md).

## Phase 4A basic leave

Apply migrations through `202610060012_basic_leave.sql`. The basic leave workflow includes annual balances/ledger, requests, scoped Team Leader decisions, cancellation reversals, a reason-free team calendar and audited Admin adjustments. Import confirmed opening balances with mandatory adjustment reasons; automatic accrual boundaries and Phase 4B rules remain deferred. See [Phase 4A delivery and rollout](docs/PHASE_4A_DELIVERY.md).
