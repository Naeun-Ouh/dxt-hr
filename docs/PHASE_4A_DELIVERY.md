# Phase 4A — Basic Leave

Implements the basic slice of Issue #4 from main `3e3b2dd`, following PHASE_4A_CONTEXT and [the latest issue comment](https://github.com/Naeun-Ouh/dxt-hr/issues/4#issuecomment-6016073114). Issue #4 remains open for Phase 4B.

## Working flows

- `/leave`, `/leave/requests`: own year-scoped annual summary, detailed requests and authoritative ledger.
- `/leave/request`: FULL_DAY, AM_HALF, PM_HALF; full-day date range within one year; same-day and future dates; mandatory past-date explanation. Rejected requests remain immutable and require a new submission.
- `/leave/requests/[id]`: scoped reason, past explanation, state and actor-linked history. Employees cannot cancel approved leave.
- `/leave/approvals`: direct-team pending queue, individually scoped drawer, atomic bulk approve/reject, optional rejection reason and confirmation. Active Auth TEAM_LEADER own submissions auto-approve, with normal deduction and history.
- `/leave/team-calendar`: monthly Monday-first grid of approved leave. The database projection returns only name, start/end dates and unit, including for leaders; reasons are fetched only through a separate authorized request.
- `/admin/leave`, `/[id]`: employee search/department filter, year balances, manual signed half-day adjustments with mandatory reason, ledger and request history.
- Team Leader/Admin approved cancellation records a positive reversal in the original request's year. No request or ledger history is deleted.

## Database and authorization

Apply migration `202610060012_basic_leave.sql` after all prior migrations. It adds annual account metadata/version, requests, immutable-to-client ledger and history. There is no stored mutable balance: summaries sum ledger entries. Client roles receive read-only table access under RLS; writes are checked SECURITY DEFINER RPCs with an empty search path and qualified relations.

Own balance/ledger are limited to owner or LEAVE_MANAGE. Team Leaders gain direct-team request detail/reason, not peers' balance/ledger. Their drawer therefore omits the Figma example's peer balance breakdown. The direct-team boundary reuses the existing non-null exact department mapping; no descendant-team or DIVISION_HEAD scope is inferred. Domain employee-role labels cannot grant Auth Team Leader powers.

Every write rechecks current membership/capability and employee linkage. Request employee IDs come from the authenticated identity. Bulk action checks every selected UUID/version, rejects duplicates, and rolls back the whole batch on any invalid/out-of-scope/stale/insufficient request. Actions precheck scoped rows, then SQL independently enforces scope.

All balance writers lock the relevant employee rows before requests, sorting multi-employee locks. Approval/cancellation also increment account versions. Unique request/event ledger keys prevent duplicate deduction/reversal. Admin adjustments check the account version under that lock. Pending requests do not reserve balance; submission and approval both check available balance, and approval rechecks against current ledger values. The UI reports insufficient balance and stale changes without exposing private error data.

## Explicit policy boundaries

Annual accounts are keyed by request calendar year. Cross-year ranges must be submitted separately, so a request never silently draws from another year's allowance. Saturday/Sunday are excluded, matching approved non-working-day policy. Half-days must be a single weekday. Overlapping PENDING/APPROVED requests for the same employee/unit are rejected; AM and PM halves may coexist. Rejected/cancelled requests do not block new submissions.

**Entitlement TODO:** approved documents state monthly accrual under one year and statutory tenure additions, but do not settle first-year calendar proration, monthly cutoffs, attendance requirements or migration cutover balances. No speculative statutory calculator is introduced. An isolated manual-only annual account begins at zero; Admin imports confirmed opening entitlement using a reasoned ledger adjustment. Historic year adjustments remain possible for reconciliation. No automatic carryover/expiry ledger rewriting occurs; each year's balance is isolated.

Statutory/company holiday automation is Phase 4B. The form states that public holidays are not automatically reflected; users must exclude those dates when choosing ranges. Birthday half-day, substitute/weekend work, project carryover, promotion nudges and payroll settlement are not implemented. Approved policy documents remain intact.

Google OAuth login is unchanged. Automatic birthday/family Gmail remains disabled by Issue #15; leave never sends notification email or adds a cron.

## Figma comparison

Compared high-fidelity contexts and screenshots for:
- 09 `15:2375`: white balance cards, request history table and indigo policy notice.
- 10 `15:2554`: request form/400px balance aside; conditional past explanation.
- 11 `15:2705`: month grid, 120px cells and indigo leave labels. Correct real weekday alignment replaces the illustrative fixed dates; no fake holiday labels.
- 12 `15:2919`: amber pending notice, selection strip, scoped table and recent processing.
- 12b `25:976`: 440px accessible modal drawer, private detail and decisions.
- 30 `40:2`: searchable staff table and audited manual adjustment. No out-of-scope carryover candidate or holiday counters.
- 37 `48:2`: required past explanation, same-day submission, rejection confirmation and new-request guidance.

Reused the established app shell, buttons, fields, tables, badges and local sidebar assets. Downloaded the Figma Clock and close SVGs for their exact notice/drawer slots, retaining 18px dimensions. Existing shell differences are outside this slice. No static person photo is substituted for actual employee identity.

## Validation and rollout

Local validation passed: lint, 54 unit/database tests, production build, typecheck and all 47 browser tests. Tests cover ownership/RLS, reason-free calendar JSON/HTML/RSC, out-of-team/forged bulk rollback, stale and competing decisions, insufficient balance, half-day/overlap/date validation, reversal, real UI flows, Admin adjustment and session-switch replay.

Screenshots in `docs/screenshots/phase4a-*.png` document overview, request, calendar, approval queue/detail, Admin management, past-date edge state and mobile form.

Deploy migration first, link verified Auth accounts to employee records and trusted application memberships, confirm direct department mappings, and import independently confirmed annual balances through audited Admin adjustments. Test against the real staging Supabase project before replacing the existing leave system. No live production data or mail was used in development.
