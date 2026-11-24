# Issue 28 — Expense UX and personal card identification

Based on main `0f36169` (PR #30), retaining DXT Design System v2 / compact enterprise
workspace. Changes are confined to the expense domain. No dependency, shell, global
navigation, approval/payment policy, Gmail, cron or unrelated domain changes.

## Employee experience

- Validation status opens keyboard/touch-accessible inline reasons, with all row
  errors/warnings and field-specific required-field highlights. Correcting a field
  clears that reason. Policy calculations remain unchanged.
- Excel uses the shared native Modal. Preview is isolated application state. The
  selected month is fixed; parse shows row/error/warning counts and card mapping.
  Only **Grid에 반영** applies rows. Cancel/Escape, changing the file/options, and late
  asynchronous responses cannot silently append rows. Replace preserves saved rows.
  Legacy vehicle dates appear only after detecting undated legacy vehicle details.
- Generic 상세 action is removed. Fuel/toll use **이동 상세 입력/수정** and dining uses
  **참석자 설정**, both in the shared Drawer. Payment, notes, project and evidence-type
  controls remain directly available without changing their underlying policies.
- **영수증 증빙파일 업로드** uses the requested helper copy. Monthly multiple upload,
  drag/drop, private downloads and deletion/payment cutoffs are preserved.
- **카드 관리** opens a small own-card Drawer; register/update/deactivate only issuer,
  nickname, four digits and active status. No full card numbers or authentication data.
- The Grid selects a registered active card or cash. Legacy unassigned personal-card
  items remain readable/editable as 개인카드(미지정). Admin Grid is still read-only.

## Database / authorization

New migration: `20261124125833_expense_payment_cards.sql`.
- Own-only RLS on card metadata; no direct authenticated INSERT/UPDATE/DELETE grants.
- `save_expense_payment_card` derives identity, allowlists JSON keys, checks optimistic
  version, and audits register/update/deactivate. No client employee or actor accepted.
- Existing bulk/legacy save RPC authorizes claim ownership and payment window, then
  checks card owner/active state. `FOR SHARE` serializes card deactivation/metadata
  update against item saves. Cash references and forged snapshots are rejected.
- Nullable item FK + DB-generated masked label. Historical null IDs are untouched.
  Existing card snapshots survive metadata changes/deactivation. No hard deletion.
- Managers read item snapshots through existing expense RLS, not another employee's
  card collection. No new admin capability or storage grant.
- All security-definer functions have empty search_path, explicit identity checks,
  PUBLIC/anon EXECUTE revocation and narrowly granted authenticated entry points.

## Workbook compatibility

The familiar general/vehicle sheets and legacy column order are retained; 결제카드 is
added. 카드선택목록 contains only the authenticated employee's active cards. Import key:
`카드사 · 별칭 · 끝4자리` (exact display text). Duplicate display keys produce an error;
rename a nickname or correct the Grid selection. Unknown/inactive/UUID values never
silently map. Cash clears the reference, and old templates without a card column stay
unassigned. Both general and normalized vehicle rows support mapping. Exports include
frozen masked labels in normalized/accountant/vehicle sheets. Archive size, formula,
external-link and macro restrictions are unchanged. No Excel macros/dropdown dependency.

## Verification

Local checks: lint, production build, typecheck, **90 unit/DB tests** and **75 browser tests** pass.
Screenshots: `screenshots/issue28-card-register.png`, `issue28-card-management.png`,
`issue28-validation.png`, `issue28-import-preview.png`, `issue28-grid.png`.

Tests use synthetic identities, PGlite
with real SQL/RLS/RPC, a test-only Auth/PostgREST/Storage double and real Chrome. This
is local integration evidence, not hosted Supabase/Google/Vercel staging acceptance.

New negative coverage includes cross-user card reads/mutations, forged employee and
credential fields, direct/anonymous writes, stale versions, foreign-card/claim use,
inactive use, forged snapshots, payment locks, retained history and ambiguous workbook
mapping. Browser tests cover registration/selection/reload, scoped API and stale-session
server actions, validation reasons/corrections, isolated preview/cancel/confirm and
unknown-card correction. Existing asset/contract/seal/evidence regressions remain.

## Deployment and limits

Apply the additive migration before deploying the application; hosted migration is not
applied by this task. Card deactivation does not invalidate existing submitted records
or prevent reading/exporting them. A subsequent full Grid save requires active cards
on its submitted rows; reselect a current card/cash or reactivate the card first.
Legacy single-item edits preserve an omitted card reference; cash clears it.
No automatic card deletion, reconciliation/provider integration or card-number storage.
Existing monthly attachment transport/storage/staging limitations remain as documented
in Issue 26. No automatic merge.
