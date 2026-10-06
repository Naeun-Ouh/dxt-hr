# Issue #15 — defer automatic Gmail delivery

Implemented from main `b11f13b` and [Issue #15](https://github.com/Naeun-Ouh/dxt-hr/issues/15), which had no comments at implementation time.

## Current operation

Google OAuth / Supabase Auth login, callback, membership and role checks are unchanged. Gmail send credentials are separate from Google login and are not required.

Family registration still saves private content for its owner and CEO inbox; optional public board publication remains separate. Saving no longer invokes or queues mail, and the UI no longer displays send/pending status. Birthday data encryption, month/day indexing, access controls and editable saved templates remain. The template screen explicitly says automatic delivery is stopped and saving does not send mail.

## Delivery disabled at each entry point

- `vercel.json` has no cron schedule.
- `/api/cron/company-mail` always returns 410 with no-store, even with an old valid bearer secret. It never reads credentials or invokes the worker.
- `runCompanyMail` returns a disabled result before creating a service client or reading Gmail credentials. Its code-level stop cannot be switched on through environment variables.
- Migration `202610060011_defer_automatic_mail.sql` revokes enqueue/claim execution from public, anonymous, authenticated and service roles, including stale workers. The database owner remains a trusted migration administrator.
- Existing delivery rows and function bodies are preserved. No pending work is drained or reset. The service-only finish function remains for reconciling already claimed work; it cannot yield a sendable payload.

The prior verified Auth recipient checks, CEO role enforcement, authorization, RLS, encrypted resignation reasons and private document download protections remain intact. Dormant transport tests use an explicitly re-enabled, isolated test database and fake transport; normal/browser fixtures apply the disabled production grants.

## Rollout

1. Apply all migrations through `202610060011_defer_automatic_mail.sql` before deploying this revision, blocking older workers from making new claims.
2. Deploy the revision without company-mail cron. Check the deployed Vercel project for any old/manual company-mail schedule and remove it; stale requests to the new endpoint receive 410.
3. Do not provision `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_SENDER` or `CRON_SECRET` for current v1. Existing values cannot activate the guarded worker. Retain Supabase Google-provider settings, application origin, encryption keys and the service key needed by the private document proxy.
4. A mail attempt already in flight before shutdown cannot be recalled. Retain delivery history for reconciliation; never blindly reset SENDING/UNKNOWN. Existing PENDING work stays dormant.
5. Future reactivation requires a separately reviewed code change and migration, verified-recipient regressions, explicit handling of historical registrations/backlog, staging verification and a deliberate new schedule. Adding credentials alone is insufficient.

The historical Phase 7 Gmail setup and birthday backfill are not current rollout prerequisites. No live infrastructure or real Gmail messages were used for this change.

## Verification

Lint, 49 unit/database tests, production build, typecheck and 42 browser tests. New regressions cover service-role enqueue/claim denial, preserved private registration, and direct worker/endpoint calls with absent and populated credentials without network access. Existing recipient-integrity, idempotency, ownership/RLS and Google OAuth PKCE browser regressions remain.

Updated screenshots: Phase 7 family board, registration (desktop/mobile), and birthday template show the deferred delivery wording. Existing Figma layout is preserved; Issue #15 supersedes the original automatic-mail copy.
