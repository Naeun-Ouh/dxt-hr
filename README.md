# DXT People & Operations

Internal HR & Operations system for DXT.

## Source of truth

- Product/UI source of truth: DXT HR Figma
  - https://www.figma.com/design/BL670ZpeySoSAhEZLgK62e/DXT-HR_AI?node-id=0-1
- Business policy source of truth: `docs/BUSINESS_RULES.md`
- Role/data access source of truth: `docs/PERMISSIONS.md`
- Implementation contract for Codex: `AGENTS.md`

## Product scope

DXT People & Operations consolidates employee, organization, project assignment, career, leave, expense, equipment, Windows license, onboarding/offboarding, announcements, family events, and selected Gmail automation workflows.

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

## Phase 1 development

Requires Node.js 22 or newer.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Without Supabase configuration, the sign-in screen shows a setup message and protected routes remain inaccessible. There is no demo user or production auth bypass.

Configure a Supabase project with Google OAuth, apply `supabase/migrations/202609300001_foundation.sql`, and provision a membership **after the employee joins** using trusted SQL/server administration. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `APP_ORIGIN`. Register `${APP_ORIGIN}/auth/callback` in Supabase's redirect allowlist and the Supabase OAuth callback URL in Google. An authenticated Google account alone does not grant application access.

Never use a Supabase service-role key as the publishable key. No service-role key is needed by this app. Membership writes are deliberately unavailable to browser clients and app users, including ADMIN.

```sql
-- Replace with an actual joined employee's auth.users UUID and name.
insert into public.app_memberships (user_id, display_name, roles)
values ('00000000-0000-0000-0000-000000000000', '직원 이름', array['EMPLOYEE']);
```

Grant `PRIVATE_HR_ACCESS` explicitly to CEO and the designated ADMIN through trusted provisioning. A database constraint allows at most one non-CEO ADMIN with this grant. No role automatically receives it. Set `status = 'INACTIVE'` to revoke application access; each new protected request re-reads membership.

### Validation

```sh
npm run lint
npm test
npm run build
npm run typecheck
npx playwright install chromium
npm run test:e2e
```

Browser tests run the production build against an isolated local Supabase HTTP test double; no real employee data or credentials are used. To reuse an installed Chromium binary, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. PostgreSQL constraints and RLS are exercised separately with PGlite.

See [Phase 1 implementation and visual review](docs/PHASE_1.md) for boundaries, screenshots, and setup checks.
