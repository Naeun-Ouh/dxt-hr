# Phase 4B — source allocations and birthday half-day

Depends on PR #37's verified holiday/calendar slice. Issue #4 remains open.
No hosted schema/data changes or real balances are created by this delivery.

## Implemented

- Each confirmed manual grant has its own immutable source, bucket, effective period,
  administrator, time and evidence note. Existing annual ledger IDs, monetary values,
  event times, actors and request references stay unchanged; a legacy source link is
  added. Existing approved cancellation still reverses its historical deduction.
- Approval allocates substitute → carried annual → current annual, oldest ending
  source first within a bucket. A request can consume multiple sources in one bucket.
  Only confirmed sources covering every requested working date participate; a partial validity boundary requires a split request. Approved cancellation
  restores each exact source and links to its original deduction; it does not restore
  into today's preferred bucket or extend the source's original validity.
- Manual positive grant is idempotent by supplied UUID and matching payload; conflicting
  replay fails. Corrections append a negative entry to a selected source with required
  reason and account revision. Old reasoned annual adjustment RPC remains compatible.
  No negative balance, direct authenticated table writer or historical row rewrite.
- The annual account revision remains the adjustment revision for a year. All writers
  serialize on employee rows; bulk review locks employees in stable order. All selected
  requests and allocations roll back together on a failed scope/state/balance check.
- Own overview and administration show bucket totals, individual source provenance and
  periods. The ledger also includes selected-year request deductions from earlier-year
  carryover sources. Historical ledger balances and date-usable balances are displayed separately;
  neither is a historical point-in-time reconstruction or a wage settlement.
- Birthday half-day uses the private existing month/day projection; raw birthday data
  is never made client-readable. One pending/approved request per employee/benefit year,
  AM or PM only, verified working day and normal inclusive ±7-day window. An outside-window
  request needs an actual overlapping project assignment and its exception reason. Ordinary requests retain scoped approval and Team Leader autoapproval; birthday exceptions require a different authorized reviewer. Cancellation preserves exact source history.
- On first valid birthday submission a separate 0.5 source is recorded from the confirmed
  company benefit, not annual accrual. Rejection/cancellation permits another request;
  no repeated grant or cross-year accumulation. Calendar-year source validity limits
  use without deleting historic balances or implying forfeiture of statutory claims.

## Conservative boundaries

Annual and substitute sources default to their stated year's January 1–December 31.
New carryover uses the receiving year and expires for use on December 31 of that year, without an invented 30/60-day cutoff or an automatic forfeiture entry. Existing periods remain unknown until evidenced. Source creation is an
explicit administrator entry of already verified balances, not proof of project eligibility,
weekend wage substitution, or automatic creation from a candidate record.

For a February 29 birthday in a non-leap year, or using an adjacent year's birthday window
across December/January, show a policy-review message rather than choose February 28,
March 1 or an entitlement year. In-year January/December dates and ordinary project
exceptions work. Missing/unverified birthday projection requires personnel-data correction.

Automatic annual accrual, attendance eligibility, real opening balance import, automatic
forfeiture, statutory wage replacement, weekend grants, and project carryover execution
remain outside this PR. Weekend evidence/review and carryover candidate/review are separate
slices. No mail, cron, legal-entitlement calculator or new background process is introduced.
Real basic-leave staging acceptance remains a release gate.

## Security and verification

All new public RPCs recheck current membership/capability or derive own employee identity.
Own/source reads allow only self or LEAVE_MANAGE; Team Leader does not inherit ledger
access. Internal balances, allocation and birthday preparation functions have no
PUBLIC/anon/authenticated EXECUTE. Source and ledger rows cannot be updated/deleted;
FKs tie source employee/year/bucket to ledger and reversal references are unique.

Local synthetic DB tests cover preserved historical amounts, split allocations (including
multiple annual sources), original-source reversal after year end, no expired-source reuse,
replay, stale simultaneous corrections, atomic forged bulk rollback, scoped source reads,
anonymous/internal/direct-write denial, birthday cap, project exception, missing DOB,
leap/year-boundary guard and competing birthday requests. Browser scenarios cover new
source administration, approval and own balances, birthday submission/duplicate and
cross-user/specialist RPC denial, plus existing leave regression.

Validation at agent handoff: focused DB tests, lint and typecheck are run locally. Root
coordinates production build and browser suites in the canonical worktree because the
local dependency directory is shared. Browser screenshots are generated by those tests;
no screenshot or hosted acceptance is claimed before that run.

## PR #39 review: verified use periods and historical balances

The additive `20261125235641_leave_validity_review.sql` supersedes the original source migration's indefinite carryover behavior. New carryover grants use the **receiving year** and end December 31 of that year. New substitute grants use the same annual Jan1–Dec31 window. There is no forfeiture entry, wage offset, automatic entitlement generation, or hosted change.

Deployment order: run `scripts/preflight-leave-sources.sql` read-only against basic-leave staging **before** `20261125132957_leave_sources_and_birthday.sql`, then apply the additive validity migration. The preflight checks the actual named constraints that the source migration replaces, account links, and exact historical reversal correspondence. Stop on failure; do not silently repair or infer opening balances. The additive migration additionally checks the source-aware constraints and links.

Existing sources retain all monetary rows and dates. Their validity is **unknown**, not presumed perpetual or expired. An append-only administrator confirmation records the evidence, receiving year and bounded dates; this does not grant days. Only confirmed valid sources count as usable. The UI shows historical ledger balance separately from today's usable balance and computes request-date availability. Year selection is not a claim that all historical days are usable today. A request spanning a source-validity boundary must be split explicitly; it is rejected atomically rather than silently charging annual leave. Exact-source reversal remains possible after expiry but does not revive expired usability. Every actual source year's account version advances on automatic approval, review and reversal.

Birthday exceptions require a project assignment overlapping the birthday ±7-day window and a reason. The project and exception flag are retained on the request. An exception never self-autoapproves for a team leader; another existing authorized reviewer is required. Previously pending outside-window requests without the new evidence fail closed and must be rejected/recreated. Existing approved records remain unchanged. Leap-day and ambiguous year-boundary cases remain explicitly guarded.

`tests/leave-sources.test.ts` preserves the original migration's historical compatibility baseline. `tests/leave-validity.test.ts` tests the current additive migration: unknown/usable distinction, Dec31/Jan1, legacy 2025 source confirmed for receiving 2026, stale versions after approval/reversal, exact restoration after expiry, partial-period split, project evidence and leader exception review, ACL/RLS and immutable evidence. Browser fixtures explicitly confirm **synthetic** legacy validity using `confirmSyntheticLeaveValidity`; never run that helper on real data. Combined #40/#41 tests must apply the validity migration after the source migration and invoke the synthetic confirmation helper before tests that spend fixture annual balances. Browser execution and screenshots are coordinated by the root integration task; no hosted verification is claimed here.
