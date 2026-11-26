# Issue #58 — hosted acceptance follow-up

Baseline: main `8625bac8593708ffe9e709ce31e68ce756b30ab9` (#57 merged).
This is a dated supplement to [Issue #56 hosted validation](ISSUE_56_HOSTED_VALIDATION.md),
[release readiness](RELEASE_READINESS.md), and [staging acceptance](STAGING_ACCEPTANCE.md).
Reuse their workload/measurement and recovery procedures; this document records new evidence
and the exact remaining gates. Provider account/project identifiers and deployment URLs are
intentionally omitted. No unapproved #54/#55 code or migrations are treated as integrated.

## Verified metadata versus unmeasured behavior

Read-only authenticated provider checks on 2026-11-26 returned:

| Check | Observation | What it does not establish |
|---|---|---|
| Latest deployment | READY; target production; SHA `8625bac8593708ffe9e709ce31e68ce756b30ab9` | No permission to perform writes against this target |
| Deployment function regions | `iad1` | Not proof of the actual region of every invocation or middleware execution |
| Database region/status | Seoul `ap-northeast-2`; ACTIVE_HEALTHY | Not a DB latency measurement or proof that the contents are synthetic |
| Current plan/Fluid/runtime billing settings | UNVERIFIED; team metadata response omits billing | Do not assume Hobby/Pro, free regional change, or billing savings |
| Role-session p50/p95 and server Auth/DB timing | UNMEASURED | Management connector authentication is not a Google employee session |
| Backup availability, object/key restoration and hosted UAT | UNMEASURED | READY/healthy states do not prove restore capability or role isolation |

No employee rows, file contents, secrets or raw runtime logs were read. No region/config,
plan, environment, migration, Auth, Storage, key, backup or scheduler setting was changed.
The existing US-function/Seoul-DB separation persists after #57. It is a plausible latency
contributor, not a quantified root cause without correlated traces.

## Minimal region proposal — inactive example

The following is documentation only. It is **not** applied to `vercel.json`:

```json
{"regions":["icn1"]}
```

Vercel documents selecting a single function region, including on Hobby. This proposal needs
no multi-region failover and does not request a paid upgrade. Verify the actual project plan,
Node/Fluid runtime and function-level overrides before applying it to any approved test
build. Region changes do not move the database or middleware automatically.
[Region configuration](https://vercel.com/docs/functions/configuring-functions/region),
[configuration limits](https://vercel.com/docs/project-configuration/vercel-json).

Published Fluid prices checked on 2026-11-26 remain Seoul CPU $0.169/hour and memory
$0.0140/GB-hour; Washington D.C. CPU $0.128/hour and memory $0.0106/GB-hour. Seoul unit
rates are about 32% higher. An actual monthly estimate needs confirmed runtime, plan,
resource usage, invocation counts and transfer. Reduced I/O duration might lower memory
usage, but this is not a savings claim. Check current billing before making the decision.
[Fluid regional rates](https://vercel.com/docs/functions/usage-and-pricing).

## Region verification and rollback gate

1. Keep the current reviewed SHA, region configuration and compatible schema as the rollback
   baseline in the private deployment record. Confirm who may approve a production change.
   No production region change or upgrade is authorized by this document.
2. On an approved isolated synthetic deployment, use the same code SHA, schema, dataset,
   browser location, cache/prefetch settings and role sessions as the baseline. Change only
   the proposed function region. Do not move a production alias during this experiment.
3. Verify generated deployment function metadata and per-function overrides, then correlate
   a sanitized runtime invocation's reported region with the tested request. A nearby CDN
   response or edge location alone does not prove the server function ran in Seoul.
4. Repeat the Issue #56 trace procedure: at least 20 successful warm samples per role/route
   and ordinary write, separate first/cold/unknown samples, click-to-pending and completion,
   TTFB, p50/p95, Auth/DB calls and timing. Mark unsupported instrumentation UNMEASURED.
   Measure denied/revoked-session outcomes separately. Do not record cookies, payloads or
   private object URLs in shared artifacts.
5. Before production consideration, rehearse reverting the isolated deployment to its previous
   reviewed configuration/build, verify actual runtime returns to the previous region and
   repeat login/read/write/denial smoke checks. Record operator and elapsed recovery time.
   Preserve data: a code/region rollback neither deletes nor reverses committed records.
6. Reject the change if errors, authorization, response correctness, recovery or cost evidence
   regresses. Promotion requires reviewed measurements and explicit operational authorization;
   a lower synthetic median alone is insufficient.

## Reproducible UAT and recovery record

Follow the existing runbook's independent A/B, direct Team Leader, ordinary Admin,
designated Private HR Admin, specialist and CEO sessions. Use approved synthetic users and
records. Confirm the target's current deployed SHA and environment privately before each
run. Human Google sign-in/consent cannot be replaced by fixture PKCE or management credentials.

Record only: SHA, timestamp, role alias, route pattern, operation, dataset size, region,
expected/actual outcome, sample count, p50/p95 and an approved sanitized evidence reference.
Reuse Issue #56's table for expense month/save/export, leave decisions, private documents,
revocation/session replacement and long-history workloads. Include payment locks, immutable
completed documents and negative UUID/path/RPC access. Keep Google OAuth unchanged and
Gmail/cron disabled. Open #54/#55 acceptance remains separate until approved and integrated.

For recovery, reuse RELEASE_READINESS's ordered DB/schema + private object + identity mapping
+ separately protected HR/Vault key procedure. In an approved isolated restore target:

- Reconcile reviewed migration names and actual DDL/policies/grants; never replay historical
  migrations just to align differing provider timestamps.
- Verify restored row counts, ledger totals and immutable document hashes against the approved
  synthetic baseline. Verify private object bytes and hashes independently: DB backups contain
  Storage metadata, not the objects themselves. [Backup scope](https://supabase.com/docs/guides/platform/backups).
- Recover keys through the existing controlled custody process, then verify authorized
  synthetic decryption and unauthorized denial. Do not place key material or backups in Git,
  chat, browser traces or CI artifacts.
- Recheck Google identity mappings, role boundaries, revocation and private Storage proxy
  behavior. Record actual recovery duration/data-loss window against owner-approved RTO/RPO.

All hosted timing, role-session UAT and restore rehearsal results remain **UNMEASURED** in
this pass. The blockers are an available approved synthetic Google test session/target and
visibility of actual runtime/billing/backup settings. No new credentials or paid resources
are requested. Local tests remain useful but must be labeled synthetic and cannot close
these live acceptance gates.
