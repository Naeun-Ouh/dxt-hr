# Issue #56 — hosted performance and readiness evidence

This supplements [RELEASE_READINESS](RELEASE_READINESS.md), the environment/role setup in
[STAGING_RUNBOOK](STAGING_RUNBOOK.md), and the dated results in
[STAGING_ACCEPTANCE](STAGING_ACCEPTANCE.md). It does not replace their security or recovery gates.
Baseline: main `e0cf934410fee7f937408677ad970dcb25957786` (#53 merged).
#54/#55 remain open and are **not** part of this baseline; their unapproved functionality
and migrations must not be described as integrated or exercised here.

## Read-only provider observations — 2026-11-26

| Item | Verified observation | Limit |
|---|---|---|
| Vercel project | Connected application project (identifiers retained locally) | Connected metadata access is working; no account reconnection needed |
| Latest deployment | READY (deployment identifier retained locally), Git SHA `e0cf934410fee7f937408677ad970dcb25957786`, target **production** | READY is build/deployment state, not role-session acceptance |
| Function deployment region | `regions: ["iad1"]` from deployment metadata | Actual configured deployment region, not a measured invocation trace; no claim of edge-cache/runtime timing |
| Supabase | Connected database project (identifier retained locally), `ap-northeast-2` (Seoul), ACTIVE_HEALTHY, Postgres 17.11.0.011 | Metadata only; project name does not prove its rows are synthetic |
| Hosted migrations | 30 entries; latest `20261126080941_expense_route_presets`, `20261126080956_contract_due_dates_after_routes` | Names/history verified; full deployed DDL equivalence not verified in this pass |
| Vercel account plan, Fluid enablement, bill/usage | **UNVERIFIED**: project/team connector responses omit billing and compute configuration | Do not infer Hobby/Pro, free migration, or cost savings |
| Google role sessions, current preview env scopes, backup/PITR availability | **NOT VERIFIED in this pass** | Earlier dated account counts/env observations are not refreshed facts |

Sources: authenticated provider `get_project`, `get_team`, `get_deployment` and
Supabase `get_project` / `list_migrations` responses. No environment key values, employee
records, file contents, Auth identities, logs, or credentials were retrieved. No deployment,
region, plan, schema, data, backup, scheduler or OAuth settings were changed.

## Region proposal, support and cost

The deployment is in Washington D.C. while the DB is in Seoul. This is a plausible source
of additional application-to-DB round trips, **not proof of a measured latency contribution**.
The next controlled experiment should compare the same reviewed synthetic workload with
one Seoul function region (`icn1`). Proposed configuration only:

```json
{"regions":["icn1"]}
```

Do not apply it automatically to the current production-target deployment. First verify
actual plan/runtime/Fluid settings and authorized test deployment, then measure before/after.
Vercel documents one function region on Hobby, five on Pro and all on Enterprise; one Seoul
region does not itself require selecting multiple regions or a paid upgrade. Middleware
placement is separate. [Function region configuration](https://vercel.com/docs/functions/configuring-functions/region).

Current published **Fluid** resource rates: `iad1` CPU $0.128/hour and memory $0.0106/GB-hour;
`icn1` CPU $0.169/hour and memory $0.0140/GB-hour. Seoul unit rates are approximately 32%
higher. Shorter I/O could reduce memory time, but no savings or bill estimate is established
without actual CPU, memory, invocations, concurrency, transfer and plan allowances. These
rates must not be applied to an unverified legacy runtime configuration. No upgrade or
purchase is authorized by this proposal. [Fluid regional pricing](https://vercel.com/docs/functions/usage-and-pricing).

## Repeatable role-session measurement

Use an explicitly approved synthetic environment, never the existing 20-person records
mentioned in historical staging notes. The operator needs a dedicated Google test login
and its mapped role; no password, JWT, cookie or key should be supplied in chat.

1. Record app SHA/deployment ID, provider region, DB region, dataset counts, browser/version,
   client location, network, route/action and role alias (A/B/leader/admin). Hold these constant
   for baseline and candidate. Reconcile compatible migrations before comparing behavior.
2. Open a fresh isolated browser profile per role. Sign in through real Google OAuth. Complete
   the runbook membership/employee linkage checks. Keep sessions outside Git/CI artifacts.
   Do not replace this with fixture PKCE or management-connector authorization.
3. In DevTools Network and Performance, capture one first navigation and at least 20 repeated
   warm transitions per route. Record whether prefetch occurred, browser cache setting and
   whether the request was a document, RSC navigation or action. Keep settings equal between
   runs; run a separate no-prefetch diagnostic if needed rather than mixing samples.
4. Measure click → pending indicator, click → usable target content, TTFB, response duration,
   response byte size and request count. For synthetic saves/approvals, measure click → visible
   saved/approved result including invalidation/refetch. Use separate fixture records for each
   write; do not replay one approved item or mutate real records to collect samples.
5. Label only provider-observed cold starts as **cold**. A first browser request is not proof of
   a cold function. Record `first navigation; runtime coldness unknown` when invocation metadata
   is unavailable. Separate cold/unknown, warm, errors and permission denials.
6. Correlate sanitized request identifiers and timestamps with approved timing instrumentation:
   function total, Auth validation calls, DB calls and durations, render/serialization. Browser
   network cannot reveal server-to-DB/Auth request counts. If instrumentation is absent, mark
   those cells unknown; do not derive them from browser requests or query-count unit tests.
7. Export only a manually reviewed numeric summary. Raw HAR/Playwright traces can contain
   cookies, signed URLs, RPC bodies and HR content: do not attach them to GitHub/chat. Redact
   identifiers and paths; never capture names, reasons, salaries or source-document bodies.
8. Repeat the exact workload after the change; calculate p50/p95 on separately grouped successful
   samples (nearest-rank p95: sorted sample at `ceil(.95*n)`). Retain sample count and errors.
   Warm navigation p50 ≤800 ms and ordinary write ≤1 s are aspirational Issue #56 targets,
   not achieved results. Report actual p95 even if a median meets the target.

| Workload | Session / synthetic data | Correctness assertion alongside timing |
|---|---|---|
| Home → expenses → leave → own contracts | A, then B; ordinary + long history | No cross-session counts/content; pending UI appears immediately |
| Expense month switch/save | A; fixed items and attendee counts, then larger bounded month | Persisted values/cards/month evidence unchanged; old months not overfetched |
| Expense administrator month review | Expense Admin; same synthetic scope | Scope/payment locks preserved; no private HR access |
| Leave request → team approval | A then direct leader; verified sources/calendar | Correct deduction once, stale replay denied, no team reason disclosure |
| Employee/private document access | Ordinary Admin then designated Admin | Ordinary admin denied; designated explicit scope only, no-store response |
| Logout/revocation/session switch | A/B, inactive/revoked synthetic member | Fresh access denial; no cross-request auth/private cache reuse |

Result row template (numeric/sanitized only):

```text
sha, deployment, date_utc, role_alias, route_pattern, operation, dataset_size,
region, cache_prefetch_mode, runtime_coldness, n, success_count, error_count,
pending_p50_ms, total_p50_ms, total_p95_ms, ttfb_p50_ms, response_bytes_p50,
auth_calls, auth_ms, db_calls, db_ms, expected_security_outcome, observed_outcome
```

Current hosted latency/auth/DB-count cells are **PENDING**. This pass had management metadata
access but no authenticated synthetic browser session. Local fixture/query benchmarks remain
separate evidence and cannot fill these hosted cells.

## Migration reconciliation gate

Use the existing catalog-only `scripts/release-metadata-preflight.sql` workflow from
RELEASE_READINESS, then compare each reviewed repository migration to hosted migration name
**and actual DDL/grants/policies**. Hosted connector timestamps differ from repository versions;
never replay old SQL or edit history merely to align timestamps. The latest hosted name
`contract_due_dates_after_routes` also differs from the repository filename; review its DDL
before declaring equivalence. No SQL application or migration-history repair was executed here.

Before any authorized new migration, record baseline SHA and migration inventory, backup
reference, rehearsal result, intended target and reviewed DDL hash. Do not include #54/#55
until their review/merge gates are satisfied. RLS-enabled metadata is necessary but not proof
of correct policies; rerun authenticated cross-user and specialist denials on actual sessions.

## Backup, recovery and acceptance gates

Follow RELEASE_READINESS's release/recovery sequence rather than create a second process.
Record recovery owner, approved RPO/RTO, DB/schema backup timestamp, private object manifest
and hashes, identity mapping, and separately secured HR/Vault key custody. No secrets or
backup payloads belong in this file. Verify available retention/PITR in the actual account;
no backup capability was inferred from the project being healthy.

Supabase DB backups contain Storage metadata, **not object bytes**. A database-only restore
cannot restore deleted private objects; the object export/recovery rehearsal is a separate
mandatory gate. [Supabase backup scope](https://supabase.com/docs/guides/platform/backups).
Restore into an approved isolated target, verify counts/hashes and completed PDF immutability,
then prove role/RLS/Storage boundaries and replay safety. Code rollback does not reverse
committed data. No restore, export or production migration was run during this inspection.

Keep real Google OAuth; automatic Gmail and cron remain disabled. Final UAT uses the existing
STAGING_ACCEPTANCE matrix plus the workloads above. A READY build, unit/browser CI, catalog
inventory and region proposal do not establish live acceptance. Remaining operator input is
limited to an approved synthetic target/session and, before any region decision, visibility
of actual account billing/runtime settings. No new account, paid plan or credentials are
requested by this document.
