# DXT HR Product Principles — learned from mature HR systems

This document captures product-design principles for DXT People & Operations. It is not a feature-copy list and does not expand v1 scope by itself.

Primary external reference:
- flex Help Center: https://guide.flex.team/ko/collections/11068081-flex-%EA%B8%B0%EB%8A%A5

The purpose of this reference is to learn how a mature HR product structures data, permissions, workflows, history, configuration, and employee/admin experiences. DXT-specific business rules and approved Figma remain the source of truth.

## 1. Separate capability from access scope

A mature HR system does not treat "admin" as one giant switch.

Authorization should answer two different questions:
1. What action can this person perform?
2. On whose data / which organization scope can they perform it?

Examples for DXT:
- TEAM_LEADER may have TEAM_PROJECT_READ, but scope is their team.
- EXPENSE_ADMIN may have EXPENSE_MANAGE, with company-wide expense scope.
- IT_ADMIN may manage assets but must not see expenses or HR Private.
- PRIVATE_HR_ACCESS is separately protected.

Default to least privilege. Never broaden access simply because a user has another specialist role.

## 2. HR data is temporal: preserve history instead of overwriting

People, organizations, roles, assignments, contracts, and policies change over time.

When a change matters operationally, preserve:
- previous value / period,
- effective date,
- changed-by,
- changed-at,
- reason only when DXT actually requires one.

Examples:
- project extension history,
- employee role changes,
- asset assignment history,
- leave ledger,
- onboarding/offboarding task history.

Avoid destructive "current state only" modeling when history may explain future HR decisions.

## 3. Separate employee-facing language from back-office accounting/administration language

Employees should interact with concepts they naturally understand.
Back-office mappings can remain behind the scenes.

Expense example:
- employee selects "야근 식대", "회식", "주유비", "통행비"
- system maps those to account codes/categories where appropriate
- employees should not need accounting expertise to file a claim

The same principle applies to HR forms: collect only the information the current action actually needs.

## 4. Prefer configuration over hard-coded variants — but only where DXT needs variability

Mature HR products expose policies, forms, purposes, permissions, and workflows as settings.

DXT should adopt this selectively:
- stable DXT rules can stay coded for v1
- rules likely to change yearly or operationally should become configuration
- do not build a generic rule engine unless a real DXT use case requires it

Good candidates for configuration:
- birthday email template/year
- company-designated holidays
- expense category/account mapping
- onboarding checklist templates
- policy thresholds that are known to change

Bad candidates for premature generic configuration:
- arbitrary workflow builders
- generic payroll policy engines
- unrestricted custom-form engines

## 5. Employee self-service should reduce admin work, not weaken controls

Let employees directly manage what is naturally theirs:
- own career
- own expenses
- own family-event registration
- own weekend-work registration
- own profile fields where policy allows

But self-service must always be bounded by:
- ownership,
- role/capability,
- status,
- validation,
- row-level security.

"Self-service" never means trusting client-supplied employee IDs.

## 6. Minimize duplicate entry and manual transfer

If data already exists in the system, reuse it.

Examples:
- career selects an actual project assignment and auto-populates customer/period
- Sheet 2 fuel/toll details calculate into Sheet 1-style totals automatically
- project assignment feeds resource view
- employee data feeds onboarding/offboarding
- asset assignment feeds "내 장비"

Do not make users copy a total from one screen to another when the system can derive it.

## 7. Validation should help the user recover

Distinguish:
- ERROR: data cannot be safely processed
- WARNING: unusual/policy/suspicious condition that the user may confirm

Show:
- what is wrong,
- why it matters,
- how to fix it,
- whether submission is still allowed.

DXT expense examples:
- malformed Excel row: ERROR
- likely duplicate: WARNING
- policy threshold: WARNING or block only when DXT rule explicitly says so

## 8. Design employee and admin experiences separately

The same domain often needs two very different interfaces.

Employee view:
- own data
- small number of frequent actions
- plain language
- minimal fields

Admin/specialist view:
- filters
- bulk actions
- validation state
- exports
- history
- audit context
- exception handling

Do not expose administrative complexity to employees simply because the data model is shared.

## 9. Saved views, filters, and bulk operations matter once data volume grows

Dense HR operations become usable through:
- filtering,
- searching,
- sorting,
- saved/common views where truly useful,
- bulk review or bulk action.

For DXT's size, add these when they materially save repeated work; do not reproduce enterprise complexity by default.

## 10. Workflow should be event-driven, not approval-driven by default

Not every HR action needs an approval chain.

Add approval only when DXT policy requires a decision.

Examples:
- leave: Team Leader approval
- weekend work: Team Leader approval
- expense: no Team Leader approval; Expense Admin review/export
- career: no approval
- family event registration: direct registration + CEO notification
- equipment transfer: no approval in v1

Avoid "because HR systems usually have approval" as a reason to add one.

## 11. Audit sensitive actions, not everything indiscriminately

For high-risk data/actions, capture who/when/what category of action:
- HR Private reveal/edit
- permission/role changes
- sensitive account/key reveal
- resignation-document access where practical
- critical admin changes

Never put plaintext secrets or sensitive values into audit logs.

## 12. Security is data-level, not navigation-level

Hidden menus improve UX; they are not security.

Sensitive and employee-specific domains require:
1. UI filtering,
2. server-side route/action/API checks,
3. DB RLS / equivalent row ownership enforcement.

Tests must prove cross-user access fails through URL/API/ID tampering.

## 13. Analytics should be an outcome of clean operational data

Dashboards should answer a real operational question, not exist because "HR systems have dashboards."

First capture trustworthy source data and history. Then derive:
- project coverage/utilization,
- expense trends,
- onboarding/offboarding status,
- workforce composition,
- other useful metrics.

Analytics inherit the same access scope as the underlying sensitive data.

## 14. Model lifecycle states explicitly

HR records move through states:
- active/inactive employee,
- active/ended project assignment,
- pending/approved/rejected leave,
- submitted/locked expense,
- assigned/returned asset,
- onboarding/offboarding task status.

Use explicit states and dates rather than inferring everything from UI behavior.

## 15. Build for DXT, not for "all companies"

Flex is a benchmark for product maturity, not a scope checklist.

When deciding a detailed rule:
1. DXT confirmed policy wins.
2. Existing DXT real workflow/data wins over generic HR convention.
3. Figma/product spec defines intended UX.
4. Mature HR-product patterns may guide ambiguous details.
5. If a rule changes business meaning, do not infer it silently — document a TODO or ask only when truly blocking.

## Review questions for every future PR

Before merge, review:
- Is ownership/scope correct at DB level?
- Is this workflow adding an unnecessary approval?
- Is the user re-entering data we already know?
- Are we preserving important history?
- Is employee language understandable without HR/accounting expertise?
- Are warnings actionable?
- Are specialist/admin controls separated from employee experience?
- Did we accidentally broaden access?
- Is this configuration genuinely needed, or premature generalization?
- Does the feature solve a DXT workflow rather than imitate another HR product?
