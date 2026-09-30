# Phase 3 Implementation Context — Projects, Assignments, Resource View, Career

This file is the focused implementation brief for Issue #3. It consolidates the approved product rules that matter for this phase so Codex does not need to repeatedly re-derive scope from unrelated modules.

## Read first

- AGENTS.md
- docs/ROADMAP.md
- docs/PERMISSIONS.md
- docs/BUSINESS_RULES.md
- docs/DATA_MODEL.md
- docs/ROUTES.md
- docs/UI_IMPLEMENTATION.md
- Issue #3 and its latest comments

Figma source of truth:
- 14 — 프로젝트 관리 (Admin)
- 15 — 인력 투입 현황 (Admin)
- 16 — 내 프로젝트 (Employee)
- 17 — 커리어 작성 (Employee)
- 33 — 프로젝트 상세 / 수정

## Product goal

Deliver a complete, usable project/assignment/career vertical slice before moving to Expense.

## Project definition

A Project in v1 means a paid external customer contract project only.

Do not include:
- internal R&D
- unpaid internal initiatives
- generic tasks
- timesheets
- project budget/billing/profitability
- allocation percentage unless later explicitly approved

## Project model

Required project fields:
- customer_name
- project_name
- start_date
- current_end_date
- PM
- work_location
- status

A project may have many employee assignments.

An employee may have multiple concurrent project assignments.

CEO/Admin can create/edit projects and assignments.

Employee can view their own assignments.

Team Leader can view team project status only through the documented TEAM_PROJECT_READ capability.

DIVISION_HEAD broader scope remains unresolved. Do not infer broader project access.

## Assignment model

Assignment fields:
- project_id
- employee_id
- start_date
- end_date
- role
- status

Assignment dates must remain within a sensible project range or be explicitly validated.

Do not silently collapse concurrent assignments.

## Project extension history

Never overwrite project-end history without preserving the previous end date.

When an end date is extended:
- keep previous_end_date
- store new_end_date
- store changed_at
- store changed_by

Do not require an extension reason unless the user explicitly provided/approved that rule.
A reason field may remain optional if already modeled.

## Resource view / annual utilization

Annual utilization numerator:
- union of all date intervals during the selected year where the employee is assigned to one or more paid external projects
- overlapping assignment dates count only once

Example:
Jan–Jun + Apr–Sep = Jan–Sep coverage, not Jan–Jun + Apr–Sep double-counted.

Important:
- do NOT use this utilization percentage for leave carryover eligibility
- Nov 30 active-project status is a separate future leave rule
- exact denominator is unresolved
- do not silently choose calendar days, working days, or employment days as final policy

For the UI, safest behavior is:
- show unique project-covered period metric
- if a percentage is displayed, make denominator/configuration explicit and marked as provisional/TODO
- do not hard-code a business policy that has not been approved

## Career

Career is employee-authored.

No admin approval workflow.

Employee can create/update career records at any time, including during an active project.

Preferred creation:
1. employee selects one of their actual project assignments
2. system auto-populates customer/project/period
3. employee enters:
   - job_function
   - role
   - responsibilities
   - tech_stack / skills

Former employees' career records remain retained.

Career edits must be limited to the owner unless a broader explicit policy is added later.

## Required screens

### Admin Project Management
- project list
- filters/search
- create project
- edit project
- current status
- assignment summary

### Project Detail
- base project information
- assignment list
- add/edit assignment
- extension history
- no invented budgeting/timesheet UI

### Resource View
- employee
- active/current projects
- covered periods
- annual utilization-related view using overlap-deduplicated periods
- exact denominator unresolved warning/neutral handling

### My Projects
- active assignments
- history
- customer
- project
- role
- PM
- work location
- dates
- read-only for employee unless another screen explicitly permits edit

### Career
- project selector based on own assignments
- auto-populated project metadata
- job/function
- role
- responsibilities
- tech stack
- no approval

## Security / data isolation

This is an HR system. Treat row-level isolation as a mandatory boundary.

### Employee
May read:
- own project assignments
- own career
- normal directory/project summary only where explicitly allowed by product UI

Must not gain another employee's restricted assignment/career data simply by knowing:
- URL
- UUID
- employee_id
- assignment_id
- career_id
- query string
- Server Action/API/RPC input

### Team Leader
May read team project view only as explicitly allowed.
Do not infer team expense/HR Private/other-domain access.

### Admin / CEO
Project management according to PROJECT_MANAGE.

### Required enforcement
Use all applicable layers:
1. UI visibility
2. server route/action/API ownership/capability checks
3. DB RLS / row policies

Page guards alone are insufficient.

## Negative authorization tests required

At minimum prove:
- Employee A cannot fetch Employee B's private assignment detail through forged IDs if the route/data is owner-restricted.
- Employee A cannot edit Employee B career.
- Employee A cannot forge a project assignment.
- Team Leader access is limited to documented team project scope.
- Specialist roles such as EXPENSE_ADMIN / IT_ADMIN do not automatically receive project-management rights.
- Direct Server Action/API/RPC attempts are denied when the caller lacks ownership/capability.

## Data integrity

- use FK constraints
- validate date intervals
- prevent partial assignment/project saves
- use optimistic versioning or an equivalent stale-write strategy where editing matters
- preserve project extension history
- career link to project assignment should remain valid even if project later ends
- deleting a project should not casually destroy retained employee career history; prefer restrictive/retentive modeling

## Acceptance checklist

Phase 3 is complete only when:
- project CRUD works
- project assignment CRUD works
- multi-project concurrent assignment works
- extension history is visible and preserved
- My Projects works for employee
- Team Project view respects scope
- Resource View deduplicates overlapping dates
- no unapproved utilization denominator is silently locked in
- Career can be created/edited from actual own assignments
- Career project metadata auto-populates
- Former employee career remains retained
- unauthorized cross-user reads/writes fail
- CI passes
- screenshots for major screens are included
- implementation is compared against Figma 14/15/16/17/33

## Next phase

After review/merge, proceed directly to Phase 5 Expense, not Leave.
