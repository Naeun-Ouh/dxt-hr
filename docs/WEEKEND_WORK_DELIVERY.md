# Issue #4 / #35 — Weekend work evidence and review

## Scope

`/leave/weekend-work` records own actual Saturday/Sunday work, including retroactive
entries, start/end minutes, unpaid break minutes, reason and optional own project.
`/leave/weekend-work/approvals` presents currently authorized team evidence for review.
Compact DXT v2 toolbar/table/Modal reuse; no dashboard, email, cron or new capability.

This focused slice **does not complete Phase 4B**. It does not grant leave, change
balances, offset payroll, expire entitlements or classify statutory compensation.
Displayed 4h → 0.5 / 8h → 1 day is expressly a reference calculation from confirmed
DXT thresholds, capped at one day, not a legal entitlement or available balance.
Company-benefit vs statutory-compensation classification remains an apply gate.

## Model / state / integrity

New migration `20261125133519_weekend_work_evidence.sql` follows basic leave and current
main migrations. It does not replace `has_app_capability` or existing leave writers.
`weekend_work` stores fixed input, generated net minutes/indicative days, status/version,
and server actor/timestamps. `weekend_work_event` is append-only and contains no reason
text. PENDING → APPROVED / REJECTED by authorized reviewer; owner may cancel PENDING.
Terminal evidence cannot change. Corrections use cancellation/rejection then a new
record; approved corrections require a separate future policy and are not silently
implemented. No historical migration/backfill occurs.

One pending/approved entry per employee/work date captures the entire daytime interval
and total breaks. This prevents duplicate/overlapping records or multiple daily benefit
calculations. Cross-midnight shifts, weekday public-holiday work and splitting a date
into multiple intervals are not modeled; show the actual single-day evidence only.
Future dates, pre-hire dates, malformed intervals and excessive breaks are rejected.
Optional project must belong to the employee's assignment on the actual date (an ended
assignment may substantiate historical work). Browser project choice is not authority.

Submit locks the employee row, preserving same-day atomic uniqueness. Exact submission
ID replay returns the original record without another event. Review/cancel locks the
record, checks current scope and version, and accepts only the original actor's exact
immediate replay. No duplicate event or balance entry is created.

## Authorization

Auth UID → active linked employee determines submitter; no employee ID input exists.
Own page applies an explicit own filter even for managers. RLS independently restricts
records/events to own or existing leave review scope. Server actions repeat owner or
reviewer checks before checked RPCs. Direct authenticated writes and anon reads/RPCs
are revoked. Specialized roles gain no peer evidence scope.

Existing direct-team `TEAM_LEAVE_APPROVE` scope is reused; ADMIN/CEO existing leave
management scope may review ordinary employees, but nobody reviews their own record.
**A Team Leader's own weekend evidence stays pending for every reviewer**, including
ADMIN/CEO, until the approver policy is confirmed. It never inherits annual-leave
self-autoapproval. UI explains this policy gate. No HR Private scope is added.

## Verification

DB tests cover net/break thresholds, retroactive/date/project validation, duplicate-day
exclusion, cancellation/replacement, exact replay, append-only audit, terminal evidence,
cross-user table/events/RPC denial, specialist/anon/direct-write denial, stale versions,
leader self-review policy and unchanged leave ledger. Browser tests cover registration,
team review, private owner isolation, direct RPC tampering, and screenshots of both
surfaces. Full regression/build/browser execution is coordinated in integration CI;
local mocks are not real Google/Auth or hosted UAT.
