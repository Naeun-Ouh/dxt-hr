# Issue 32 — 재직증명서

## Scope / reconciled product direction

Issue 35 supersedes Issue 32's proposed separate stamp system: reuse immutable
`company_seal`, normalization (PNG / 1 MiB / stripped metadata), private storage
adapter and Korean PDF font/renderer. No duplicate stamp records or permissions.
`HR_CERTIFICATE_MANAGE` is separately checked at every certificate review/settings
boundary (ADMIN/CEO). It never tests `EMPLOYMENT_CONTRACT_MANAGE` to approve a
certificate, and never grants raw stamp access. Existing stamp management remains
ADMIN/CEO via its existing permission. Ordinary ADMIN certificate access is explicit
Issue 32 operational scope; it does not grant PRIVATE_HR_ACCESS or private contracts.
Team Leaders retain employee self-service but cannot read/review another person's
certificate. Birthdate, resident ID, salary and bank information are omitted.

## Routes / compact workspace

- `/certificates/me`: own requests, compact request modal, cancellation before approval,
  issued download and timestamps/hash.
- Own employee profile includes a certificate entry point.
- `/admin/certificates`: request grid, status/date/name/purpose local filters, small
  counters, approval/rejection modal, PDF metadata, approved-issue retry and settings.
- `/api/certificates/[id]/pdf`: current server authorization, RLS, integrity check,
  append-only download event, private/no-store response.
- Existing `/admin/contracts/seals` is reused for stamp management. Setting optional
  company address/registration number neither invents facts nor changes old snapshots.
  Company/representative names come from the configured active stamp. Approval fails
  until an active ready stamp exists. No automatic email or cron.

## Migration / lifecycle

Apply `20261124220945_employment_certificates.sql` after existing migrations. No
applied migration or existing record is edited. Tables: `hr_certificate`,
`hr_certificate_event`, `hr_certificate_setting`; private bucket `hr-certificates`.

REQUESTED -> APPROVED -> ISSUED, or REQUESTED -> REJECTED / CANCELLED.
Requests derive employee identity from auth.uid() and active Employee Master linkage.
UUID request keys provide retry idempotency. Approval serializes on the request and
existing seal lock; it freezes authoritative name/department/title/hire date/status,
purpose, company/representative/address/registration and active seal ID. Only active
employees whose hire date is not in the future may be certified. Approval date in
Asia/Seoul is the document's issue basis; actual PDF storage completion time is
separately recorded by DB. Cancel is own-only and before approval; rejection needs a
reason. Approved snapshot and terminal records are immutable, audit append-only.

PDF rendering runs on the server, consumes only the frozen snapshot and immutable
seal version, embeds the stamp, uploads without upsert, computes SHA-256 and finishes
through service-only RPC. Approval/issue replay cannot duplicate events or replace
an issued artifact. If storage/render fails, APPROVED remains recoverable through
explicit HR retry; no new policy or background queue is required.

## Security / portability

Authenticated users have SELECT plus checked RPC execution, no direct table mutation.
RLS independently enforces own-or-explicit-HR scope. Team/specialist roles gain no
broader scope, client employee_id/role is not accepted for requesting. Even managers
cannot access either bucket directly. Service credential is confined to existing
server-only adapter; logical paths/digests, never permanent URLs, are stored. No
certificate content or stamp bytes are written to logs/audit. Domain transactions
remain standard PostgreSQL and rendering uses existing portable pdf-lib/fontkit.

## Verification / limitations

Focused unit/DB tests cover auth-derived owner, cross-user/Team Leader/role denial,
forged owner/direct writes/storage rejection, approval snapshot and stamp replacement,
PDF image/hash, immutable completion, idempotent request/review/issue/cancel, audit and
rejection without PDF. Browser tests exercise real Next UI/actions/routes against
PGlite RLS with mocked Auth/PostgREST/Storage; these are not hosted Supabase acceptance.
Screenshots use synthetic names, company settings and TEST stamp.

A failed/concurrent upload can leave an unreferenced private object; it never becomes
an accessible issued PDF or overwrites prior content. No automatic purge is added.
Operator reconciliation should remove only reviewed orphan objects. A full production
export must include DB rows, both private buckets and identity links. Employment
certification policy beyond this requested simple flow (e.g. former-employee service,
English issuance, external verification portal) remains out of scope.

Local lint/typecheck and all 93 unit/DB tests passed. Full production build/browser
verification runs in GitHub CI because the host Mac exhausted disk space during the
preceding PR34 browser run. Do not interpret local HTTP doubles as hosted acceptance.
CI browser evidence includes employee request, HR review and issued-document screens.

After local disk space recovered, production build/typecheck and both certificate
browser flows passed. The integration test exposed an incorrect default `id` ordering
for the singleton settings table; the screen now explicitly orders by `singleton`.
Employee request, HR review and issued-detail screenshots are committed alongside the
synthetic PDF example. Full CI is rerun on the corrected HEAD.

Final cross-platform regression uses the OS temporary directory for synthetic PDF
output and deactivates only the test-created active seal in cleanup. This preserves
the existing contract test's no-seal starting state. The combined certificate,
contract and company-seal browser suite passed all eight scenarios locally.

## PR #36 integration review — 2026-11-25

Rebased onto main `4d13df5bcb7bb7e344be003a7e130771582b4cfa`, retaining HR document
card tabs/guards, private capabilities, storage mock and both delivery documents.
The certificate migration follows both HR document migrations in filename order.

Generated PDF bytes are limited to **4 MiB (4,194,304 bytes)** before upload or
completion. Oversize generation leaves the approved snapshot recoverable and returns
an explicit error. Authorized downloads check Blob size before buffering and actual
byte length before returning; an oversized historical artifact returns a private,
no-store HTTP 413 without its PDF body. The existing bucket limit is not relied on as
the hosted response boundary. No applied migration was edited.

Missing active company seal is explicitly displayed in the review workspace; approval
is disabled until configured and the RPC independently rejects it. Settings show
company/representative as 미설정, and optional address/registration as omitted, without
invented company facts. Boundary tests cover exactly 4 MiB and one byte over; browser
coverage checks missing settings, blocked approval and the generated artifact size.
