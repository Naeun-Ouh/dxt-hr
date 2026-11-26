# Real PostgreSQL leave races (Issue #56)

**Execution status: NOT RUN on PostgreSQL.** On 2026-11-26 this workstation has
Python 3.9 but no `psql`, `postgres` or `docker`. No packages were installed and no
hosted connection was attempted. Only Python syntax, target-safety and barrier-reader
tests were run. PGlite/Promise.all is not independent-connection concurrency evidence.

This is an operator-run, disposable local validation harness. It changes test schema,
auth/employee fixtures, test clock and synthetic balances. It must never be pointed at
production, hosted staging, a local tunnel/proxy to a remote database, a developer's
real personnel database, or any database with existing identities. No real employees,
opening balances, passwords, service keys or Google sessions are accepted.

## Prerequisites and fresh database

Use an independently provisioned **throwaway local PostgreSQL 15+ cluster** with psql
and Python 3.9+. No new application dependencies. Bootstrap mirrors the leave-related
migration dependency graph from the existing PGlite fixtures; minimal auth/storage
adapters are deliberately not Google Auth or hosted Storage. Other domains' full schema
and real deployment performance are outside this harness. For full-stack testing,
provision the complete reviewed schema on a separate blank local instance instead.

Do not reuse a shared server just because its port is loopback. After confirming this
is your dedicated disposable cluster, create a fresh database on its explicit port
(example 55432; no URL or host environment variable is used):

```sh
psql -X -h 127.0.0.1 -p 55432 -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c 'CREATE DATABASE dxt_leave_race_trial1;'
psql -X -h 127.0.0.1 -p 55432 -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "COMMENT ON DATABASE dxt_leave_race_trial1 IS 'DXT_DISPOSABLE_LEAVE_RACE_DATABASE';"
psql -X -h 127.0.0.1 -p 55432 -U postgres -d dxt_leave_race_trial1 \
  -v ON_ERROR_STOP=1 -f scripts/leave-races/bootstrap.sql
python3 scripts/leave-races/run.py --database dxt_leave_race_trial1 --port 55432 \
  --ack-disposable DXT_DISPOSABLE_LEAVE_RACE_DATABASE --report /tmp/leave-race-trial1.json
```

Use local disposable authentication (e.g. initdb test-cluster trust restricted to
loopback), never paste credentials into these commands. The runner disables psqlrc,
password prompts and all inherited PG environment overrides. It hardcodes 127.0.0.1,
requires the database name/marker and superuser fixture setup, refuses any existing
employee or auth user, and refuses overwriting reports. Bootstrap creates provider role
names only when absent; use a throwaway cluster because roles are cluster-scoped.

An interrupted run is **not reusable**. It retains data for inspection and kills its
worker processes on failure. Create a fresh suffixed database before rerunning. No
automatic DROP/TRUNCATE or real balance cleanup is implemented. Destroy the disposable
cluster with your provisioning tool after saving synthetic test evidence.

## Real blocking protocol

Each case uses distinct PostgreSQL connections, not concurrent promises on one client:

1. Controller takes a unique advisory lock.
2. Worker 1 begins as `authenticated` with a synthetic auth identity, invokes the real
   reviewed RPC, signals `FIRST_MUTATED`, and waits on the controller's advisory lock.
   Its employee/request/source transaction locks remain held before commit.
3. Worker 2 invokes the competing RPC in its own transaction.
4. Observer polls `pg_stat_activity` and `pg_blocking_pids`: worker 2 must be waiting
   on **worker 1's actual transaction lock**. A timed delay alone never counts as proof.
5. Controller releases the barrier. Worker 1 commits; worker 2 must produce the stated
   stale/insufficient-balance error or exact replay result. SQL assertions inspect final
   source amounts, request states and immutable reversal rows.

Deadlocks, timeout, failed barriers or missing actual blocking all fail the run.
Timeouts are bounded (15–20 seconds); no successful JSON report is written on failure.
The controller advisory key is test orchestration only; it does not replace product locks.

| Scenario | Worker 1 | Worker 2 | Required result |
| --- | --- | --- | --- |
| Last remaining day | Approve request A | Approve different request B | A approved, B pending/INSUFFICIENT_BALANCE, source exactly 0 |
| Duplicate cancellation | Cancel approved A | Cancel same A/version | One reversal, contender STALE_LEAVE, exact source restored |
| Approval vs correction | Approve B | Correct source with pre-approval version | Correction STALE_LEAVE, no correction row |
| Cancellation vs correction | Cancel B | Correct source with pre-cancellation version | Correction STALE_LEAVE, restored day retained |

`leave_today()` is frozen to 2026-11-20 only inside the disposable database. Original
migration files and monetary timestamps are never edited. Test grant is exactly one
synthetic day, not an inferred real entitlement. Current-year verified holiday data
are reused. The runner tests core ledger integrity, not payroll law or company policy.

## Conditional #54 benefit/carryover cases — not current main activation

Main baseline is `e0cf934` (#53 merged). #54/#55 remain separate unapproved features.
The optional suite is pinned to #54 branch commit
`a43f39895896d2d9cd01a2429b9b6d5ef9925da1`. Do not fetch, merge or apply it to any real
environment as part of this harness. In a **separate disposable worktree/database**
containing that exact reviewed migration file, bootstrap then apply only:

```sh
psql -X -h 127.0.0.1 -p 55432 -U postgres -d dxt_leave_race_benefits1 \
  -v ON_ERROR_STOP=1 -f supabase/migrations/20261126045159_leave_benefit_review_apply.sql
python3 scripts/leave-races/run.py --database dxt_leave_race_benefits1 --port 55432 \
  --ack-disposable DXT_DISPOSABLE_LEAVE_RACE_DATABASE \
  --benefits-sha a43f39895896d2d9cd01a2429b9b6d5ef9925da1 \
  --report /tmp/leave-race-benefits1.json
```

The script checks the local Git blob against the explicit SHA and checks that benefit
RPCs are installed. It refuses benefit schemas without opt-in. It adds:

- Competing weekend applies with different operation UUIDs: one source/operation;
  second fails BENEFIT_ALREADY_LINKED.
- Exact same-payload/actor replay through two connections: both return successfully
  with no second monetary operation.
- Competing carryover applies: one prior-source debit + receiving-source credit;
  original balance zero, moved amount exactly one day, validity 2027-12-31.

The current carryover fixture deliberately refuses runs whose actual server date is
past 2026-12-31, because #54 rejects post-cutoff ledger writes. Extend the scenario with
a newly reviewed future calendar/year fixture before then; do **not** modify immutable
ledger timestamps or relax the production cutoff guard to get green tests.

## Evidence and remaining gaps

Successful report records actual server version, repository HEAD, optional exact #54
SHA, observed contention/outcomes, installed core RPC definition hashes and repository
migration file hashes. Repository hashes do not claim every migration was installed;
bootstrap's explicit subset is the installation manifest. Archive the command, report,
bootstrap output, source SHA and database provisioning description together.

Required release evidence still includes repeated runs on the deployed PostgreSQL
major version, reverse winner ordering/source-correction-first races, cancellation vs
benefit reversal/carryover ordering, deadlock/rollback investigation, full-schema role
checks, real Google-role RLS/Storage UAT, workload/latency measurement and recovery.
No local harness result is a hosted acceptance result. Do not mark Issue #14, #4 or #56
complete solely from Python unit checks or future harness instructions.

Offline check (no database): `python3 scripts/leave-races/test_runner.py`.
