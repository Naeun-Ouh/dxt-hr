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
