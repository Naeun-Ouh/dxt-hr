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

## 2026-11-26 integration baseline (#45–#47)

Main `00ae92855be523523bbc71086d5d90954dac054d` includes merged #39–#44.
Read-only staging metadata was independently checked on `uqwnxlxzcoxbniockizv`:
28 applied migrations, including `leave_sources_and_birthday`, `leave_validity_review`,
`carryover_review`, and `weekend_work_evidence`; no public ordinary table without RLS;
all six document buckets private; automatic-mail enqueue/claim denied to both
`authenticated` and `service_role`. This establishes metadata only, not live role-session
acceptance, data correctness, latency or production readiness.

Use `scripts/release-metadata-preflight.sql` to repeat this inventory. It reads catalog,
migration and bucket metadata only. It emits no employee rows, object paths or keys and
makes no changes. Missing buckets/functions, unexpected migration names, public buckets
or unexpected EXECUTE grants require investigation; the inventory does not declare PASS.
Hosted migration timestamps differ from original repository timestamps because earlier
migrations were applied through the connector: compare reviewed names **and actual DDL**,
not timestamp ordering alone. Never replay historical files merely to align timestamps.

### Integration acceptance additions

| Surface | Synthetic hosted exercise | Required evidence |
|---|---|---|
| My Page | A and B plus an additive ADMIN/CEO session; forged employee query; own profile asset tab and unprivileged other profile | Own counts/links only; unknown leave validity remains distinct; no private fields or cross-user counts |
| Expense | General/Fuel/Toll tab edits, month switch, route preset selection/edit, save/reload, submitted last evidence removal, payment cutoff | One monthly working copy; old rows unchanged by preset edits; last ready evidence retained; foreign preset/claim UUID denied |
| Contract | Status/search filters, optional deadline update with stale revision, Seoul day boundary, overdue signature, decline/cancel | Audited authorized date edit; deadline does not block signature; private reason inaccessible to ordinary ADMIN/leader; completed PDF hash unchanged |
| Private files | Current upload limit and historical larger-file download, foreign UUID/path, revoked user | Actual deployed transport + Storage denial; no permanent URL; private/no-store response |

Record exact app SHA, new migration names, environment, timestamp and synthetic actor
role for every observation. Keep pending tests pending. Existing Google OAuth consent,
independent test identities and hosted role-session access are prerequisites; local
PGlite/fixture PKCE does not satisfy them. No automatic Gmail or cron is enabled.

### Performance evidence template

Measure the same synthetic dataset before/after at least 20 requests per route, recording
sample count, cold/warm split, p50/p95 wall time, response bytes, database request count,
and denied-request outcome. Use `/me`, `/expenses`, `/contracts/me`, `/admin/contracts`
and the existing migration review preview. Do not record response contents, cookies,
signed file URLs or personnel fields. Separate permission-denied responses from successful
requests; do not average them together. Observe existing query limits and retained history
at both ordinary and long-history sizes. No hosted capacity claim is made before capture.

### Migration rehearsal and release sequence

1. Retain the existing #43 mapping/dry-run workflow and approved source/hash/cutoff gate.
   Rehearse synthetic legacy expenses (including paid/locked evidence) and asset periods;
   compare counts, integer-won totals, source hashes and exact historical periods. Presets
   and contract due dates must not be inferred from old records.
2. On an isolated restored baseline, apply only reviewed new migrations. Verify old
   completed contract body/PDF hashes, evidence access and existing assignment/leave
   history before/after. Verify two-session stale edits and denied cross-user writes.
3. Deploy each reviewed feature against its compatible schema; run the table above and
   the existing full acceptance runbook. Preview environment/OAuth configuration is a
   separate requirement from a successful Vercel build.
4. Keep actual import/grants/payroll changes separate from this rehearsal. A reviewed
   dry-run report remains `applyAuthorized: false`. No new apply path is introduced.
5. Preserve DB/object/identity/key recovery evidence and test isolated restoration before
   cutover. Code rollback cannot undo committed data; use a reviewed forward correction.

### Hosted advisor baseline (read-only, 2026-11-26)

The provider advisor is not clean, and its findings are not dismissed as release PASS:

- [RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy): 3 INFO entries (`birthday_calendar`, `company_mail_delivery`, `vault_secret`), intentionally internal deny-by-default tables. Do not add permissive policies to silence the advisory; verify table grants and checked server/RPC boundaries.
- [Authenticated SECURITY DEFINER execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable): 83 WARN entries. Checked domain RPCs intentionally need this privilege; review per-function auth-derived identity, explicit capability/scope, fixed search path and negative tests. Do not blanket-revoke required RPCs or treat the count as proof of an exploit. New RPCs must receive the same review.
- [Leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection): 1 WARN. Google OAuth remains the application path; verify deployed Auth provider configuration before cutover. No Auth setting was changed in this task.
- [Unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys): 67 INFO entries; [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index): 11 INFO entries. Measure representative scoped queries before adding/dropping indexes. Newly applied or low-traffic staging indexes are not safe deletion candidates solely because usage is zero.
