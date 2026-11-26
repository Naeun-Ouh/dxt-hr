# Route Map

Suggested Next.js route map.

## Employee/common

- `/` — role-aware dashboard
- `/people`
- `/organization`
- `/career`
- `/career/new`
- `/projects/me`
- `/leave`
- `/leave/request`
- `/leave/team-calendar`
- `/leave/requests`
- `/leave/weekend-work`
- `/expenses`
- `/expenses/new`
- `/expenses/upload`
- `/assets/me`
- `/announcements`
- `/family-events`
- `/family-events/new`

## Team Leader

- `/leave/approvals`
- `/projects/team`

## Expense Admin

- `/admin/expenses`

## IT Admin

- `/admin/assets`
- `/admin/windows-licenses`
- `/admin/accounts`

## Admin / CEO

- `/admin/employees`
- `/admin/employees/new`
- `/admin/employees/[id]`
- `/admin/employees/[id]/private`
- `/admin/projects`
- `/admin/projects/[id]`
- `/admin/resources`
- `/admin/leave`
- `/admin/holidays`
- `/admin/onboarding`
- `/admin/offboarding`
- `/admin/settings/birthday-email`

## Route behavior

- Navigation rendering and server-side authorization must both enforce permissions.
- Do not rely on hidden navigation alone for security.

## Employment contracts

- `/contracts/me`, `/contracts/me/[id]` — own contracts and employee signature.
- `/admin/contracts`, `/admin/contracts/[id]` — scoped management, preview and CEO signature.
- Employee detail `?tab=contracts` — own or contract-manager history only.
- `/api/contracts/[id]/pdf` — current authorization rechecked; private, no-store download.

- `/admin/contracts/seals`: ADMIN/CEO company seal upload, replacement, deactivation,
  private preview and preserved upload history (`EMPLOYMENT_CONTRACT_MANAGE`).
- `/api/contracts/seals/[id]`: manager-authorized PNG preview; private, no-store;
  no employee access or permanent object URL.

- Employee `?tab=private`: existing PRIVATE_HR_ACCESS masked/reveal panel.
- Employee `?tab=documents`: own allowed or private-HR document collection.
- `?tab=documents&history=1`: private-HR archive/history view only.
- `/api/hr-documents/[id]`: authorized private preview; `?download=1` downloads.

- `/certificates/me`: own employment certificate requests/downloads.
- `/admin/certificates`: HR_CERTIFICATE_MANAGE review/issue/settings workspace.
- `/api/certificates/[id]/pdf`: reauthorized private/no-store PDF download.

## 프로젝트 이월 검토

- `/leave/carryover`: EMPLOYEE_ACCESS, 본인 상태/사용 안내
- `/admin/leave/carryover`: LEAVE_MANAGE, 기준일 근거 및 검토 이력
