# Phase 7 Implementation Context — Onboarding, Offboarding, Announcements, Family Events, Birthday Email

> **Current v1 scope (Issue #15):** automatic birthday/family-event Gmail delivery is deferred. Google OAuth login remains unchanged. The mail descriptions below document the original implementation, not current deployment requirements. Follow [Issue #15 rollout](ISSUE_15_DELIVERY.md); do not configure Gmail credentials or the historical cron.


Focused implementation brief for Issue #7.

## Read first

- AGENTS.md
- docs/ROADMAP.md
- docs/BUSINESS_RULES.md
- docs/PERMISSIONS.md
- docs/DATA_MODEL.md
- docs/UI_IMPLEMENTATION.md
- docs/HR_PRODUCT_PRINCIPLES.md
- Issue #7 and latest comments

Figma source of truth:
- 26 — 온보딩 관리
- 27 — 퇴사 관리
- 28 — 공지사항
- 29 — 경조사
- 35 — 경조사 등록
- 36 — 생일 메일 설정

## Goal

Complete the remaining high-priority v1 company-operations workflows before the intentionally deferred Leave phase.

Do not pull Phase 4 leave-management implementation into this phase.

---

## Onboarding

### Purpose
Give Admin a practical checklist for a newly joined employee.

Default task types:
- Gmail
- Notion
- Microsoft 365
- Device
- Windows
- Business Card
- Leave Setup
- Company Guide

### Rules
- onboarding starts after the employee record exists
- do not create a login/account before joining
- one task may have multiple owners
- one employee may own multiple tasks
- manual completion/status updates
- notes allowed where useful
- no completion-percentage dashboard requirement
- no automatic external SaaS provisioning in v1

### Suggested states
- TODO
- IN_PROGRESS
- DONE
- NOT_APPLICABLE

Do not invent approval chains.

### Integration
Reuse existing employee, asset, and account data where useful.
Do not duplicate device/login data if it already exists in the system.

---

## Offboarding

### Purpose
Manual Admin-led departure checklist, without pretending to automate external systems.

Required:
- employee
- resignation date
- resignation letter file
- unused leave settlement/check flag
- checklist/tasks
- completion status

Employee must remain retained as INACTIVE after departure.

### No automation
Do not:
- automatically disable Google/Notion/M365 accounts
- automatically recover assets
- hard-block offboarding because an asset remains assigned
- create resignation approval workflow

Existing assigned assets should be visible as an operational warning/context only.

### Sensitive resignation data
Resignation reason and resignation letter access are **CEO-only**.

This means:
- Admin may operate the general offboarding checklist
- CEO may access resignation reason/document
- TEAM_LEADER / DIVISION_HEAD / EXPENSE_ADMIN / IT_ADMIN do not gain access
- designated ADMIN with PRIVATE_HR_ACCESS does not automatically gain RESIGNATION_REASON_ACCESS

Store resignation letter in a private bucket.
No public/signed reusable URL.
Download must reauthorize the current request.

Reason/document content must never appear in unauthorized HTML/RSC/API responses.

### Audit
Audit:
- resignation-document upload
- CEO document/reason reveal/download
- offboarding completion/status changes

Do not log the reason text or file contents.

---

## Announcements

Simple company board.

Fields:
- title
- body
- author
- published_at

Rules:
- announcements and family-event board are separate
- no read receipts
- no pinned-post feature required
- no bulk email blast
- normal employees may read published announcements
- create/edit rights should follow explicit admin capability; do not infer arbitrary authorship workflows

Keep the feature intentionally simple.

---

## Family events

### Categories
- own marriage
- family marriage
- childbirth
- condolence

### Registration
Employee registers their own event.

Fields:
- category
- event date
- title
- body/details needed for company handling

Registration triggers CEO email notification.

Employee may separately publish to the family-event board.

Registration and board publication are separate concepts:
- registration = operational notification to CEO
- board post = company-visible content

Do not automatically mass-email employees.

### Family-event leave
Family-event leave is separate from annual leave.

Because Phase 4 leave implementation is deferred:
- do not implement the actual family-event leave ledger/workflow here
- UI may show a future/disabled-by-scope CTA only if Figma requires it, but it must not create fake leave records
- preserve the policy linkage for Phase 4

### Data scope
Employee can edit/manage their own registration where policy allows.
Company board posts are visible as intended.
Do not expose private operational detail beyond what is meant for the board.

---

## Birthday email

### Rule
At 09:00 on the employee's birthday:
- send only to that birthday employee
- do not email everyone
- no lunar birthday support
- use the configured shared Gmail account

### Template
Admin can edit yearly template.

Fields:
- year
- subject
- body
- optional supported variables such as name / birthday

Do not build a generic mail-template engine.

### DOB privacy
Full DOB remains protected according to existing employee/private model.
Do not expose full DOB to ordinary employees through this feature.

The scheduled job should obtain only the minimum data needed to determine today's recipients.

### Delivery architecture
Provide a Vercel-compatible scheduled job / cron endpoint or equivalent server job.

Requirements:
- authenticate/secure the scheduled endpoint
- idempotency: the same employee should not receive duplicate birthday mail for the same birthday/year if the job retries
- record delivery metadata without storing unnecessary email content
- no elaborate retry/error-management UI in v1
- fail safely if Gmail credentials are unavailable

### Shared Gmail
Use server-only credentials/tokens.
Never expose Gmail credentials to browser code.

---

## Gmail event notifications

Automatic email in v1 is limited to:
1. birthday email to the birthday employee
2. family-event registration alert to CEO

Do not add:
- leave approval emails
- expense emails
- generic notification engine
- announcement mass email

---

## Data isolation / security

HR-system baseline still applies.

### Onboarding
Normal employee should not browse other employees' onboarding operational checklists unless explicitly intended by product policy.
Admin operational scope only.

### Offboarding
General Admin workflow separate from CEO-only resignation reason/document.

### Family event
User A must not mutate User B's private registration through forged IDs.

### Email templates / jobs
Only authorized Admin may edit birthday template.
Scheduled job endpoint must not be publicly triggerable without authentication/secret verification.

### Required layers
Use:
1. UI visibility
2. server action/API authorization
3. DB RLS
4. private Storage RLS for resignation files

### Negative tests
At minimum:
- employee cannot access another employee's onboarding/offboarding detail
- TEAM_LEADER/IT_ADMIN/EXPENSE_ADMIN cannot access CEO-only resignation document/reason
- Admin without RESIGNATION_REASON_ACCESS cannot download resignation letter
- forged offboarding/document IDs fail
- family-event owner tampering fails
- birthday template unauthorized edits fail
- cron endpoint rejects unauthenticated invocation
- duplicate birthday-job execution is idempotent
- unauthorized RSC/HTML/API never contains resignation reason/document contents

---

## Lifecycle / history

Preserve operational history where useful:
- onboarding task completion
- offboarding task completion
- employee inactive transition
- announcement publication
- family event registration
- birthday email delivery record

Avoid generic event-sourcing complexity.

---

## UX principles

Use Flex-derived mature-product principles as guidance:
- employee self-service where natural
- admin operational complexity stays in admin screens
- do not ask users to re-enter data already known
- explicit lifecycle states
- sensitive access separated from operational management
- no approval workflow unless DXT requires one
- audit high-risk access, not every click

---

## Acceptance checklist

Phase 7 is complete only when:

### Onboarding
- onboarding checklist works
- multiple owners work
- default DXT task types available
- no pre-join account automation
- no percentage dashboard requirement introduced

### Offboarding
- offboarding workflow works
- employee can be retained INACTIVE
- resignation letter stored privately
- resignation reason/document CEO-only
- Admin can complete non-sensitive checklist
- asset not returned does not hard-block
- no automatic SaaS disable

### Announcements
- simple board works
- no read receipt / mass email complexity

### Family events
- employee registration works
- CEO notification email path works
- optional board publication is separate
- categories match DXT rules
- no fake leave implementation

### Birthday
- yearly template edit works
- 09:00 scheduled flow exists
- birthday employee only
- duplicate sending prevented
- Gmail credentials server-only

### Security / quality
- DB RLS and storage policies exist
- cross-user/cross-role negative tests exist
- secret/private document content absent from unauthorized payloads
- Figma 26/27/28/29/35/36 compared
- CI passes

## Next phase

After Phase 7 review/merge:
- high-priority DXT v1 operational system is substantially complete
- Phase 4 Leave remains intentionally deferred because DXT already has a working leave-management system
- next work should be integration/staging hardening and deployment readiness before deciding whether to replace Leave
