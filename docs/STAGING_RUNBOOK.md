# Staging Integration Runbook — Supabase + Vercel

This runbook begins after Phase 7 merge. Phase 4 Leave remains deferred.

## Goal

Validate the merged DXT People & Operations application against real Supabase Auth/Postgres/Storage and a real Vercel preview/staging deployment before production use.

## 1. Required projects

Create/connect:

- Supabase staging project
- Vercel staging project connected to `Naeun-Ouh/dxt-hr`

Do not use production data for initial acceptance testing.

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

### Server-only Supabase / worker

- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

`CRON_SECRET` must be at least 32 characters.

### Server-only Gmail

- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`
- `GMAIL_SENDER`

The refresh token must have Gmail send permission and belong to the configured shared company sender or an approved sending alias.

Never prefix any server secret with `NEXT_PUBLIC_`.

## 3. Supabase Auth configuration

Enable Google OAuth.

Configure the deployed application callback in Supabase redirect allowlist:

`${APP_ORIGIN}/auth/callback`

Configure Google OAuth so Supabase's provider callback URL is allowed.

Important:
- Google authentication alone does not grant application access.
- app access still requires trusted `app_memberships` provisioning.
- employee `auth_user_id` must be linked to the intended Supabase Auth user.
- verified `auth.users.email` is the delivery trust boundary for birthday/family automatic mail.

## 4. Database migration order

Apply all files under `supabase/migrations/` in filename order through:

`202610040010_verified_mail_recipients.sql`

Do not cherry-pick only recent migrations.

After migration:
- verify RLS is enabled on protected tables
- verify private Storage buckets/policies
- verify authenticated clients cannot SELECT secret ciphertext tables
- verify service role can perform worker/private-document operations

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

Where useful, combine roles only after single-role boundaries pass.

Each login identity must be:
- an actual Supabase Auth user
- linked to the intended employee record
- provisioned in `app_memberships` by trusted administration

Do not provision through browser forms.

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

Repeat with direct HTTP/API/RPC where practical, not only navigation.

### Team Leader

Verify:
- team project/career read within supported direct-department scope
- no team expense access
- no HR Private access
- no Windows/password reveal

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

## 9. Birthday calendar backfill

After HR encryption configuration and migrations:

`node --import tsx scripts/backfill-birthday-calendar.ts`

Run from a trusted server environment with required server environment variables.

Confirm:
- only month/day index is stored
- count only is logged
- rerun is safe
- stale DOB change fails closed

## 10. Gmail staging acceptance

Do not begin with real employee birthdays/events.

Use dedicated staging test identities.

Verify:

### Birthday
- run after 09:00 KST or controlled staging condition
- birthday employee receives exactly one message
- profile `company_email` modification does not redirect delivery
- verified Auth email is used
- unverified/unlinked user produces no transport claim

### Family event
- CEO only receives the private registration message
- profile email edits cannot redirect CEO mail
- public family board text and private registration text remain separate
- no CC/BCC
- no company-wide email

### Idempotency
- repeated worker execution does not duplicate confirmed delivery
- UNKNOWN/SENDING is not blindly resent

## 11. Vercel cron

The repository config schedules:

`0 0 * * *`

which corresponds to 09:00 Asia/Seoul.

Verify:
- cron calls `/api/cron/company-mail`
- Authorization uses `Bearer <CRON_SECRET>`
- requests without valid secret return 401
- worker errors do not expose recipient/private content

## 12. Acceptance result

Staging is considered ready only after:

- all migrations applied
- real Google Auth login verified
- RLS cross-user tests pass
- real Storage upload/download authorization passes
- real legacy Excel import passes
- encryption key configuration works
- Gmail controlled test passes
- cron authentication passes
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

Leave remains deferred until the existing DXT leave process is intentionally replaced.
