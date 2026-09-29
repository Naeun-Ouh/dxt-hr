# DXT v1 Business Rules

## Leave

### Annual leave
- Company uses fiscal/calendar-year basis.
- Under 1 year: monthly accrual behavior aligned to current Handysoft operation.
- 1+ year: statutory tenure-based additional leave applied.
- Standard expiry: December 31.
- Admin manual adjustment allowed: +N / -N, reason required, ledger record required.
- Do not model leave as only a mutable balance.

### Deduction priority
1. Substitute leave
2. Carried-over annual leave
3. Current-year annual leave

### Project-based carryover
- On November 30, employees actively assigned to a paid external customer project become carryover candidates.
- If the project ends during December, remaining leave should first be used after project end.
- Only unused balance remaining at December 31 carries.
- If project continues through year-end, remaining leave may carry.
- No fixed carryover day cap.
- Carried-over leave should be used first after project end.
- No hard 30/60-day post-project expiry in v1; keep nudging until used.

### Leave request
- Employee submits; Team Leader approves/rejects.
- Bulk approve/reject supported.
- Team Leader's own leave auto-approves.
- Same-day leave allowed.
- Past-date leave allowed; "미리 신청하지 못한 사유" required.
- Approved leave cannot be deleted by employee; Team Leader/Admin may cancel/delete.
- Full-day, AM half-day, PM half-day. No hourly leave.
- Team members may view same-team leave schedule.
- Leave reason visible only to Team Leader/Admin.

### Birthday half-day
- 0.5 day, AM or PM.
- Normal window: birthday ± 7 days.
- Weekend/public holiday birthday still uses same window.
- Outside-window exception allowed when project prevented use; exception reason required.
- Unused birthday half-day expires and does not accumulate year-to-year.

### Weekend work → substitute leave
- Employee may register retroactively.
- Team Leader approval required.
- 4+ hours = 0.5 day.
- 8+ hours = 1 day.
- Max 1 day.
- Default validity through December 31.
- If project prevented use, carryover follows annual-leave logic.

### Holiday calendar
- Saturday/Sunday non-working.
- Korea statutory/substitute holidays auto apply.
- Admin may add company-designated holidays.
- No employee-specific or customer-specific calendars in v1.

## Projects

- "Project" means paid external customer contract work only.
- Internal R&D is excluded.
- One employee may be assigned to multiple projects concurrently.
- CEO/Admin create/edit assignments.
- Employee views own assignments.
- Fields: customer, project name, start, end, PM, role, work location.
- Extension preserves history; do not silently overwrite original end date.
- Annual utilization = unique period in the year covered by one or more paid projects, with overlap counted once.
- Do not use annual utilization for leave carryover.
- Exact denominator remains unresolved; do not silently lock to calendar days vs working days until confirmed.

## Career

- Employee writes own career.
- No admin approval.
- Can be created while project is ongoing.
- Prefer selection from actual Project list.
- Auto-populate customer/project/period from assignment.
- Employee adds job/function, role, responsibilities, tech/experience tags.
- Former employee career remains company data.

## Expense

### Flow
- Direct entry + Excel bulk upload.
- Official Excel template download.
- No Team Leader/PM approval.
- Expense Admin reviews all submissions and exports Excel for accountant.
- Usage month = calendar month.
- Submission deadline = first weekend of following month.
- Payment date = 15th.
- Late submission allowed with warning.
- 2–3 month retroactive claim allowed but reason required.
- Employee can edit until 15th; after payment period locks read-only.
- No in-system reject workflow.

### Validation
- Structural/schema/type errors = ERROR and block registration.
- Policy/suspicion issues = WARNING and may still submit unless explicitly noted.
- Duplicate suspicion key: employee + date + merchant + amount.
- Duplicate is warning only.
- Receipt/proof mandatory.
- Combined PDF is acceptable.

### Meal / dining
- Non-project overtime meal: ₩10,000 cap; overage warning, user corrects.
- Team dining subsidy: ₩30,000 per attendee per month.
- One submitter, all attendees must be listed.
- Each attendee’s monthly allowance cannot be reused beyond remaining allowance.
- Overall claim over combined allowance may warn and still submit.

### Other
- Equipment purchase requires CEO agreement as company policy, no separate approval workflow in system.
- Taxi is allowed with CEO approval in policy; no approval checkbox/workflow.
- No lodging cap.
- No rail/air class restriction.
- Personal card indicator required; no corporate card workflow.

## Assets

- Managed: Notebook, Desktop, Monitor, External Drive.
- Mouse/keyboard not normally managed.
- States: 사용중 / 보유 / 수리 / 분실 / 폐기.
- Track current holder and assignment history.
- Employee-to-employee transfer does not require approval.
- No hard offboarding block due to unreturned asset.
- Serial Number is the primary physical identifier.
- No generated DXT asset number required.

## Windows / Accounts

### Windows
- Existing product keys migrate.
- Full key visible only to IT Admin.
- Default masked display.
- No cost tracking, renewal alerts, or SaaS subscription management.

### Account management
- Store service name, login ID, URL, encrypted password, memo.
- Password masked by default.
- Authorized roles may reveal.
- Never store plaintext passwords.

## Onboarding

Checklist:
- Gmail
- Notion
- Microsoft 365
- Device
- Windows
- Business Card
- Leave Setup
- Company Guide

- Task can have multiple owners.
- Do not pre-create employee account before joining.
- No completion percentage dashboard required.

## Offboarding

- Manual Admin process.
- Store resignation date and resignation letter.
- Unused leave check included.
- Employee retained as INACTIVE.
- No complex approval workflow.
- No automatic SaaS disabling.
- No automatic asset retrieval.
- Resignation reason/document access: CEO only.

## Birthday email

- 09:00 on birthday.
- Only birthday person receives email.
- Admin can edit yearly template.
- Full DOB visible only to Admin/CEO.
- No lunar birthdays.
- Shared Gmail account.
- No complex retry screen.

## Family events

Categories:
- Own marriage
- Family marriage
- Childbirth
- Condolence

- Employee registers event.
- Registration emails CEO.
- Employee may also publish on family-event board.
- Family-event leave is separate from annual leave.
- Do not mass-email all employees.
