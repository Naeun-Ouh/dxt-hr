# Staging Integration Runbook — Supabase + Vercel

Current scope: Phases 1–7 including Phase 4A basic leave, after Issue #15 automatic-mail cleanup. Phase 4B advanced leave remains deferred.

Issue #14 originally listed Gmail sending and cron acceptance. This runbook supersedes those historical items: Google OAuth remains required; automatic birthday/family-event delivery and scheduled cron remain disabled. Follow `docs/PORTABILITY.md` when configuring providers.

## Goal

Validate the merged DXT People & Operations application against real Supabase Auth/Postgres/Storage and a real Vercel preview/staging deployment before production use.

## 1. Required projects

Create/connect:

- Supabase staging project
- Vercel staging project connected to `Naeun-Ouh/dxt-hr`

Do not use production data for initial acceptance testing.

### Account-owner steps if no staging projects are connected

1. In the [Supabase dashboard](https://supabase.com/dashboard), select the intended organization and create a separate `dxt-hr-staging` project (suggested name). Choose region/plan deliberately and store the database password in your password manager. If a staging project already exists, supply its dashboard URL instead; do not duplicate it.
2. In [Vercel](https://vercel.com/new), use the intended account/team and import `Naeun-Ouh/dxt-hr` into a separate staging project. Authorize the GitHub repository connection when prompted. The repository root contains `package.json`; use Next.js and Node 22 as in CI. Do not connect production database credentials.
3. Establish access for the working session: connect the correct Vercel account/team and provide the Supabase dashboard/project reference and Vercel project URL. These identifiers are sufficient in chat. Enter private credentials directly into provider settings or a gitignored local environment file; never paste them into chat or commit them.
4. An authorized Google Cloud owner creates/selects the staging web OAuth client, configures the consent audience/test users, and enters its client ID/secret in Supabase's Google provider settings. Use the **Supabase provider callback URL** shown there as Google's authorized redirect URI. The application's `${APP_ORIGIN}/auth/callback` is separately allowed in Supabase. Request only login scopes, never Gmail send access.
5. Make dedicated Google test identities available for the real sign-in checks. Human sign-in, consent, account creation terms and any billing choices remain with the account owner.

Once those account steps are complete, the agent can check environment variable names, apply repository migrations to the confirmed staging target, verify private bucket policies, prepare trusted membership/employee mappings, deploy, and execute the acceptance record. Do not substitute the local Auth fixture for the real sign-in step.

Configuration references: [Supabase project setup](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs), [Google OAuth setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [Vercel import/setup](https://vercel.com/docs/getting-started-with-vercel).

## 2. Environment variables

### Browser-safe

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `APP_ORIGIN`

`APP_ORIGIN` must equal the exact deployed staging origin.

### Server-only HR encryption

- `HR_ENCRYPTION_ACTIVE_KEY`
- `HR_ENCRYPTION_KEYS`

Format:
- active key = key ID
- keys = JSON map of key ID -> base64 random 32-byte AES key

Generate keys outside source control, e.g.:
`openssl rand -base64 32`

### Server-only vault encryption

- `VAULT_ENCRYPTION_ACTIVE_KEY`
- `VAULT_ENCRYPTION_KEYS`

Use a separate keyring from HR encryption.

### Server-only private document access

- `SUPABASE_SERVICE_ROLE_KEY` — required by the protected resignation-document proxy; never use it as the browser publishable key.

### Explicitly inactive

Do not provision `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_SENDER` or `CRON_SECRET` for active v1. They are unrelated to Supabase's Google login provider. Do not re-enable enqueue/claim permissions or any mail scheduler.

Never prefix any server secret with `NEXT_PUBLIC_`. Keep actual secrets outside Git and chat. Use separate staging HR and Vault keys, distinct from production. Record key IDs and recovery ownership, never key values, in acceptance evidence.

## 3. Supabase Auth configuration

Enable Google OAuth.

Configure the deployed application callback in Supabase redirect allowlist:

`${APP_ORIGIN}/auth/callback`

Configure Google OAuth so Supabase's provider callback URL is allowed.

Important:
- Google authentication alone does not grant application access.
- app access still requires trusted `app_memberships` provisioning.
- employee `auth_user_id` must be linked to the intended Supabase Auth user.
- Google OAuth sign-in is tested with dedicated staging identities, not the local fixture Auth service.
- allowlist `http://localhost:3100/auth/callback` only if this local app is intentionally connected to staging; set its local `APP_ORIGIN` accordingly.

## 4. Database migration order

Apply all files under `supabase/migrations/` in filename order through:

`202610060012_basic_leave.sql`

Do not cherry-pick only recent migrations.

After migration:
- verify RLS is enabled on protected tables
- verify private Storage buckets/policies
- verify authenticated clients cannot SELECT secret ciphertext tables
- verify service role can perform authorized private-document operations
- verify migration 011 denies mail enqueue/claim to service, authenticated and anonymous roles
- verify migration 012 installs leave account/request/ledger/history RLS and checked RPCs

## 5. Storage acceptance

Verify:

### Expense evidence
- bucket remains private
- Employee A can retrieve own receipt through application proxy
- Employee A cannot retrieve Employee B receipt
- Team Leader does not gain team expense receipt access
- Expense Admin can review according to expense capability

### Resignation letters
- bucket remains private
- browser role has no direct Storage SELECT, including CEO
- CEO can download only through the authorized API proxy
- Admin/Private-HR designated admin cannot download
- replay after role revocation fails

## 6. Test identities

Create at least these isolated staging identities:

1. ordinary EMPLOYEE A
2. ordinary EMPLOYEE B
3. TEAM_LEADER
4. EXPENSE_ADMIN
5. IT_ADMIN
6. ADMIN
7. CEO
8. an employee in a different direct department
9. designated ADMIN with PRIVATE_HR_ACCESS (test separately from ordinary ADMIN)

Where useful, combine roles only after single-role boundaries pass.

Each login identity must be:
- an actual Supabase Auth user
- linked to the intended employee record
- provisioned in `app_memberships` by trusted administration

Do not provision through browser forms. Put Employee A/B and their Team Leader in the same non-null direct department; use a different department for the out-of-team identity. Use only synthetic employee profiles and confirmed test opening leave balances.

## 7. Mandatory authorization acceptance

### Employee isolation

Using Employee A:

- manually enter Employee B expense URL -> denied
- manipulate expense UUID -> denied
- direct receipt API for Employee B -> denied
- direct Storage URL -> denied
- Employee B asset URL -> denied
- Employee B restricted career -> denied except explicitly permitted team policy
- private HR URL/API -> denied
- offboarding/resignation document -> denied
- Employee B leave request/reason, balance and ledger by URL/UUID/RPC -> denied
- team calendar JSON/HTML/RSC contains only approved name/date/unit presence, never peer reasons

Repeat with direct HTTP/API/RPC where practical, not only navigation.

### Team Leader

Verify:
- team project/career read within supported direct-department scope
- no team expense access
- no HR Private access
- no Windows/password reveal
- own direct-team leave approval/rejection/cancellation only; no peer balance/ledger access
- a forged or out-of-team ID rejects the entire bulk operation
- role/session changes invalidate previously opened actions

### Specialist roles

EXPENSE_ADMIN:
- all expense administration
- no Windows/password reveal
- no HR Private

IT_ADMIN:
- asset/Windows/account management
- Windows/password reveal
- no all-company expense access
- no HR Private

ADMIN:
- operational admin
- no resignation reason/document
- no key/password reveal unless explicit grant
- HR Private only if designated explicit grant

CEO:
- global operational access
- HR Private
- resignation reason/document
- secret reveal only where explicitly granted, except documented role-native capabilities

## 8. Functional staging acceptance

### Employees / organization
- create/update employee
- multi-role domain assignments
- active/inactive behavior
- HR Private encryption/reveal

### Projects / career
- project CRUD
- assignment CRUD
- overlapping resource coverage
- extension history
- own career editing
- Team Leader team-career read only

### Expense
- direct entry
- private receipt
- duplicate warning
- overtime warning
- dining cumulative attendee allowance
- payment lock
- admin export
- actual legacy workbook import using:
  `2024_DXT지출결의서_00월_홍길동_NEW.xlsx`
- verify SAMPLE rows never import
- verify fuel/toll totals = one-way amount × count

### Assets / secrets
- asset create/transfer/return
- holder history
- employee own equipment only
- Windows/account values remain masked in initial payload
- reveal works only for authorized role
- audit row created without secret value

### Operations
- onboarding multi-owner task
- offboarding completion with unreturned asset warning
- employee remains INACTIVE
- CEO-only resignation reason/document
- announcement draft/publish
- family registration remains private
- optional family board publication remains separate

### Phase 4A basic leave
- import a synthetic opening entitlement with mandatory Admin reason; new accounts start at zero
- own annual balance, ledger and request/history are consistent
- FULL_DAY / AM_HALF / PM_HALF; same-day and future requests
- past dates require “미리 신청하지 못한 사유”
- employee pending request -> Team Leader approve/reject; rejected requests require a new submission
- Team Leader own request auto-approves with normal ledger/history
- atomic bulk approve/reject; stale/duplicate/forged selection fails without partial writes
- insufficient balance fails at submission and approval
- simultaneous approval attempts deduct once; concurrently approving two requests cannot overdraw
- employee cannot cancel approved leave; Team Leader/Admin cancellation reverses once in the original year
- manual +/- adjustment requires reason and current account version
- team calendar never returns peer reason, request ID or employee ID

Annual accrual remains Admin-managed pending explicit boundary policy. Do not introduce automatic entitlement, carryover, substitute/birthday leave or holiday automation during staging. See `PHASE_4A_DELIVERY.md`.

## 9. Birthday data preservation

Check encrypted birthday editing and access boundaries. The existing `scripts/backfill-birthday-calendar.ts` is retained for a separately planned historical data migration, not a prerequisite for active v1 or a reason to enable mail. Do not run a production backfill during initial staging acceptance.

## 10. Automatic-mail shutdown acceptance

- Family registration saves privately; CEO inbox and optional public board remain separate.
- Birthday templates can be saved with disabled-delivery wording; saving never sends mail.
- `runCompanyMail` returns disabled before credentials, service client or network access.
- Migration 011 blocks enqueue/claim even with service-role credentials. Inspect grants; never reactivate functions to test a live send.
- Existing queue/history is retained. Do not drain, reset or retry historical PENDING/SENDING/UNKNOWN records.
- No real Gmail message is sent as part of staging acceptance.

The historical recipient verification and encryption protections remain intact. Refer to `ISSUE_15_DELIVERY.md` for future reactivation requirements.

## 11. No active cron dependency

`vercel.json` contains no cron schedule. Check the selected staging project's scheduler settings and any external scheduler for stale company-mail jobs; disable/remove only those identified jobs.

Verify `/api/cron/company-mail` returns HTTP **410**, `Cache-Control: no-store` and a disabled response both without authorization and with a synthetic stale bearer value. It must not read credentials or invoke the worker. Do not expect 401 or a successful mail run.

## 12. Acceptance result

Staging is considered ready only after:

- all migrations applied
- real Google Auth login verified
- RLS cross-user tests pass
- real Storage upload/download authorization passes
- real legacy Excel import passes
- encryption key configuration works
- basic leave with real Auth/department mappings and test opening balances passes
- mail enqueue/claim is denied and the retired endpoint returns 410
- no company-mail cron is active
- no server secrets appear in browser responses
- production build is green

## 13. Production gate

Do not move production employee records/secrets until staging acceptance is complete.

Before production:
- separate production Supabase project
- separate production encryption keys
- separate production Vercel secrets
- verified company Google identities
- backup/key-recovery procedure documented
- production membership provisioning list reviewed

Do not replace the existing leave process until Phase 4A staging acceptance and opening-balance reconciliation pass. Phase 4B follows stability of the basic workflow.

## 14. Evidence and portability

Record commit SHA, migration range, staging project identifiers, deployment URL, test date, role, expected/actual result and sanitized evidence. Use `STAGING_ACCEPTANCE.md`; mark unexecuted items PENDING rather than passed. Never record secrets, real private HR data or session cookies.

Document an export/recovery path before production: standard PostgreSQL schema/data backup and restore rehearsal, Storage object export with logical path manifest, Auth-to-employee mapping, and separately secured HR/Vault key recovery. Keep signed URLs out of domain data. Provider dashboards must not be the only source of migrations or policy; no new provider-specific domain logic is needed for this preparation.
