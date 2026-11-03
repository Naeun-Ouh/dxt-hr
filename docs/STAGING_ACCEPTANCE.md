# Issue #14 — Staging acceptance record

## Preparation baseline — 2026-10-26

- Source: latest fetched main `41b63c8` (includes Phase 4A merge and portability principles).
- Preparation branch: `codex/issue-14-staging-preparation`.
- Product runtime, Google OAuth code, SQL migrations and mail shutdown behavior are unchanged by this preparation.
- Local preview: `http://localhost:3100/leave`; test backend: `http://localhost:54329`.
- Both services bind to loopback. The existing `tests/e2e/mock-supabase.ts` uses synthetic data and an in-memory PGlite database with repository migrations. Restarting the backend resets test data.
- The preview's Google-labelled button uses the existing fixture PKCE callback to sign in as a synthetic employee. It does not contact Google and is not live OAuth verification. No real credentials were provisioned; fixture keys were supplied only to the process environment.
- The fixture leave date is pinned to 2026-10-06 for repeatable tests, while record timestamps reflect the machine clock. Do not use this preview as a live date-policy acceptance result.
- No `.env.local` or local Vercel project link was present. The connected Vercel account returned no DXT project and no teams. No Supabase project connection has been established in this task.

## Local evidence (not staging acceptance)

| Check | Result | Evidence |
|---|---|---|
| Login shell -> fixture callback -> home | PASS | Browser displayed signed-in employee home |
| Leave UI -> local query/RLS -> rendered ledger | PASS | Browser displayed 15-day synthetic opening balance and adjustment ledger |
| Retired endpoint, no Authorization | PASS | HTTP 410, disabled JSON, Cache-Control includes no-store |
| Retired endpoint, synthetic stale Authorization | PASS | Same HTTP 410 disabled response |
| Repository cron schedule | PASS | `vercel.json` is `{}` |
| Automatic-mail regression tests | PASS | `node --import tsx --test tests/deferred-mail.test.ts`: 2 passed; role grants and no-network worker/endpoint covered |
| Lint | PASS | `npm run lint` |

The full Phase 4A suite previously passed at PR #17: 54 unit/database and 47 browser tests. Those are historical results; the dated resume section below records this preparation run separately. No local test result is a real staging result.

## Live environment record

Fill project identifiers and sanitized evidence only. Do not put secrets, cookies, signed URLs or real HR records in this file.

- Supabase staging project: **PENDING — project selection/access**
- Vercel staging project: **PENDING — project selection/access**
- Deployment URL and commit: **PENDING**
- Migration history through `202610060012_basic_leave.sql`: **PENDING**
- Google provider callback and application redirect allowlist: **PENDING**
- Separate HR/Vault keyrings and server-only private-document service key: **PENDING**
- Test accounts, employee/Auth links and direct-department mapping: **PENDING**
- Verified test opening leave balances: **PENDING**

| Acceptance group | Status | Evidence required |
|---|---|---|
| Real Google login, membership, revoked/inactive sessions | PENDING | Role and sanitized observed outcome |
| Migrations, RLS and direct cross-user RPC denials | PENDING | Migration range and negative results |
| Expense receipts and CEO-only resignation documents | PENDING | Real Storage upload/download and cross-user denial |
| HR/Vault encryption, explicit reveal and audit | PENDING | Authorized/unauthorized outcomes without secret values |
| Employee/project/expense/assets/company operations | PENDING | Runbook section 8 outcomes, including real legacy workbook |
| Basic leave, bulk rollback, stale/concurrent changes, cancellation reversal | PENDING | Role, request scenario and ledger outcome |
| Calendar response privacy and specialist isolation | PENDING | Sanitized response field list and denial results |
| No automatic mail or scheduler | PENDING | Deployed 410 result, revoked enqueue/claim grants, scheduler inventory |
| Export/restore and key recovery | PENDING | PostgreSQL restore rehearsal, object manifest, identity mapping and key custody plan |
| Production readiness | PENDING | All live acceptance groups complete; no production migration yet |

## Next execution order

1. Identify dedicated staging projects and establish authorized access. Do not assume an arbitrary existing project is staging.
2. Configure Google provider, staging origin and private server configuration outside source control.
3. Apply versioned migrations in order, verify grants/Storage policies, and provision synthetic test identities through trusted administration.
4. Deploy the tested revision and run `STAGING_RUNBOOK.md`, recording actual results above.
5. Fix any defects in focused changes; defer Phase 4B until basic leave is stable.

The historical Gmail-send/cron items in Issue #14 are superseded by Issue #15 and the current runbook. They must not be reactivated to satisfy the older issue text.

## Resume preflight — 2026-11-03

- Preserved all four prior uncommitted preparation files; no runtime or schema change.
- Fetched main: still `41b63c8eec3c659bbcf99159efa2dcd3f093e220`.
- Issue #14 has no comments. Latest Issue #4 comment confirms Phase 4A merged and requires real staging verification before Phase 4B.
- Connected Vercel account: unfiltered project list and team list both empty. This establishes no accessible project in that connection, not that no project exists under another account.
- No Supabase connector is available in this session; no Supabase CLI, project configuration or populated local environment file was found. Supabase account inventory is **UNVERIFIED**, not assumed empty.
- No local Vercel CLI/project link was found. No new project, deployment, remote migration, credential, role grant or real data was created/changed.
- Prior localhost processes are no longer listening; the 2026-10-26 preview evidence above is historical.
- **Live acceptance is BLOCKED on project selection/access, OAuth configuration and dedicated test identities.** All live rows remain PENDING. See the account-owner steps in `STAGING_RUNBOOK.md`.
- This preparation PR must not close Issue #14 or claim production readiness.

### Local regression run — 2026-11-03

- `npm run lint`: PASS.
- Initial `npm test` on bundled Node 24.22.1: interrupted by a native V8/WASM `Check failed: end > addr` crash in the operations test process; no application assertion was reported for that process.
- `node --import tsx --test --test-concurrency=1 tests/*.test.ts`: **54 passed**, including leave, authorization and mail-shutdown regressions. No test or product code was changed to obtain the pass.
- `npm run build` and `npm run typecheck`: PASS.
- Full `npm run test:e2e` with installed Chrome: **47 passed**, including fixture PKCE login, private Storage test-double flows, scoped leave decisions and disabled cron behavior.
- Browser fixtures executed real repository SQL/RLS in local PGlite, not hosted Supabase Auth/Storage. Test-generated screenshot changes were discarded because this PR changes documentation only.
