# Issue 51 — Home and scoped workspaces

Implementation baseline: exact integrated #48/#49/#50 HEAD `e5b5d2bd5a44349c4269c516e6a39df1cd7e3b99`.
This review stack targets the authorized integrated PR #50 branch while #49/#50 remain open. Retarget/rebase onto merged main before merge; do not merge this PR automatically.

## Navigation and reachability

Authenticated `/` now renders My Page; `/me` remains a compatible URL. Google OAuth,
known local deep-link validation, server route guards and existing RLS are unchanged.
The sidebar presents eight employee workspaces in the approved order: Home, people,
leave, expense, my projects, certificates, contracts, assets. Every role retains its
own workspace, including IT administrators and CEO. The previous separate home map is removed.

A management mode link appears only when at least one management workspace has an
allowed child. Management workspaces follow the approved nine-item order; empty groups
are omitted. Each child checks its route capability, plus a stricter capability for
shared organization/announcement management links. A URL mode hint is presentation,
never authority. Team Leaders receive only team leave/weekend review and team projects;
no global leave ledger, expenses, private HR, certificates or contracts are added.

Existing paths and controls remain available:

| Workspace | Existing functionality |
| --- | --- |
| Home | Profile, own HR documents, own actionable summaries, announcements and family registration |
| People | Directory, organization, existing profile tabs |
| Leave | Overview, request/history, team calendar, weekend registration, own carryover |
| Expense | Existing monthly category Grid/history, cards/routes; compatible individual entry and Excel import |
| My projects | Own assignments/details and career creation/editing |
| Certificates | Existing own request/history/download screen |
| Contracts | Existing status register and signature/detail screens |
| Assets | Existing current/outgoing/incoming/past sections and handoff actions |
| Employee management | Active/former filters, employee forms, lifecycle, onboarding/offboarding |
| Organization management | Existing organization form (EMPLOYEE_MANAGE only) |
| Leave management | Existing permitted global ledger, team review, weekend, carryover and holiday screens |
| Expense management | Existing month/person/status filters/export and lock/payment controls |
| Project management | Existing project/resource or team-scoped view |
| Certificate management | Existing review/issue queue and company information settings |
| Contract management | Existing scoped templates/creation, metadata register and seal management |
| Asset management | Existing equipment/license/account controls with each independent capability |
| Settings | Dormant birthday settings, announcement management, CEO family reception, company information, PRIVATE_HR_ACCESS migration review |

Tabs are real keyboard-accessible links with current-page state, not duplicate sidebars.
Existing within-screen tabs (expense categories, contract status, employee card) remain.
Company information is deliberately linked through the existing certificate workspace;
there is no new fictitious global settings form. No new employee license/secret surface
is introduced. Leave simulation and benefit operations have registry links that remain filtered out until their separately authorized server routes are integrated.

## Home data and security

`myPageData` still accepts no caller employee ID. Normal user session derives identity
via `current_employee_id`. The current month's claim uses explicit employee/month
filters; only its item amounts are fetched, capped at 501 so totals over the supported
500-row Grid limit fail visibly rather than truncate silently. Current holder count
also filters the authenticated employee even when RLS grants broader management reads.
These independent queries join the existing bounded parallel summaries. Unknown/error
values are not represented as zero; unverified leave remains visibly excluded.

No database, capability, Storage, immutable completion, grant policy, Gmail or cron
changes. No cross-user caching or service credentials. Own counts retain existing
DB row policies. Current holding count includes equipment pending recipient acceptance,
because the current holder does not change until acceptance; the asset
workspace continues to show transfer state explicitly.

## Verification

- Navigation/permission unit tests: all 127 nonempty additive role combinations,
  exact full menus, restricted specialist children and detailed active-state mapping.
- Existing My Page DB test extended with expense cross-user and manager self-filter checks.
- Browser tests: root/alias, forged employee/mode hints, own data, role-mode switching,
  team direct URL denial, task reachability, desktop/mobile screenshots.
- Updated prior sidebar regression for the eight-workspace IA.
- Local focused unit/DB, lint/typecheck results reported at handoff. Production build,
  full browser/regression and CI run by the canonical integration owner; screenshots
  are generated by tests, not claimed before execution.
- Screenshot outputs: `issue51-home.png`, `issue51-admin.png`, `issue51-mobile.png`.

Actual hosted Google-session UAT remains separate from local mock/DB/browser evidence.

Home publication follow-up: the company section also renders the latest three actual
published announcement titles, Seoul publication dates and detail links. The normal-session
query selects only id/title/published_at, filters published_at <= server now (excluding
null drafts and future dates even for managers), orders deterministically and limits to
three. Empty, loading and failure states are distinct. Announcement body is not fetched.
DB coverage checks publication filtering for employee/leader/admin/CEO; browser coverage
checks the three-row limit and manager draft exclusion. No announcement policy is widened.
