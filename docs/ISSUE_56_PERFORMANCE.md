# Issue #56 — performance and operating-quality delivery

Base: `e0cf934410fee7f937408677ad970dcb25957786` (main, including PR #53).
PR #54 (`2bd5e0c9fc284a49f555055b8393d867d8084fb1`) and stacked #55
(`bf65e5e647796bae93427b59ffa9923f80cee459`) remain independent and unmerged.
No schema migration, policy change, hosted write, provider-region change, Gmail/cron
activation, real grant/carryover/import or payroll operation is included.

## Changes

- Expense management fetches the selected usage month and optional employee on the
  server. Existing authorization and RLS determine the permitted claim IDs first.
- Child items, attachments, attendees and vehicle details use bounded `IN` batches
  (100 identifiers, four concurrent batches, stable 500-row pages). Empty scopes
  issue no child queries; any failed page fails the whole read.
- List views omit unused attachments/vehicle details. Exports retain both and reuse
  the already-authorized batch data, including the explicit all-history export.
- Independent option/data reads run together. Project options fetch only projects
  linked to the current employee's assignments.
- React request cache reuses the cookie-bound Supabase client and DB-derived employee
  identity **within one Server Component request**. No cross-request user/business
  cache is introduced. Auth `getUser`, active membership/employment checks, server
  action/API authorization and DB policy checks remain in force. Route handlers and
  actions do not rely on a cache surviving invocation.
- Expense legacy mutations invalidate affected expense/home pages, not the whole
  root layout. Current Grid mutations retain their existing targeted invalidation.
- Private navigation shows pending feedback; automatic prefetch is disabled on the
  shared menu links. No protected data is preloaded globally. Page authorization
  remains fresh; it is not moved exclusively into a persistent layout. No streaming
  boundary is added that could change existing HTTP 404 fail-closed tests.
- Management renders at most 50 employee rows per page. Filters and the full selected
  month summary survive page changes. This is **render pagination**, not 50-employee
  DB pagination: monthly totals/warnings still read the selected month's items.

## Measurement boundaries

The checked-in `tests/performance/results/{before,after}.json` are **local synthetic**
measurements, not hosted UAT, independent PostgreSQL concurrency evidence or an SLA.
The same production-build harness uses 50 synthetic employees, four months/200 items,
plus ordinary test fixtures. Each scenario has a separate first observation and ten
warm observations; p95 is nearest-rank (the maximum of ten warm samples).
Full hard navigation includes Playwright's network-idle interval. Action timings use
existing completion assertions and network idle. No artificial WAN delay is injected.
Recorded HTTP times include mock queueing; adapter SQL time excludes context setup
and internal stored-function statements. Never interpret these as hosted query timings.

Before was measured from the unchanged main production build; after uses this PR.
Both runs must complete with zero recorded errors. Build/test jobs are paused during
measurements. Absolute timings on a development laptop are noisy; query counts and
same-workload deltas are stronger evidence than absolute latency targets.

Actual read-only deployment metadata, region/cost proposal, cold/warm role trace
procedure, backup/restore and migration gates: [hosted validation](ISSUE_56_HOSTED_VALIDATION.md).
Role audit and remaining issues: [quality review](ISSUE_56_QUALITY_REVIEW.md).
Real multi-session PostgreSQL race execution: [disposable harness](../scripts/leave-races/README.md).

## Measured local result

| Scenario | Before p50 / p95 ms | After p50 / p95 ms |
| --- | ---: | ---: |
| Employee home | 891 / 915 | 914 / 927 |
| Employee expenses | 663 / 703 | 622 / 627 |
| Leader approvals | 650 / 672 | 641 / 668 |
| Admin monthly expenses | 1,993 / 3,075 | 702 / 721 |
| CEO employee directory | 671 / 697 | 641 / 655 |
| Employee Grid save | 85 / 104 | 101 / 118 |
| Leader approval | 160 / 171 | 160 / 174 |

Admin monthly REST calls fall from 612 to 5 and counted adapter SQL calls from 1,227
to 12 per representative warm sample. All recorded before/after HTTP and adapter SQL
errors are zero. Home and save are slightly slower; no improvement is claimed there.
See [raw aggregates and comparison](../tests/performance/results/comparison.md).

## Remaining validation

- Actual hosted OAuth role sessions and cold/warm p50/p95 are not available to this
  task. The 800 ms navigation / 1 s action aspirations are not certified in production.
- No local PostgreSQL executable is installed. Race runner offline checks are distinct
  from executing the genuine multi-connection SQL scenarios; the latter remains pending.
- PR #54/#55 integration requires preserving both mock additions after GPT review.
  Their grant/carryover tests are opt-in against the pinned reviewed migration.
- Region/plan/cost approval, real fixture authorization, backup restore rehearsal and
  data-owner reconciliation precede deployment or any actual balance changes.

Implementation references: [React request cache](https://react.dev/reference/react/cache),
[Next navigation feedback](https://nextjs.org/docs/app/api-reference/functions/use-link-status).

## Evidence publication

Deployment/project identifiers and URLs are omitted from repository documentation.
Raw browser traces and screenshots are not uploaded as CI artifacts; screenshots can
be reproduced with the synthetic validation command and were inspected locally.
Only aggregate synthetic performance results are checked in. No identity/session payload
or private response body is included in published evidence.
