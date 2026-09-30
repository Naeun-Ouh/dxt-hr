# Phase 5 — expense vertical slice

Implements Issue #5 from main `8538b1b`, including the latest issue comment
https://github.com/Naeun-Ouh/dxt-hr/issues/5#issuecomment-5912832013.

## Routes and workflow

- `/expenses`: own monthly items, submitted total, deadline, evidence, status and filters.
- `/expenses/new`: direct entry, conditional dining attendees and vehicle fields, evidence upload.
- `/expenses/[id]`: own claim, warnings, evidence, item editing and monthly submission.
- `/expenses/items/[id]/edit?claim=...`: owner-only, versioned editing until payment lock.
- `/expenses/upload`: original workbook → server validation → ERROR/WARNING preview → atomic import.
- `/admin/expenses` and `/admin/expenses/[id]`: company expense review, month/employee/status/warning filters, lock/payment actions.
- Authenticated `/api/expenses/template`, `/api/expenses/export`, `/api/expenses/receipts/[id]` downloads.

There is no team/PM approval, rejection, corporate-card flow or HR-private information in these screens.

## Persistence and isolation

Migration `202610010006_expenses.sql` adds claims, items, attendees, normalized vehicle details and attachment metadata. Totals are derived from items; vehicle totals always derive from one-way amount × trip count. Warnings are recomputed from persisted source data instead of persisting stale copies. Imported filename, sheet/row origin and import time are retained.

Claims, items, attendee/vehicle details and attachment metadata have SELECT-only authenticated grants with RLS. Checked SECURITY DEFINER RPCs with empty search paths perform mutations; PUBLIC/anon execute is revoked. Employee identity comes from `auth.uid()` and the trusted employee link, never a form field. TEAM_LEADER/IT_ADMIN/DIVISION_HEAD cannot read team/company expense records. EXPENSE_ADMIN and the explicitly documented ADMIN/CEO expense capability can read all and manage payment state, but cannot author another employee's items.

Dining allocations are positive integer won, at most ₩30,000 per attendee per usage month, including drafts and claims from other submitters. Users explicitly allocate allowance rather than the system inventing an equal split. The claimed amount remains unchanged; a combined amount over ₩30,000 × attendee count warns. Allocation sums cannot exceed the claim item's amount. An advisory transaction lock serializes allocation changes across submitters; updates release only that item's previous allocation. Preview reports availability without returning other employees' claims, receipts or allowance usage details. Registration rechecks under the transaction lock.

Receipts use the private `expense-evidence` Supabase bucket. Upload reserves an immutable object path under an owned editable claim; finalization verifies stored size/type. Items require a ready attachment in the same claim. One combined PDF can serve multiple items. Storage RLS independently checks authorization; no authenticated overwrite/delete policy exists. Downloads proxy authenticated reads with `private, no-store`, attachment disposition and no reusable signed/public URL. Failed uploads/imports may leave an unused private attachment reservation; no evidence is deleted automatically.

Submission and item changes, admin locking and payment changes generate metadata-only audit events. Paid/locked records cannot be reopened through this UI or RPCs. Versions reject stale edits.

## Timing interpretation

All policy dates use Asia/Seoul. Deadline is the first Sunday of the following month (the end of its first weekend, including a month starting Sunday). Submission after the deadline warns. Claims two or more months old require a reason.

Submission assigns the earliest available 15th on or after submission, no earlier than the 15th following the usage month. This preserves retroactive submission without making a new late claim immediately uneditable. Employees can edit through that payment date, then the claim is read-only even without an admin visit. Explicit lock/payment makes it read-only immediately. Drafts have no assigned payment cycle. Existing paid claims in the same usage month remain closed.

TODO(policy): the brief confirms 2–3 month retroactivity but does not define an older-claim cutoff. Older claims also require a reason and warn; no unapproved hard rejection is introduced. The payment-cycle interpretation and first-Sunday calculation should be confirmed during operational rollout.

## Excel contract

The downloadable two-sheet template uses the approved Korean columns plus employee-friendly purpose, payment indicator and explicit dining allocation fields. `지출결의서` includes usage-month metadata and ordinary rows. `주유비,통행비` has dated fuel/toll detail rows. Dining attendees use `email:allocated_won`, separated by semicolons. Receipt bundles are attached separately.

The legacy side-by-side vehicle layout is supported by locating semantic `편도 주유비` / `편도 통행비` headings and their context/origin/destination/count columns. F/N totals, including the known D×D and K×L errors, are never read. When details exist, Sheet 1 fuel/toll summary rows are omitted to avoid double counting. When no details exist, a Sheet 1 summary is imported once with explicit legacy-summary provenance and a warning to check amount/evidence. Direct entry and subsequent edits require structured details; new manual cross-sheet copying is never needed. For legacy vehicle rows without dates, the upload screen requires a supplied vehicle usage date; it does not invent a day from a monthly total. Date/amount/schema/formula input errors block registration. Formula cells in computed vehicle totals are ignored; formula cells in ordinary data inputs must be replaced with values.

Files are limited to 5 MB, actual decompressed entries to 20 MB each / 30 MB total, 1000 rows / 50 columns per sheet and 500 imported items. Macros, external links and embedded packages are rejected. Stored strings export as literal text, not spreadsheet formulas. The accountant export includes employee, accounting category, dates, amount, project/trip, route calculation, attendee allocations, evidence references, warnings, lifecycle state and import traceability.

The original binary legacy workbook is not present in this checkout. Tests reconstruct its documented headings, side-by-side layout and broken formulas from the approved brief/comment. Verify the real workbook on staging before operational migration; the new official template is generated and round-trip tested.

## Design and verification

Figma frames 18 (`36:2`), 19 (`36:179`), 20 (`36:331`), 21 (`36:511`) and expense states in 37 (`48:2`) informed the implementation. Existing exact sidebar icons and shell assets are reused. The common shell keeps its established header; content uses responsive layout instead of the design's overlapping absolute header coordinates. Required real fields and functional upload controls expand the prototype forms.

Screenshots: `docs/screenshots/phase5-*.png` (own list, entry, mobile entry, vehicle fields, validation, dining and administration).

Checks: lint, unit/database tests, production build, typecheck, full Playwright suite. Database tests execute migrations and RLS in PGlite. Browser tests use the production Next build against an isolated Auth/PostgREST/Storage double backed by those migrations, never an application auth bypass. They cover cross-user URLs/RSC, receipt URLs and storage reads, forged submitter IDs, direct RPCs, replay after session switching, specialist scope, entry/edit/evidence, imports, dining allowance reuse, export and payment locking.

## Staging deployment verification

Apply migration 006 after 001–005 to Supabase (including the storage schema). Confirm the evidence bucket remains private and no pre-existing broad Storage policy grants access to it. Link test accounts to active employee profiles. Exercise real Auth cookies, Storage upload/finalize/download, two different employee sessions and an expense administrator. Repeat the real legacy workbook import and accountant export. Verify late/retroactive and payment-boundary behavior with staging data. No live Supabase credentials were available for this local implementation.
