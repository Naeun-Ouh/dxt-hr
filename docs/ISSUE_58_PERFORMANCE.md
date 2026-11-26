# Issue #58 — scoped performance follow-up

Base: main `8625bac8593708ffe9e709ce31e68ce756b30ab9` (#57). No migration or production configuration change.

## Reproducible local synthetic measurements

Same production-build Playwright harness, synthetic 50 employees / 200 monthly claims, one worker, first request + 10 warm samples per scenario. Run with `DXT_PERF_LABEL=issue58-before` or `issue58-after` and `npx playwright test --config tests/performance/playwright.config.ts`. Machine-local timings include browser/network-idle overhead and the PGlite adapter; they are **not hosted cold starts or production capacity claims**. Raw numerical samples are in `tests/performance/results/issue58-{before,after}.json` (no session or business payloads).

| Scenario | Before p50 / p95 ms | After p50 / p95 ms |
| --- | --- | --- |
| Employee home | 901.6 / 923.0 | 573.8 / 580.9 |
| Employee expenses | 616.4 / 620.5 | 618.2 / 630.2 |
| Leader approvals | 644.3 / 662.4 | 645.3 / 660.6 |
| Admin expenses | 689.0 / 709.7 | 693.1 / 707.7 |
| CEO employees | 635.8 / 649.9 | 639.8 / 648.1 |
| Employee Grid save | 97.0 / 110.2 | 75.6 / 90.6 |
| Leader approval | 154.5 / 170.5 | 157.5 / 171.1 |

Home p50 decreased 36.4%; save p50 decreased 22.1%. Other scenarios are effectively unchanged, not claimed as improvements. Home warm Auth requests: 14 → 2. Save warm Auth requests: 7 → 3; membership 6 → 2; RPC 11 → 5. Counts include the resulting page refresh, not just the mutation.

## Changes and safeguards

- Home private shortcuts disable speculative prefetch, reusing #57's navigation policy. The page reuses request-scoped employee identity and obtains the DB date in parallel. Existing Suspense/error boundaries remain; unavailable data is not presented as zero.
- Grid save creates a fresh server-local session per action and reuses its authenticated client/identity for ownership, card validation and returned detail. No shared cache or client-provided identity. The existing mutation RPC still validates membership, owner, version and payment/lock policy. Card queries are skipped only when no submitted row references a card.
- P1: admin expense filtered KPI previously counted employees outside the selected employee scope as unsubmitted. The KPI now uses the already-filtered roster. Browser coverage checks draft/submitted totals, roster, month/status changes and Excel output.
- Negative browser coverage verifies an already-open Grid cannot save after account deactivation. Existing cross-user, card, lock/payment, attachment and domain suites remain mandatory.

## Dependency and operational boundaries

PRs #54 and #55 remain separate and unmerged; this PR adds neither of their migrations nor drops their tests. The independent disposable PostgreSQL race verification PR exercises main and pinned #54 conditionally, without installing that migration into this product branch or a hosted database.

See `ISSUE_58_HOSTED_ACCEPTANCE.md` for verified region metadata, inactive Seoul-region proposal, plan/cost and actual-runtime verification gates, authorized role UAT and DB/Storage/key restore rehearsal. Hosted timings, real Google-role UAT and restore are **UNMEASURED / NOT EXECUTED** pending the required access and isolated destination. No production settings, grants, imports, payroll, Gmail or cron were changed.

## Verification

Exact final check counts and CI/HEAD are recorded in the PR. Local build, lint, typecheck, unit/DB, complete browser regression and performance validation are required. Raw browser traces/screenshots stay local; no authenticated artifacts are uploaded.
