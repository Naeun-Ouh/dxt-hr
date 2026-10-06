# Phase 4A Implementation Context — Basic Leave Management

This is the focused implementation brief for the first Leave delivery slice.

## Read first

- AGENTS.md
- docs/ROADMAP.md
- docs/BUSINESS_RULES.md
- docs/PERMISSIONS.md
- docs/DATA_MODEL.md
- docs/UI_IMPLEMENTATION.md
- docs/HR_PRODUCT_PRINCIPLES.md
- Issue #4 and its latest comments

Figma source of truth:
- 09 — 내 휴가
- 10 — 휴가 신청
- 11 — 팀 휴가 캘린더
- 12 — 휴가 승인
- 12b — 휴가 승인 상세
- 30 — 휴가 관리
- 37 — Validation & Edge States

Do not implement the advanced Phase 4B scope in this PR unless required for data-model compatibility.

## Product goal

Deliver a complete, secure, daily-usable leave workflow for employees, Team Leaders, and Admin.

The goal is operational usefulness first, not a generic leave-policy engine.

## Phase 4A scope

### Employee
- view own leave balances
- view own ledger/history
- request leave
- view request status
- team leave calendar
- cannot read peers' leave reason
- cannot delete/cancel an approved leave

### Team Leader
- employee capabilities
- view own team pending requests
- approve/reject individually
- bulk approve/reject
- view leave reason for own team
- own leave request auto-approves

### Admin
- operational leave management
- manual leave balance adjustment
- reason required for any manual +/- adjustment
- cancel approved leave where policy allows
- view full leave reason where authorized

DIVISION_HEAD broader scope remains unresolved. Do not invent it.

## Leave units

Supported only:
- FULL_DAY = 1.0
- AM_HALF = 0.5
- PM_HALF = 0.5

No hourly leave.

## Request rules

- same-day request allowed
- future request allowed
- past-date request allowed
- past-date request requires "미리 신청하지 못한 사유"
- request reason itself follows privacy rules
- rejected request is not edited in-place into another lifecycle; user creates a new request
- approved leave cannot be deleted/cancelled by employee
- Team Leader/Admin may cancel an approved leave
- cancellation must preserve history

## Approval

Normal employee:
PENDING → APPROVED or REJECTED by Team Leader.

Team Leader's own request:
- auto-approved at submission
- must still produce normal ledger/history records
- do not create a fake self-approval UI action

Bulk action:
- Team Leader can bulk approve/reject only requests within their authorized team scope
- server/RLS must independently verify every selected request is in scope
- never trust a client-supplied list of employee IDs

## Privacy / data isolation

This is HR data.

### Employee
Can read:
- own detailed requests/reasons
- same-team calendar presence/date/leave unit as permitted

Cannot read:
- another employee's leave reason
- another employee's private request detail outside team-calendar projection
- another employee's leave balance/ledger

### Team Leader
Can read:
- own data
- own direct-team request detail and reason
- own direct-team approval queue

Cannot:
- read unrelated teams
- gain expense/HR Private/etc. through leave role

### Admin
Can manage leave according to LEAVE_MANAGE.

## Mandatory authorization layers

Use:
1. UI/navigation scope
2. server route/action/API ownership/capability checks
3. DB RLS / scoped RPCs

Required negative tests:
- Employee A cannot fetch Employee B leave request/reason by URL/UUID
- Employee A cannot fetch Employee B balance/ledger
- peer team-calendar response does not contain reason
- Team Leader cannot approve out-of-team request
- forged request ID in bulk action fails closed
- specialist roles do not gain leave-admin rights
- replay after session/role change fails

## Ledger-first model

Do not store leave only as a mutable balance.

Use an authoritative leave ledger.

Suggested concepts:

LeaveAccount / entitlement metadata
- employee_id
- year
- bucket

LeaveLedger
- employee_id
- bucket
- amount_delta
- event_type
- reference_id
- occurred_at
- actor_id
- note/reason metadata as appropriate

LeaveRequest
- id
- employee_id
- leave_date or start/end representation suitable for v1
- unit
- reason
- past_reason
- status
- approver
- timestamps
- version

For Phase 4A, the current-year annual bucket is the primary usable bucket.
Keep the schema extensible for future carryover/substitute/birthday buckets without pretending those automations are already implemented.

## Balance and deduction

Phase 4A should support:
- current annual entitlement/balance
- admin manual +/- adjustments
- approved leave deduction
- approved cancellation reversal

Do not implement Phase 4B deduction priority automation unless needed now.

If bucket structures already include future bucket types, keep unused buckets inactive rather than adding fake balances.

## Accrual

Approved DXT policy remains:
- calendar/fiscal-year basis
- under 1 year monthly accrual
- 1+ years statutory tenure addition

For Phase 4A, implement the basic annual entitlement/accrual only if it can be done confidently from approved policy and existing employee hire date.

Do not create a speculative Korean labor-law calculator beyond the approved DXT behavior.
If detailed tenure edge cases are not already specified, isolate the entitlement function and document any unresolved boundary rather than silently inventing policy.

Admin manual adjustment must make the system operable even while advanced accrual policy is refined.

## Team calendar

Show:
- employee name
- date
- full / AM / PM
- approved leave only unless Figma explicitly shows pending state

Peers must not receive the reason in data payloads.
Do not fetch reason and merely hide it with CSS.

Team Leader/Admin may use a separate authorized detail query for reason.

## Admin leave management

Figma 30 direction:
- employee search/filter
- current balance
- ledger/history
- manual +/- adjustment
- adjustment reason required

Do not create payroll cash-settlement calculations.

## Validation / edge states

Implement Figma 37 relevant cases:
- past-date request → require past reason
- reject flow → rejection reason/action as designed
- approved request → employee cannot cancel
- insufficient balance should fail safely
- stale approval/change should reject with optimistic concurrency

Use friendly, actionable messages.

## Out of scope for Phase 4A

Defer to Phase 4B:
- project-based Nov 30 carryover
- December project-end use-first automation
- birthday half-day ±7 day rules
- project exception birthday rule
- weekend work registration
- substitute leave accrual
- Korea statutory/substitute holiday automation
- company-designated holiday UI
- leave-promotion nudges

Do not delete the approved policies. Just do not implement them in this PR.

## Automatic mail

Do not add leave notification email.
Birthday/family-event automatic Gmail delivery is also deferred from active v1 scope.
Google OAuth login is unrelated and remains required.

## Acceptance

Phase 4A complete only when:
- own leave summary works
- ledger/history works
- request full/AM/PM works
- same-day works
- past-date requires reason
- Team Leader approve/reject works
- bulk approve/reject is scope-safe
- Team Leader self-request auto-approves
- employee cannot cancel approved leave
- Team Leader/Admin cancellation preserves ledger history
- team calendar hides peer reasons at DB/query boundary
- Admin manual +/- adjustment requires reason
- cross-user/RLS negative tests pass
- Figma 09/10/11/12/12b/30/37 compared
- CI green
