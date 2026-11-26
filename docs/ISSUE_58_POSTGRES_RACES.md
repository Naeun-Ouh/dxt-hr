# Issue #58: disposable PostgreSQL concurrency evidence

Scope: the main leave ledger and a separately opted-in #54 benefit migration, using
only generated `example.test` identities and synthetic allowances. No hosted database,
real employee, original opening balance, Google login, production migration, automatic
grant, mail, cron or payroll operation was touched. #54/#55 remain separate and unapproved.

## Provenance and reproduction

- Main source baseline: `8625bac8593708ffe9e709ce31e68ce756b30ab9` (#57 merged).
- Conditional #54 source: `2bd5e0c9fc284a49f555055b8393d867d8084fb1`.
- PostgreSQL 17.6, arm64 macOS, compiled with Apple clang 16.0.0. This is an explicitly
  selected local test engine, not a claim about the hosted server major/minor version.
- [Official source archive](https://ftp.postgresql.org/pub/source/v17.6/postgresql-17.6.tar.bz2)
  matched its [published SHA-256](https://ftp.postgresql.org/pub/source/v17.6/postgresql-17.6.tar.bz2.sha256):
  matching the full digest below.

Full archive SHA-256:
`e0630a3600aea27511715563259ec2111cd5f4353a4b040e0be827f94cd7a8b0`.

Binaries were built only under `/private/tmp/dxt-pg17` using:

```sh
./configure --prefix=/private/tmp/dxt-pg17 --without-icu --without-readline --without-zlib
LC_ALL=C LANG=C make -j4
LC_ALL=C LANG=C make install
```

No Homebrew/system package was installed. The first compilation stopped because macOS
Perl rejected inherited `C.UTF-8`; using `LC_ALL=C` resolved it. The first sandboxed
initdb attempt failed shared-memory permissions before database creation; approved
local execution then succeeded. Neither failed setup attempt counts as a race result.

The runner [instructions](../scripts/leave-races/README.md) describe the exact RPCs,
empty-database guard and bootstrap migration subset. `disposable.sh` creates a fresh
private cluster, binds loopback port 55438, and stops that cluster on exit. The same
server is never shared with the application's mock or another developer database.
Conditional #54 SQL is loaded from its exact Git blob into `/tmp`, not main's migrations.

## Executed results — 2026-11-26

| Fresh cluster run | Actual races | Result | Evidence |
| --- | ---: | --- | --- |
| Main ledger | 6 | PASS | [JSON](evidence/issue58/postgres-main.json) |
| Main + exact #54 fixture, run 1 | 17 | PASS | [JSON](evidence/issue58/postgres-benefits-run1.json) |
| Main + exact #54 fixture, run 2 | 17 | PASS | [JSON](evidence/issue58/postgres-benefits-run2.json) |

All three clusters were stopped successfully after execution. No deadlock or timeout
occurred. Offline safety/barrier tests: 4 PASS; wrapper shell syntax: PASS.
The conditional suites include all six main cases. Exact committed evidence came from:

```sh
DXT_PG_BIN=/private/tmp/dxt-pg17/bin scripts/leave-races/disposable.sh main /private/tmp/dxt-races-main-final
DXT_PG_BIN=/private/tmp/dxt-pg17/bin scripts/leave-races/disposable.sh benefits /private/tmp/dxt-races-benefits-final1
DXT_PG_BIN=/private/tmp/dxt-pg17/bin scripts/leave-races/disposable.sh benefits /private/tmp/dxt-races-benefits-final2
```

| Scenario | Required contender result |
| --- | --- |
| approval competing for last day | INSUFFICIENT_BALANCE |
| same approved request cancellation | STALE_LEAVE |
| approval invalidates source correction | STALE_LEAVE |
| cancellation invalidates source correction | STALE_LEAVE |
| source correction wins before approval | INSUFFICIENT_BALANCE |
| source correction before cancellation preserves both | success |
| weekend competing apply different keys | BENEFIT_ALREADY_LINKED |
| weekend exact replay | success |
| duplicate benefit reversal exact replay | success |
| work cancellation versus reversal cancel-first | success |
| work cancellation versus reversal reverse-first | success |
| apply before cancellation detects stale balance | STALE_LEAVE |
| cancellation before apply denies obsolete plan | APPROVED_WORK_REQUIRED |
| carryover capture before apply uses shared advisory order | CONFIRMED_CARRYOVER_SOURCE_REQUIRED |
| carryover competing apply different keys | BENEFIT_ALREADY_LINKED |
| carryover apply replay before capture shared advisory order | success |
| carryover reversal exact replay conserves both years | success |

Assertions also verify no overdraft, exactly one cancellation/reversal, no stale monetary
write, preserved independent correction, no partial cancellation, one source/operation
per business key, exact carryover debit/credit, receiving expiry 2027-12-31 and restored
original expiry 2026-12-31. Capture/apply contenders specifically observed `advisory`
lock waits; ledger contenders observed `transactionid` waits. This demonstrates the
actual shared lock ordering for those specific competing paths.

## Result interpretation

Every recorded race uses independent controller, worker 1, worker 2 and observer
PostgreSQL sessions. Worker 1 performs its operation but cannot commit until the
controller releases a barrier. Worker 2 must demonstrably wait on worker 1 according
to `pg_stat_activity` and `pg_blocking_pids`; its PID, holder PID, wait event and blocker
array are recorded. A sleep, `Promise.all`, or successful sequential result is not
accepted as locking evidence. After release, both outcomes and ledger invariants are
asserted. Deadlock, missing contention, timeout or incorrect error fails the suite.

Results contain only synthetic-test engine/provenance and aggregate outcomes. No
employee profile, payload, credentials or real database identifier is included.
Each JSON records the exact runner/bootstrap/provisioner SHA-256 used, because test
support was being revised on top of the baseline when execution occurred.

## Limits

This proves the listed interleavings on PostgreSQL 17.6 and the explicitly installed
leave dependency subset. It does not prove all schedules, full Supabase Auth/Storage,
all-domain deployment schema, throughput, hosted PostgreSQL parity, backup recovery,
statutory attendance or entitlement, or real source reconciliation. The full schema,
real Google-role UAT and hosted recovery gates remain separate.

The carryover fixture advances only the disposable `leave_today()` test clock to
2027-01-04. Immutable ledger timestamps are not backdated. It deliberately refuses
execution after actual 2026-12-31; future fixtures require reviewed dates and calendars.
No successful synthetic result authorizes real grant application or merging #54/#55.
