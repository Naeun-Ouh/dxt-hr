# Issue #56 — independent quality review

Review date: 2026-11-26. Scope: current `codex/issue-56-performance` working changes against
main `e0cf934410fee7f937408677ad970dcb25957786`. This is a static code/test-coverage audit,
not a claim that the evolving branch or hosted environment has passed execution tests.
See [hosted validation](ISSUE_56_HOSTED_VALIDATION.md) for verified provider metadata and
unexecuted latency/session gates. No production records, new test employees or schema were
created during this review.

## Priorities and disposition

P0 means privacy, authorization, destructive data or accounting integrity blocker. P1 means
workflow correctness/regression or missing release evidence. P2 means bounded usability,
performance or maintainability follow-up. These are review priorities, not newly invented
company policies.

| Priority | Role/workflow | Static finding / remaining evidence |
|---|---|---|
| P0 | Any authenticated user; session replacement, deactivation | No new cross-user cache found. `createAuthClient` and `currentEmployeeId` use React request memoization; `currentPrincipal` still validates Auth user, trusted membership and active domain access. No module-level user/client map, persistent private cache or metadata-based privilege grant added. Execute session-switch/deactivation browser regression; hosted revocation remains pending. |
| P0 | Employee own expense/detail/export | Claim ownership is explicitly checked; batching uses IDs obtained from authorized claim queries and still uses session RLS. Missing linked employee yields no own claims. A client `admin=1` export flag still requires EXPENSE_MANAGE through the detail loader. Negative foreign claim/file/preset tests remain mandatory. |
| P0 | Expense Admin / specialists | Admin month/employee selection narrows database queries; it does not create new permission. IT Admin, leader and ordinary employee cannot gain EXPENSE_MANAGE through filters. No new PRIVATE_HR_ACCESS inheritance or service-role read introduced. |
| P0 | Monthly save/submit/payment/evidence | Domain mutation RPCs and their payment/lock/last-ready-attachment protections are unchanged. Legacy action invalidation is narrower, but guards still run per invocation and SQL rechecks ownership/revision. Keep existing paid/locked/replay regressions. |
| P1 | Administrator workbook export | Export now reuses loaded month data instead of rereading each claim. It explicitly enables vehicle hydration, joins attendees by item ID and retains attachments, card snapshots and audit/import fields. Single-claim export retains its previous detail loader. No concrete field-loss bug found statically; see test gap below. |
| P1 | Large attendee/claim sets | Related reads use bounded batches, four concurrent batches, 500-row pages and stable item+employee ordering. Empty ID sets make no child query; failures reject the whole result. Offset pagination is not a transaction snapshot under concurrent inserts; coherent business reconciliation still requires refresh/revision checks. |
| P1 | Admin roster pagination | Fifty-row rendered pages preserve month/employee/status/warning query parameters and page bounds. A dedicated synthetic performance fixture now has `tests/performance/pagination.check.ts` for >50-employee next/previous behavior, preserved month and full-month summary. Its execution result remains separate from ordinary CI/hosted evidence. |
| P1 | Release evidence | Hosted p50/p95, cold/warm classification, actual server Auth/DB counts, real Google roles and restore rehearsal are pending. Neither source review nor query-count fixtures prove the Issue #56 latency targets. |
| P2 | Administrator scalability | Pagination limits rendered employees, not underlying month claim/item/attendee reads. The selected month is scoped, but all matching month data is still loaded to compute totals/warnings. Describe this as render pagination, not database pagination. Future server aggregates need measured evidence and preserved warning semantics. |
| P2 | Private navigation | Immediate link-pending status is introduced; private workspace links explicitly disable prefetch. This avoids speculative private reads but does not prove faster click completion. Compare workloads with identical prefetch/cache settings and keep server authorization on every destination. |
| P2 | Revalidation maintenance | Legacy expense actions repeat the same targeted path list. A small shared helper could reduce drift later; it is not a correctness blocker in this diff. Current grid actions' existing narrower refresh behavior was not broadened in this review. |

No concrete new P0/blocking production defect was identified in the inspected diff. This
statement is limited to static review; it does not waive CI, negative tests or live UAT.

## Existing test coverage and precise gaps

- `tests/e2e/expenses.spec.ts`: employee/specialist access denial; dining shared monthly limits;
  month submission → admin month view → XLSX download → stale role action denial → payment lock.
  The original administrator export assertion checks parsing/headers. A new focused monthly batch export test now checks exact vehicle origin/destination/amount/count, dining attendee allocation, workbook total, employee filter and empty-month exclusion using the existing UI-authored synthetic records. Execution is pending the parent run.
- `tests/e2e/expense-grid.spec.ts`: single-claim Excel export checks the vehicle sheet trip-count
  cell; foreign claim export is denied. That single-claim path does not exercise the changed
  administrator batch export path.
- `tests/e2e/expense-routes.spec.ts`: copied origin/destination and computed amount survive
  save/reload and later preset edits; useful source-data preservation coverage, not workbook
  batch join coverage.
- `tests/e2e/expense-monthly.spec.ts`: amount/date/reload, multiple attachments, submission,
  cross-user UUID/path attacks and locked/payment boundaries.
- `tests/e2e/access.spec.ts`: current work adds request-session replacement/deactivation and
  immediate navigation feedback checks. Execution status belongs in the final CI report.
- `tests/expense-batch-pages.test.ts`: current work covers 205 IDs / 1,230 rows, pagination,
  stable output order, duplicate IDs, empty scope, maximum concurrency and failure propagation.
  This proves helper behavior with synthetic callbacks, not hosted PostgREST latency.

The focused export assertion and dedicated >50 roster pagination test are now present; their
execution status must be reported by the parent integration run. No browser was launched by
this document/test author during the benchmark window. The performance-only synthetic roster
is separate from hosted employee data and ordinary application fixtures. These tests do not
establish hosted latency, real role-session acceptance or actual PostgREST capacity.

## Pending #54 / #55 compatibility (no merge performed)

Compared local delivery branch file lists against main. The pending benefit slice adds
`leave-benefits/*`, a benefit migration and route registrations. The simulation slice adds
`leave-simulation/*`, its API and route registrations; its local stacked branch also contains
the benefit slice. Neither is included in Issue #56's main baseline.

The immediate overlapping file is `tests/e2e/mock-supabase.ts`: a future merge must preserve
both the new ordering/filter behavior used by expense batches and pending benefit migration,
RPC/table registrations. Do not resolve by replacing the entire file from either branch.
The new leave `ownEmployee()` implementation keeps its signature and still returns the
current authenticated employee; pending data loaders continue to use unchanged `leaveRpc`
and session-scoped clients. Their manager-only guards must remain intact.

No merge, migration application or combined #54/#55 test was performed. Re-run the complete
integrated suite only after those reviews authorize integration; static compatibility is not
approval or evidence that those features are deployed.
