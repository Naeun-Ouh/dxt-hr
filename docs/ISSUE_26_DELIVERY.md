# Issue #26 — Expense Grid usability correction

## Scope and behavior

Based on main `c43c07f` (merged expense Grid and asset transfers). Payment dates,
lock/paid rules, dining allowances and warning/no-approval policy are unchanged.
Google OAuth remains enabled; automatic Gmail and cron remain inactive.

- Amount editing keeps a local text buffer while focused, selects the old value on
  focus, and formats integer KRW on blur. The previous generic input coerced every
  edit immediately and converted invalid characters to zero. Single-cell numeric
  paste also incorrectly entered the multi-row append path for persisted rows.
  The formatting transition also needs selection after the DOM update and the first
  mouse-up; otherwise an existing amount receives inserted digits. The dedicated numeric editor accepts digits/comma paste, preserves Enter/Tab edits,
  and leaves invalid/empty input visibly invalid and unsavable, never silently zero.
  FUEL/TOLL remain read-only in the Grid and are calculated on the server.
- Usage dates use native `input type=date` with ISO values, selected-month min/max
  and the current Seoul date as the upper bound. Domain/server date validation and
  Excel date parsing remain independent of native control constraints.
- One local search matches merchant, description and project/trip text. The compact
  filter panel has date, account, purpose and amount bounds; count/reset/sort require
  no server requests. Existing DXT tokens/buttons are reused without dependencies.
- One monthly 첨부파일 section replaces row evidence controls. Multiple selection,
  drag/drop, file names/sizes/status, private downloads and removal are supported.
  Submit saves the working Grid, reruns server validation and requires at least one
  ready monthly file. Failed saves never submit. Warnings keep their prior behavior.

## Migration and compatibility

Apply `20261123141334_expense_monthly_attachments.sql` after all prior migrations.
No applied migration is modified. `expense_attachment.claim_id` remains the collection
boundary; `expense_item.attachment_id` stays nullable and legacy references are retained.
The per-item submitted-evidence trigger is removed. Submission checks for a ready,
nonremoved file on the claim instead of checking each item.

Removal records `deleted_at` and an audit event. It does not break historical FKs or
physically delete Storage objects. Removed metadata/objects are excluded by RLS and
cannot be finalized again. Existing active item-linked evidence remains readable.
Employees may replace/remove monthly evidence during the existing editable window,
including after submission; a later submission still needs a ready file. There is
no new approval or resubmission requirement for an already submitted claim.

## Bounds, partial failure and security

- PDF, PNG, JPEG; signature/MIME/filename/size validation on the server.
- 10 MiB per file; 20 active files and 100 MiB per claim (including reservations).
  The DB serializes reservation counts on the same claim lock as lock/pay/submit.
- A multiple-file server action processes files independently and returns explicit
  per-file successes/failures. The UI sends batches up to 15 MiB under the existing
  17 MiB Next.js request limit. Successful files remain after a partial failure.
  Failed reservations are removed if the claim is still editable; incomplete rows
  remain visible if a concurrent payment lock prevents cleanup.
- Server actions derive identity from auth, explicitly check own claim, then call
  checked RPCs. Client employee IDs and arbitrary form fields are rejected.
- Reserve/finalize/remove recheck editability under the parent lock. Finalize verifies
  stored size/MIME and a nonremoved reservation after acquiring that lock.
- RLS denies other employees' metadata/objects, including known UUID/path requests.
  No Storage update/delete grant, public bucket or reusable URL is introduced.
  File downloads retain server authorization and `private, no-store` responses.
- Privileged SQL has an empty search_path and explicit ownership checks. New RPC
  execute is revoked from PUBLIC/anon; table writes remain revoked from employees.

## Evidence and limitations

Synthetic DB and browser fixtures cover the requested typing/save/reload/two-file/
submit journey, replacement/comma paste/invalid input, local filters/date bounds,
monthly evidence requirement, legacy links, partial failures, own removal, cross-user
and anonymous access, file limits and payment/lock boundaries. Local lint, production build and typecheck passed; 86 unit/database and 67 browser
tests passed, including assets/transfers, contracts and company seals. Screenshots
are in `docs/screenshots/issue26-{amount-editing,date-picker,compact-filters,monthly-attachments}.png`.
GitHub CI status is recorded in the PR.

Local PGlite and mock Auth/Storage tests do not claim hosted staging acceptance.
Native calendar popups vary by browser/OS. Verify the deployed provider's HTTP upload
size ceiling (in addition to Next.js limits) and real 10 MiB files in staging.
Removed private objects require a future retention/cleanup policy; no automatic
purge/cron is introduced by this change.
