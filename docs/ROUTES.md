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
