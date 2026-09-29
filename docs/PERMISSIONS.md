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

## Navigation

- Unauthorized routes should fail permission checks server-side.
- Unauthorized menu items should not render.
- Do not show locked/disabled menu items to indicate inaccessible areas.
