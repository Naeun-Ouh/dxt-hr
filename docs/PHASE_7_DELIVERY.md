# Phase 7 delivery — Issue #7

> **Current v1 scope (Issue #15):** automatic birthday/family-event Gmail delivery is deferred. Google OAuth login remains unchanged. The mail descriptions below document the original implementation, not current deployment requirements. Follow [Issue #15 rollout](ISSUE_15_DELIVERY.md); do not configure Gmail credentials or the historical cron.


Implemented from latest main (`12a3f40`) and the [latest Issue #7 comment](https://github.com/Naeun-Ouh/dxt-hr/issues/7#issuecomment-5932954835). Read `AGENTS.md`, Phase 7 context and all required product, business, permissions, data, routes, UI, principles and roadmap documents before implementation.

## Workflows and routes

- `/admin/onboarding`, `/new`, `/[id]`: existing employee selection; eight DXT tasks; manual state, multiple owners, memo, optimistic version checks and retained history. No account provisioning or completion-percentage dashboard.
- `/admin/offboarding`, `/new`, `/[id]`: resignation date, letter-received indication, unused-leave check, external settlement checklist and retained INACTIVE transition. Assigned equipment is linked as context and never blocks departure. External accounts are unchanged.
- `/announcements`, `/new`, `/[id]`, `/[id]/edit`: Admin/CEO drafts, explicit publication/unpublication and safe plain-text reading by employees. No read receipts, pins or announcement email.
- `/family-events`, `/new`, `/[id]/edit`: employee-owned private registration, CEO alert status and separately authored optional company-board post. The private text is never copied to the public form. Editing a registration does not send a second initial alert or silently change its published post.
- `/family-events/review`, `/review/[id]`: CEO-only operational registration inbox. ADMIN/private-HR grants do not confer this access.
- `/admin/settings/birthday-email`: versioned yearly subject/body and synthetic preview; only `{{name}}` and `{{birthday}}` (month-day) variables.
- `/api/offboarding/documents/[id]`: audited, CEO-authorized per-request attachment proxy.
- `/api/cron/company-mail`: authenticated server-only Gmail worker; no recipient details in its response.

## Schema and isolation

Migration `202610010008_operations.sql` adds cases, tasks, many-owner assignments, status history, encrypted resignation reason, private document metadata, announcements, separate private registrations/public posts, yearly birthday templates, restricted month/day calendar and delivery metadata.

Every domain table has RLS. Authenticated writes use checked RPCs; hidden controls and route guards are additional protections. CEO-only reason access does not follow PRIVATE_HR_ACCESS. Reason plaintext is encrypted with the existing HR keyring and case-bound authenticated encryption. Audit rows contain action/IDs, never reason, file or email contents.

The `resignation-letters` bucket is private, PDF/PNG/JPEG only, maximum 10 MiB. CEO uploads reserve a path, upload without upsert, then finalize after object metadata verification. Browser roles, including CEO, have **no Storage SELECT policy**, so cannot create reusable signed download URLs. The API checks the current user's capability, ready document row and audit RPC before a server-only service-role download; responses use `private, no-store`, attachment disposition and `nosniff`.

Onboarding/offboarding are limited to Admin/CEO. Employee, leader, division, expense and IT roles cannot browse operational case details. Family registration ownership comes from the authenticated employee linkage, never a submitted employee ID. Private registration read is owner/CEO only. Birthday configuration is Admin/CEO only; authenticated users cannot read the scheduler calendar or delivery table or invoke worker RPCs.

## Mail behavior and deployment

Automatic mail is limited to birthday employees and active linked CEO recipients for initial family registrations. The Gmail adapter uses the shared account's OAuth refresh token and Gmail `users.messages.send`, with one To recipient, no CC/BCC and plain UTF-8 content. Tests use an injected fake transport and send no real email.

`vercel.json` schedules `0 0 * * *` (00:00 UTC / 09:00 Asia/Seoul). The SQL worker checks local date/time again and excludes inactive/future-join employees. Birthday records are unique per employee/year, including DOB corrections. Missing yearly templates cause no birthday mail. February 29 is matched literally; no unapproved alternate-date policy is introduced.

Family registration attempts dispatch immediately. Missing configuration or pre-claim OAuth failure leaves durable pending work for the scheduled worker or an authenticated operator rerun. Only initial registration queues an alert. CEO recipients are resolved from active authorization memberships linked to active employees and their verified Auth email addresses; no arbitrary role in an employee profile grants delivery access.

SQL atomically claims pending deliveries using row locks and `SKIP LOCKED`. The claim is committed before the Gmail call. A confirmed Gmail message ID produces SENT; provider rejection/timeout/ambiguous result produces UNKNOWN. If the process dies after claiming, it remains SENDING. Neither state is automatically re-sent. This deliberately provides **at most one automatic send attempt**, not a false exactly-once delivery guarantee. Before any manual recovery, inspect the shared Gmail Sent mailbox using the delivery's stable Message-ID and reconcile the metadata; never blindly reset SENDING/UNKNOWN. Delivery rows retain only IDs/date/state/timestamps/provider ID and a generic error code.

Each invocation drains pending work until empty or a 240-second work budget; a budget exhaustion returns a generic 503 and leaves unclaimed rows pending. Authenticated operator continuation is safe for those rows, on the same birthday date after 09:00. Production monitoring should alert on non-2xx and unresolved delivery states; Vercel scheduling itself is not an exactly-at-the-second guarantee or an automatic retry policy.

### Deployment order

1. Apply all migrations through `202610040010_verified_mail_recipients.sql` to staging. Confirm service-role access to existing protected employee fields and private Storage using the actual Supabase project.
2. Keep existing server HR encryption variables, and configure server-only `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` (at least 32 characters), `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, and `GMAIL_SENDER`. Use a refresh token authorized for the configured shared Gmail account and `https://www.googleapis.com/auth/gmail.send`; sender must be that account or an approved sending alias. Never put these in NEXT_PUBLIC variables or commit values.
3. Backfill existing encrypted DOBs once in a trusted server environment: `node --import tsx scripts/backfill-birthday-calendar.ts`. This reads/decrypts existing birth dates only in that process, writes month/day through a service-only compare-and-lock RPC, and logs a count only. It is rerunnable. An intervening DOB edit fails the affected write rather than storing a stale date.
4. New employee saves update encrypted DOB and month/day atomically through `save_employee_with_birthday`. The old authenticated RPC is revoked; any direct legacy encrypted DOB mutation invalidates the calendar and fails closed until backfill. Clearing DOB clears the index.
5. Save the intended yearly template; verify linked birthday employee and CEO recipients. Enable the production schedule only with the intended environment and recipients. Run a controlled staging Gmail/Storage acceptance test before real delivery, including role revocation on an already-open download screen.

Live Supabase Storage/Gmail delivery has **not** been performed in this development environment. Those credentialed integration checks remain rollout work; local/CI checks exercise the real SQL schema/RLS through PGlite and a Supabase HTTP test adapter.

## Figma and evidence

Compared Figma 26 (`38:2`), 27 (`38:251`), 28 (`38:459`), 29 (`38:588`), 35 (`43:221`), 36 (`43:361`) against rendered browser screens. Reused the existing app shell, icon assets, indigo notices, table/form tokens and responsive layout. Maintained the 740/340 family form columns and 720/360 birthday editor/preview proportions. Added real record selection, lifecycle/history, yearly selection and error controls where the static designs need working behavior. The existing shell avoids the Figma header/content overlap. Family registration wording and separate publication follow the latest issue's privacy requirement.

Evidence in `docs/screenshots/phase7-*.png`: onboarding, offboarding, announcements, family board, family registration, birthday editor and 390px family registration.

## Verification

Local validation passed: `npm run lint`, `npm test` (47 unit/database tests), `npm run build`, `npm run typecheck`, `npm run test:e2e` (42 browser tests).

Coverage includes SQL capability/ownership failures, optimistic concurrency and lifecycle history, INACTIVE with outstanding equipment, CEO-only reason and private Storage, private/public family separation, draft publication, yearly templates, minimum DOB indexing and atomic invalidation, 09:00 timing, individual/CEO-only mail addressing, duplicate and concurrent execution, ambiguous sends, secured cron, forged IDs, unauthorized HTML/RSC/API payloads, file upload/download and replayed actions after a role change. All browser tests run against a production Next.js build.

Phase 4 leave remains deferred. No leave ledger, fake leave record, resignation approval or external SaaS provisioning/disable was added.

## 2026-10-04 pre-merge security correction

Review reproduced an indirect disclosure: an operational Admin could change the CEO employee profile's company email and redirect private family notifications, despite having no family registration read capability. Migration `202610040009_verified_ceo_mail.sql` makes family-mail delivery use the linked CEO's `auth.users.email`, with non-null `email_confirmed_at`, in addition to current active CEO membership and employee checks. It never falls back to the editable profile address. An unverified or ineligible recipient is cancelled before a claim exposes the message to transport. This initial correction was extended to birthday delivery by migration `202610040010_verified_mail_recipients.sql` below.

A regression test changes the CEO profile address through the actual Admin employee RPC, confirms Auth records cannot be changed by that role, and verifies the alert still targets the verified CEO identity. A second case removes email verification and confirms that no message can be claimed. No real email is sent.

Staging must use the intended verified company identity for CEO authorization, and retain secure email-change confirmation in Supabase Auth. See [Supabase email update documentation](https://supabase.com/docs/reference/javascript/auth-updateuser). If an unverified-recipient delivery is cancelled, it requires deliberate operational reconciliation after correcting identity setup.

## Blocking review correction — verified birthday recipients

[Review comment](https://github.com/Naeun-Ouh/dxt-hr/pull/13#issuecomment-5980223630) identified the same redirection risk in birthday mail. Migration `202610040010_verified_mail_recipients.sql` makes **both automatic mail types** resolve the recipient address from the employee's linked `auth.users.email`, requiring a non-empty address, non-null `email_confirmed_at`, active application membership and active, already-joined employee. Family alerts additionally require the current CEO role. The verified address is resolved once and used directly in the transport payload. Admin-editable `employee.company_email` is not a delivery trust boundary and is never a fallback.

A pending delivery with an unlinked, unverified, empty-address or inactive identity is marked CANCELLED with `RECIPIENT_NO_LONGER_ELIGIBLE` before any payload or claim token is returned. Correct identity provisioning and deliberately reconcile cancelled work before recovery; automatic reruns do not revive cancelled deliveries.

Regression tests first reproduced the failure on the reviewed head. They change the birthday profile email to `attacker@example.test` through the real Admin RPC, attempt forged Auth/link fields, verify Auth records remain protected, and inspect fake transport messages for the verified employee and CEO addresses. Separate cases revoke verification/linkage/membership or employee eligibility after enqueue and prove no transport payload or message is produced. Existing family-event routing regressions remain covered. No UI changed and no real email was sent.
