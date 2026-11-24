# Issue 29 delivery evidence

See [audit, reference mapping, tokens and rollout](ISSUE_29_DESIGN.md).
The implementation is presentation-only, on main edfe8f4 (PR 27 included).
Issue 28 was open with no published branch at discovery. Payment-card master,
card workbook mapping and revised import-confirmation semantics remain in Issue 28.

## Visual evidence

All images use synthetic test accounts/data. Actual DaouOffice reference image
files were not attached; the detailed Issue 29 composition brief was used.

| Module | Before 1440 | After 1440 | 768 | 390 |
| --- | --- | --- | --- | --- |
| Expense | [Before](screenshots/issue29/before-expense-1440.png) | [After](screenshots/issue29/after-expense-1440.png) | [768](screenshots/issue29/after-expense-768.png) | [390](screenshots/issue29/after-expense-390.png) |
| Employees | [Before](screenshots/issue29/before-employee-1440.png) | [After](screenshots/issue29/after-employee-1440.png) | [768](screenshots/issue29/after-employee-768.png) | [390](screenshots/issue29/after-employee-390.png) |
| Projects | [Before](screenshots/issue29/before-project-1440.png) | [After](screenshots/issue29/after-project-1440.png) | [768](screenshots/issue29/after-project-768.png) | [390](screenshots/issue29/after-project-390.png) |
| Assets | [Before](screenshots/issue29/before-asset-1440.png) | [After](screenshots/issue29/after-asset-1440.png) | [768](screenshots/issue29/after-asset-768.png) | [390](screenshots/issue29/after-asset-390.png) |
| Leave | [Before](screenshots/issue29/before-leave-1440.png) | [After](screenshots/issue29/after-leave-1440.png) | [768](screenshots/issue29/after-leave-768.png) | [390](screenshots/issue29/after-leave-390.png) |
| Contracts | [Before](screenshots/issue29/before-contract-1440.png) | [After](screenshots/issue29/after-contract-1440.png) | [768](screenshots/issue29/after-contract-768.png) | [390](screenshots/issue29/after-contract-390.png) |

[Import Modal](screenshots/issue29/after-import-modal.png) ·
[Expense Drawer](screenshots/issue29/after-expense-drawer.png).

## Boundaries

No migrations, domain libraries, server actions, API handlers, permissions or package
changes. Existing Google OAuth, RLS, private Storage, expense edit/payment cutoff,
asset transfer history, leave ledger and immutable signed contracts are retained.
Gmail/cron remain inactive. Manager asset history uses the existing authenticated
client only after the existing manager guard; personal history keeps own filters.

Large record editors and sensitive/document flows intentionally remain full pages;
less-frequent modules receive shared density rather than new bespoke workflows.
See the design audit for the per-module inventory and intentional deferrals.

## Verification

Local synthetic PGlite/HTTP/Chromium verification, not hosted staging or Human UAT.
Full lint, production build, typecheck, 86 unit/DB tests and all 71 browser tests passed locally.
After the final mobile-only search width adjustment, the production build and
4 focused visual/interaction tests also passed. GitHub CI will verify the final HEAD. New browser checks cover all six modules at three widths, modal
Tab/Shift-Tab/Escape/focus return, profile links, contract local filters, row
expansion, quick detail, compact toolbar and mobile menu behavior. Existing
security assertions remain; dimension assertions use the approved v2 tokens and
workflow tests open/close the new dialogs explicitly.

## Bundle impact

No runtime library added and no lockfile change. Native HTML/React supplies overlays,
filters and disclosures. Production static JavaScript measured 711,523 bytes raw /
216,202 bytes gzip across 13 chunks (all build chunks, not one route's transfer).
A production before/after byte delta was not captured; do not interpret this as a
per-page bundle estimate. Server-rendered authorized children avoid transferring
additional domain object graphs for contextual details.
