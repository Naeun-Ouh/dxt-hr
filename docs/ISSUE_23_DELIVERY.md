# Issue #23 — Monthly expense Grid

## Scope and architecture

`/expenses?month=YYYY-MM` is the primary employee workspace. It loads only the selected
own claim, with batched attendee/vehicle reads. Existing single-entry, import and detail
URLs remain compatible but are removed from primary navigation. The existing DXT shell,
indigo actions and white table surfaces are reused. No new dependency or paid grid runtime.

React keeps a working copy in memory (never localStorage). Inputs do not write to the
server. Stable row IDs survive sorting/filtering. Memoized rows skip unrelated renders.
The view supports add, duplicate, multi-delete, reset, plain-text TSV paste, copy,
Enter/Tab navigation and Escape cancellation. Maximum 500 rows per workspace/save.
Pasting onto a persisted row appends new rows; it never overwrites persisted data. Sorting/filtering makes paste append new rows only.
An explicit save sends the entire snapshot plus versioned deletions. A stale snapshot
is rejected, not merged or silently retried. A lost successful response cannot duplicate
items: UUIDs, claim uniqueness and claim/item versions reject the retry. Refresh to load
the authoritative result. Reset restores the last successful save, including deletions.

## Validation, persistence and policy

New migration `20261120124228_expense_grid_workspace.sql` follows current-main company
seal migrations and the separate, still-unmerged PR #20 asset timestamp. No existing
migration changed. Migration does not depend on asset transfers and works with either
merge order. Existing permissions/capability functions, RLS and Storage policies remain.

- Controlled account Master uses the documented 15 workbook categories plus existing
  `기타`/OTHER compatibility mapping. Authenticated linked staff can read; no client writes.
  UI loads the master; application validation mirrors its versioned vocabulary.
- `attachment_id` may be null in DRAFT to support save → attach → submit. Submission
  requires a ready receipt in the same claim for every item. One combined PDF can be
  linked to multiple selected items; original object paths stay immutable/private.
- `save_expense_grid` takes the existing global dining advisory lock, then the claim row
  lock; checks identity, month, claim version, every item/deletion UUID/version, complete
  snapshot coverage, duplicate IDs and allowed fields before committing any change.
- Bulk save releases this claim's previous dining allocations first, allowing valid
  redistribution independent of row order, then reuses the checked item writer. Any
  invalid row/allocation rolls back the entire transaction, including deletions.
- Vehicle amount is recalculated in PostgreSQL. Date, project membership, ready evidence,
  account, numeric/type constraints and cumulative attendee limits are checked again.
- Duplicate, overtime and overall dining overages remain warnings. Retroactive reasons,
  first-weekend deadline and payment-cycle calculations retain their existing semantics.
- **DXT payment/lock policy preserved (PR #24 review correction):**
  SUBMITTED stays editable through payment_date (inclusive, Asia/Seoul). LOCKED/PAID,
  locked_at or an elapsed payment period make it read-only. `expense_editable` governs
  legacy writers, receipt reservation/finalization and new bulk saves consistently.
  No approval, rejection or reopening workflow was added.
- Audit events contain actor/action/claim reference only; no receipt contents are logged.

## Excel integration

The existing hardened parser is reused unchanged for preview: ZIP limits, real legacy
side-by-side vehicle layout, SAMPLE/end/header exclusions and formula handling survive.
The primary Import action only parses; it cannot write claims/items. Parsed rows appear
in the Grid with filename and origin metadata and can be edited before saving. Appending
and replacing unsaved new rows are deliberate choices; saved rows and local edits to
saved rows are retained. Structural parsing failures block import so skipped/unparsed
records cannot silently disappear. Row validation errors are editable in the Grid.

New summary-only vehicle imports must be completed with route/one-way/count details in the Grid. Existing legacy summary rows retain their original amount until converted to structured detail; changing that amount without detail is rejected.

The selected-month template includes the authenticated employee name. Saved monthly
export reauthorizes ownership/capability and includes the existing complete accounting
sheet plus familiar `지출결의서` and `주유비,통행비` sheets. Exports are literal cell strings,
not formulas. This preserves legacy columns/calculations, not pixel-identical old merged
cell styling. Unsaved edits are explicitly excluded from export.

## Security and verification

Server actions derive identity from the authenticated employee link; client employee/user
fields cannot change ownership. DB writers repeat the same ownership checks. Admins can
review/export/lock/pay but cannot author another employee's rows. TEAM_LEADER receives no
team-expense access. Receipt proxy and direct Storage RLS remain private and cross-user
isolated, with `private, no-store` download responses.

Tests cover Grid operations/paste/errors/import choices, current and server totals,
vehicle details, stale snapshots, rollback, missing evidence, submission/locks, cross-user
claim/item/deletion/receipt attempts, forged ownership/unknown fields, manager boundaries,
and dining redistribution. Existing expense/parser, assets, contract and seal suites
remain regression coverage. Screenshots use synthetic data only:

- `screenshots/issue23-employee-grid.png`
- `screenshots/issue23-import-grid.png`
- `screenshots/issue23-vehicle-detail.png`
- `screenshots/issue23-submitted-grid.png`
- `screenshots/issue23-admin-grid.png`

Final counts and CI links are recorded in the PR.

## Remaining operational checks

Local database tests use PGlite; browser tests use real Next.js/Chrome against the mock
Auth/Storage adapter and PostgreSQL RLS/functions. These are not hosted staging acceptance.
True simultaneous database connections, real Google OAuth/Supabase Storage, a real legacy
workbook and tax-office Excel layout acceptance remain staging checks. Deploy the new
migration before the UI. Failed uploads can leave unused private attachment reservations;
no automatic object deletion or cron was introduced. Working copies are memory-only and
must be saved before leaving; browser unload and month changes warn about dirty state.
No historic data migration, automatic Gmail, cron, Phase 4B or corporate-card workflow.

## Review correction: existing payment/lock policy

Rebased on main `521ea36` (merged DXT Design System). The existing Grid migration is
unchanged. Apply `20261120135814_restore_expense_payment_edit_window.sql` after it:
`expense_editable` again admits the owner in DRAFT or SUBMITTED, through payment_date
inclusive in Asia/Seoul, unless locked_at is set. LOCKED/PAID always deny editing.
All legacy writers, Grid saves and receipt reservations/finalization share this helper.
The new trigger preserves mandatory evidence on submitted item edits; draft evidence
remains optional. Server actions repeat ownership/editability and evidence checks.
Payment scheduling, first submitted_at, claim state, optimistic versions and atomic
Grid snapshots are preserved. No approval/reject/reopen workflow is introduced.

The UI now explains the post-submit edit window, saves changes directly to the same
submitted claim and uses DXT StatusTag for state. It does not offer a redundant submit
button after submission. Admin review remains read-only with its existing lock/pay
controls. Tests cover inclusive payment day, elapsed payment period, explicit locks,
paid state, evidence and cross-user denial, plus a stale open editor after admin lock.

A separate synthetic compatibility run applied PR #20's asset-transfer migration before
both expense migrations: all 6 asset-transfer database tests passed. Their timestamps
are ordered; no PR #20 merge or applied-migration edits are needed for this update.
Hosted Supabase advisors/staging were not run; this task does not touch a hosted database.
