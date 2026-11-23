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
version and DRAFT-state checks in PostgreSQL. Evidence may be absent while drafting but is
required on submit. SUBMITTED retains the existing payment-date edit window, including legacy writer RPCs.
LOCKED/PAID, locked_at and elapsed payment periods deny all employee writers.
