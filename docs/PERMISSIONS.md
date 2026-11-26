# Roles & Permissions

## Roles

- EMPLOYEE
- TEAM_LEADER
- DIVISION_HEAD
- EXPENSE_ADMIN
- HR_ADMIN / ADMIN
- IT_ADMIN
- CEO

Roles are additive.

## Core capability rules

### EMPLOYEE
- Own profile/basic data
- Employee directory/organization as allowed by product UI
- Own projects
- Own career edit
- Own leave + team calendar
- Own expenses
- Own equipment
- Announcements / family events

### TEAM_LEADER
Employee capabilities plus:
- Own team leave requests and approval
- Own team leave reason visibility
- Team project view
- Team career/project visibility where specified
- No team expense visibility

### DIVISION_HEAD
Exact broader permissions are not finalized.
Implement no broader sensitive access by default.
Use explicit capability checks and leave unresolved capabilities as TODOs.

### EXPENSE_ADMIN
Employee capabilities plus:
- All expense detail
- Validation review
- Export
- Submission/payment lock administration

Must not inherit HR Private, asset secret, or team-leader permissions automatically.

### IT_ADMIN
Employee capabilities plus:
- Equipment management
- Windows license management
- Account/login management

Must not inherit HR Private or expense access automatically.

### ADMIN
- Broad operational administration
- Employee/project/leave/expense/asset/onboarding/offboarding/settings
- Sensitive HR only if granted PRIVATE_HR_ACCESS

### CEO
- Broad/global access
- Sensitive HR
- Resignation reason/document

## Sensitive capabilities

### PRIVATE_HR_ACCESS
Granted only to:
- CEO
- one designated ADMIN

Covers:
- resident registration number
- bank account
- salary
- full address
- emergency contact
- other private HR fields

TEAM_LEADER / EXPENSE_ADMIN / IT_ADMIN / DIVISION_HEAD do not inherit this.

### WINDOWS_KEY_REVEAL
Default:
- IT_ADMIN
Optionally CEO/Admin only if explicitly granted.

### ACCOUNT_PASSWORD_REVEAL
Default:
- IT_ADMIN
Optionally CEO/Admin only if explicitly granted.

### RESIGNATION_REASON_ACCESS
CEO only.

## Data isolation — mandatory

This is a core HR security requirement and applies to every domain.

### Own-data default
Unless a broader capability is explicitly granted:
- an employee may read only their own expense records;
- an employee may read only their own detailed leave request/reason data;
- an employee may read only their own equipment assignment details;
- an employee may read only their own personal/private operational data;
- knowing another employee's URL, ID, UUID, query parameter, or API endpoint must never grant access.

### URL/API tampering
Authorization must not depend on navigation visibility or client-side checks.
Direct access attempts using another employee's URL, changed query parameters, forged form IDs, or direct Server Action/API/RPC calls must be rejected or return no unauthorized data.

### Required enforcement layers
For protected domain data, implement all applicable layers:
1. UI/menu visibility.
2. Server-side route/action/API capability and ownership checks.
3. PostgreSQL/Supabase RLS or equivalent database row-level enforcement.

A page-level guard alone is not sufficient.

### Role examples
- EMPLOYEE: own expense detail only.
- TEAM_LEADER: does not gain team expense access.
- EXPENSE_ADMIN: may access all expense records required for expense administration.
- IT_ADMIN: does not gain expense or HR Private access.
- ADMIN/CEO: only the explicitly documented domain capabilities apply.
- HR Private remains separately protected by PRIVATE_HR_ACCESS.

### Testing requirement
Every domain PR that contains employee-specific or sensitive records must include negative authorization tests proving that:
- User A cannot fetch User B's restricted records.
- Direct URL access is denied.
- Direct API/Server Action/RPC calls are denied.
- A manipulated employee_id/user_id cannot bypass ownership checks.
- Specialist roles cannot read unrelated domains.

## Navigation

- Unauthorized routes should fail permission checks server-side.
- Unauthorized menu items should not render.
- Do not show locked/disabled menu items to indicate inaccessible areas.

## Employment contracts

- `EMPLOYMENT_CONTRACT_MANAGE`: ADMIN/CEO; operational metadata, send/cancel.
- `EMPLOYMENT_CONTRACT_PRIVATE_ACCESS`: derived from existing PRIVATE_HR_ACCESS
  (CEO and the single designated ADMIN), never an implicit grant to every ADMIN.
  Required for templates, creation/revision, document preview, all-employee body/PDF access.
- `EMPLOYMENT_CONTRACT_COMPANY_SIGN`: CEO only, after employee signature.
- An ACTIVE linked employee may read/sign their own sent contract regardless of their
  other additive roles. ADMIN/CEO never gain the ability to sign *for another employee*.
- TEAM_LEADER has no team contract scope. Specialist roles have no broader scope.
- Snapshots and operational dates are visible to contract managers; encrypted versions,
  signature evidence and PDF contents require own/private scope. Drafts are private.
- Employee signature RPC directly joins auth.uid() to employee.auth_user_id and the
  contract employee_id, and requires a Google identity. Client employee/role parameters
  are never accepted for signing. Company signing uses an independent checked RPC.
- No authenticated Storage access, including CEO: downloads reauthorize on the server.

Signature evidence v2 additionally freezes the DB-authenticated email, Google provider
and validated auth session UUID. These values cannot be supplied to signing RPCs.
Historical v1 evidence is preserved without fabricated backfill.

Company seal management uses `EMPLOYMENT_CONTRACT_MANAGE` (ADMIN/CEO), including the
ordinary ADMIN without private contract access. RLS restricts seal metadata/events;
checked RPCs perform mutations. The private `company-seals` bucket exposes no direct
authenticated reads/writes. Only a manager-authorized server preview returns raw PNG;
employees see a seal solely inside their authorized final contract PDF. This does
not broaden contract body, signature or employee-history access.

## Asset possession and transfers (Issue #19)

- Employee: current asset row only while current holder; own assignment periods,
  including closed history; transfer rows only when sender or recipient.
- Historical and incoming equipment use metadata snapshots. They do not grant access
  to the current asset row, other holders' assignments or management-only asset events.
- Creating a transfer requires the caller's linked ACTIVE employee identity to match
  the current holder and exact open assignment. An ACTIVE recipient must differ from sender.
- Only the intended recipient can confirm normally. The sender cannot impersonate receipt.
- ASSET_MANAGE (ADMIN / CEO / IT_ADMIN): all asset history; explicit force-confirm or
  cancel; corrections retain periods and events. Pending transfers must be resolved
  before ordinary metadata/holder edits. New assignments still require an ACTIVE employee.
- No employee cancellation/recipient rejection policy is introduced; refer corrections
  to an asset manager. No additional approval chain is added.
- `/assets/me`, including manager sessions, applies explicit own filters server-side.
  RLS and checked RPCs independently enforce scope. Direct authenticated table writes
  remain revoked; all mutation identities are derived from `auth.uid()`.

Expense Grid preserves owner-only authoring. EXPENSE_MANAGE allows review/export/lock/pay,
never writing another employee's Grid. Bulk mutation repeats identity, claim/item ownership,
version and payment/lock checks in PostgreSQL. Monthly evidence may be absent while drafting but at least one ready file is
required on submit. SUBMITTED retains the existing payment-date edit window, including legacy writer RPCs.
LOCKED/PAID, locked_at and elapsed payment periods deny all employee writers.

## Expense monthly attachments — Issue #26

Monthly claim attachments replace per-item evidence requirements in the primary Grid.
Submission requires at least one ready active claim attachment. Existing item links
remain for compatibility. Grid and attachment edits follow the same existing payment/lock
window. See `ISSUE_26_DELIVERY.md` for limits, removal semantics, security and UX.

Expense card registration is employee self-service, not an admin capability. Both
server actions and checked RPCs derive the employee from the authenticated identity.
RLS allows only own-card reads, and direct table writes are revoked. Expense managers
see only the frozen issuer/nickname/last4 label on already authorized expense items;
they cannot browse or manage another employee's card master. Grid saves validate own,
ACTIVE card references under a card row lock. Cash cannot carry a card reference.

## Employee HR documents — Issue #33

Only PRIVATE_HR_ACCESS (CEO + designated ADMIN) can upload/archive or read all document
history. Ordinary ADMIN and TEAM_LEADER do not inherit this scope. An ACTIVE linked
employee can view/download only their own ready, unarchived BANKBOOK_COPY,
RESIDENT_REGISTRATION_COPY and RESUME; OTHER_HR remains private. Self upload is not
implemented. Server checks, row policies and checked RPCs enforce the same boundary.
No direct authenticated/anonymous Storage access, including private HR managers.

## Employment certificates — Issue 32

`HR_CERTIFICATE_MANAGE`: ADMIN/CEO only, independent from employment contracts and
PRIVATE_HR_ACCESS. Active employees request/read/download only their own; Team Leaders
have no team scope. Existing raw company seal permissions are not expanded. Both
server and RLS enforce scope; private certificate objects have no authenticated
Storage policies. See `ISSUE_32_DELIVERY.md` for lifecycle and reconciled seal policy.

### Holiday administration

HOLIDAY_MANAGE remains ADMIN/CEO only, enforced in the database and server actions.
Employees read active company-wide holiday dates/source metadata, never administrative
change events. Direct table writes and the obsolete unchecked leave-submit RPC are
revoked. New leave submission requires the server-validated calendar-year revision;
existing leave ownership, direct-team approval and reason privacy remain unchanged.

### Leave sources and birthday

Own source/ledger reads remain self or LEAVE_MANAGE only. Internal birthday preparation
and allocation are not callable by authenticated clients. Admin/CEO may explicitly
record verified sources and append reasoned corrections. No broader Team Leader ledger
access, raw birthday projection access, or wage/grant automation is introduced.
