# Issue #19 — possession history and confirmed handoffs

Extends Figma frames 22/23 using the existing asset cards, forms, tables and shell.

## Delivered behavior

- `/assets/me` and `/assets/me/[id]`: current equipment, outgoing confirmation
  pending, incoming equipment and own closed assignment history. Current holders
  register an ACTIVE recipient, actual handoff date and optional memo. Outgoing
  pending equipment no longer appears as currently in use on the personal screen.
- `/admin/assets/[id]`: transfer participants/state, handoff/request/confirmation
  dates, force-confirm/cancel, complete assignment and operational event history.
  Resolve pending transfers before ordinary metadata/holder edits. Manager corrections
  remain immediate and audited, preserving prior periods.
- Recipient confirmation is receipt acknowledgment, not an approval chain. Employee
  cancellation/rejection policy is not invented; managers handle cancellation/correction.

## Schema and transitions

Apply `supabase/migrations/20261120122253_asset_transfers.sql` **after `20261120030704_company_seals.sql`**
and before deploying the updated application. No historical migration is edited.

`asset.status` remains IN_USE / AVAILABLE / REPAIR / LOST / DISPOSED. Assignment
`state` derives from its open/closed period (ACTIVE / RETURNED); dedicated
`asset_transfer.state` holds PENDING / CONFIRMED / CANCELLED. A pending transfer
leaves the sender as the single current holder. Confirmation closes that exact
assignment and creates the recipient's assignment atomically. Cancellation leaves
its original assignment open. The handoff date is interpreted in Asia/Seoul;
same-day handoffs cannot end before the original assignment timestamp. Actual
confirmation time is stored separately.

Migration preserves assignment IDs, employee IDs, start/end times and actors.
Type/model/serial snapshots let former holders read historical equipment without
accessing the current asset row. Existing snapshots use metadata available during
migration; historical model/serial edits cannot be reconstructed. Closed assignment
periods cannot be edited or deleted. New explicit event types preserve the old event
rows and distinguish assignment, return, status change, handoff and correction.

All asset write paths serialize on the asset row (save/request/resolve also share an
advisory lock). The existing partial unique index prevents two open assignments;
a second partial unique index prevents two pending transfers. Recipient creation,
sender closure, asset pointer, transfer resolution and audit/event writes occur in
one transaction. Repeated confirmation cannot append another period/event. Request
retries require the same UUID, authenticated sender and exact payload. Changed
payloads, stale periods and resolved-state conflicts fail closed.

## Authorization and portability

- Server actions authenticate, check capabilities and query the exact holder or
  recipient scope before invoking a mutation. RPCs independently derive identity
  from `auth.uid()` and recheck ownership, ACTIVE recipient and current state.
- Asset RLS remains current-holder-or-ASSET_MANAGE. Assignment RLS allows only own
  periods; transfer RLS allows only sender/recipient. Management capability adds
  company-wide visibility. Historical/incoming snapshots do not grant access to
  other holders' assignments or to management-only events.
- All personal screens explicitly filter by current employee even for managers;
  client employee/user query parameters are ignored. Direct table writes and anonymous
  mutation execution are revoked. The public checked RPC pattern follows the existing
  repository, with restricted EXECUTE and fixed empty search paths; no service key is
  used by application actions.
- Standard PostgreSQL tables, functions, constraints, row policies and transactions;
  existing internal auth/client boundaries; no new proprietary workflows or services.
  Google OAuth and disabled automatic Gmail/cron are unchanged. Vault/private HR,
  advanced leave and legacy Notion import are outside this slice.

## Validation and evidence

Final local checks (2026-11-17): lint, build, typecheck, 60 unit/database tests and
50 browser tests passed.

Local verification uses synthetic data only: PGlite executes the migration chain
and PostgreSQL RLS; the browser runs production Next.js against the existing test
Auth/PostgREST adapter. It is not live Supabase/Google/Vercel verification.

Coverage includes migration preservation, forged asset/assignment/recipient IDs,
wrong recipient/sender confirmation, inactive recipients, replay, unique holder and
pending transfer, cancel/force/correction, own historical RLS, later third-party
transfer isolation, direct URL/query/RSC/API attempts and session-switched server
actions. Fault injection during recipient insertion proves closure/pointer/event
changes roll back. Competing calls are queued transactions in embedded PGlite, not
independent networked PostgreSQL sessions; verify true concurrent sessions in staging.

Screenshots: `docs/screenshots/issue19-{outgoing,incoming,history,mobile,admin-pending,admin-history}.png`.
The established shared shell is reused; no new static design assets are introduced.

Before staging acceptance, apply this migration to the isolated test project, run
separate sender/recipient/third-employee and ASSET_MANAGE sessions through real
PostgREST, and concurrently confirm/cancel from two connections. Existing Issue #14
staging evidence is preserved; this delivery does not claim new hosted validation.

## Current-main rebase (2026-11-20)

Rebased onto `dba7fbe19d3b721297c6962e3ad24d3366664610` (merged contracts #21 and
company seals #22). Combined both permission/UI/CSS additions and the browser test
adapter's table/RPC allowlists. Contract/seal runtime, security checks, Storage proxy
behavior and existing contract/seal test files are unchanged from main.

The unmerged asset migration was re-timestamped using Supabase CLI to
`20261120122253_asset_transfers.sql`, after `20261120030704_company_seals.sql`.
Its SQL is byte-identical to the original PR migration. No migration already in main
was changed. Asset DB fixtures now build on the complete contract/seal migration
chain; browser tests run both domains together. No hosted migrations were applied.
If the earlier unmerged asset timestamp was manually applied to any environment,
reconcile that environment's migration history before deployment; do not apply both
copies. Do not rewrite existing applied contract/seal migrations.

Full local results and remote CI links are recorded in the PR, with the updated head
SHA. Synthetic fixture checks remain distinct from hosted staging acceptance.
