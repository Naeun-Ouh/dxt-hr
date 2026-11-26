# Performance and operational readiness — Issue #35

## Bounded optimization

`operationDetail` formerly read task owners separately for every checklist task. Eight
onboarding tasks therefore needed eight owner requests after task/history retrieval. It now
requests owners for up to 64 already-authorized task IDs at once, with 500-row pages and a
stable `(task_id, employee_id)` order. The ordinary eight-task fixture needs one owner request.
Large owner sets remain complete; errors abort rather than returning a partial success.
There is no new service-role read, cross-request cache or expanded scope.

Announcement and private family-registration detail reads now filter by exact ID at the
database boundary instead of fetching an entire collection. Own family detail also retains
an explicit employee filter, even for users with additive reviewer privileges. Existing
RLS and server capabilities remain in force. Shared paged reads add ID as the tie-breaker
when the selected row has an ID, so equal timestamps/dates have stable order. Offset pages
are not a transaction snapshot: concurrent inserts still require refresh for a coherent
business review, and all writes must recheck revisions independently.

`operation-owner-pages.test.ts` verifies request-count reduction, bounded URLs, duplicate
task IDs, empty scope, 700 owners over page/batch boundaries and error propagation. Existing
operations/domain browser security regressions remain required. These are deterministic
query-count improvements, **not a claim of measured hosted latency or production capacity**.

## Staging acceptance record

GPT reported PR #36/#37/#38 merged and certificate/holiday migrations applied in Issue #35
comment 7178153883. Metadata checks do not replace actual Google-user sessions. Before
activating the pending slices, record exact app SHA, ordered migrations, environment and
date with synthetic A/B/Team Leader/ordinary Admin/designated Admin/CEO sessions. Verify:

- Login and current employment/membership revocation; no cached authorization across users.
- Own/cross-user leave, asset, expense, contract, HR-document and certificate paths/RPCs.
- Private file uploads/downloads and immutable completed artifacts; no permanent object URL.
- Correct date-usable versus historical leave balances and expiry/reversal boundaries.
- Explicit lifecycle completion retaining history and unreturned-asset policy.
- Migration mapping/review cannot invoke bulk writes or disclose source contents to logs.

Use `STAGING_RUNBOOK.md` and `STAGING_ACCEPTANCE.md` for environment steps and record results
as hosted or mock explicitly. Do not seed real personnel as synthetic tests.

## Measurement before further optimization

Capture synthetic staging route/action duration distributions, query counts and response
sizes separately for employee and administrative views. Record cold/warm runtime and dataset
size with the exact SHA. Use database `EXPLAIN (ANALYZE, BUFFERS)` only for scoped read queries
on approved synthetic data; review existing indexes before adding any. Check long history,
many owners and multi-source leave. Do not log names, reasons, salaries, signatures, source
workbooks, file contents, auth headers or keys. No speculative global cache, permissions
memoization across requests or production-wide indexing is introduced.

## Release / recovery

1. Verify each dependency's exact HEAD/CI and migration order, then take an approved export
   of DB/schema, private objects, Auth↔employee mappings and separately protected encryption
   key recovery material. Never attach these exports or keys to GitHub/CI/chat.
2. Exercise migrations on a restored synthetic baseline, including preflight against actual
   legacy constraints and historic ledger shapes. Resolve blockers before real application.
3. Deploy compatible code with new features unactivated until hosted acceptance completes.
   Do not roll back a migration by deleting historical rows or rewriting completed documents.
4. On incident, pause the affected manual action, retain audit/evidence, restore compatible
   application code and use a reviewed forward correction or documented restore plan.
   Do not infer that redeploying old code reverses a grant/import.
5. Prove restoration into an isolated approved environment and compare counts/hashes and
   access boundaries before considering the backup usable. Define RPO/RTO and ownership
   before production cutover; they are not invented by this implementation.

No hosted migration, real grant/import, payroll mutation, cron or automatic mail is performed
by this preparation. See `LEAVE_ACTIVATION_READINESS.md` for financial/policy apply gates.
