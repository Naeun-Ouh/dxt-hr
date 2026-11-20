# UI Implementation Contract

## Brand

- Preserve current Figma visual language.
- DXT brand primary currently represented in the design around RGB(79, 70, 229) / #4F46E5-like indigo.
- Use brand color selectively:
  - primary CTA
  - active sidebar
  - active tabs
  - links/focus/selected controls
- Destructive = red
- Warning = amber
- Success = green
- Main surfaces = white/light gray

If an official DXT logo color asset is later provided, replace the generic primary token with that official color.

## Layout

- Desktop primary width: 1440.
- Left sidebar around 240 px.
- Content is spacious, table-centric for admin.
- Do not re-introduce global search or notification bell in MVP unless product scope changes.

## Role-aware sidebar

Base Employee:
- Home
- Employees
- Organization
- Career
- My Projects
- My Leave
- Team Calendar
- Leave Requests
- My Expenses
- Expense Entry
- Excel Upload
- My Equipment
- Announcements
- Family Events

Team Leader adds:
- Team Project View
- Leave Approval

Expense Admin adds:
- Expense Management

IT Admin replaces personal asset-only navigation with:
- Equipment Management
- Windows License
- Account Management

Admin/CEO:
- Full administration set

## Important states from Figma

### Leave
- Leave overview with bucket breakdown.
- Past-date request reveals required late-request reason.
- Birthday half-day outside ±7 days requires project exception reason.
- Approval table truncates reason; drawer shows full reason.
- Reject opens confirmation; reason optional; employee must submit new request.
- Team calendar never shows leave reason to peers.

### Expense
- Excel flow: Upload → Validate → Review Problems → Register.
- Error blocks registration.
- Warning does not block unless explicitly specified by policy.
- Duplicate warning copy should remain friendly.
- Expense Admin has no reject action.

### Sensitive data
- HR Private is a separate area/tab and should not render at all without permission.
- Product keys/passwords are masked by default.
- Reveal action must be permission-checked server-side.

## Empty states

Implement at minimum:
- no active project
- no expense this month
- no assigned equipment
- no carryover leave
- no pending leave approvals
- no onboarding tasks
- no family events / announcements

## Tables

- One-line truncation for long reasons/notes.
- Detail drawer/page for full content.
- Do not encode state using color alone; include text/icon label.

## Figma reference frames

Use frame numbers 01–38 in the linked DXT HR Figma file as implementation references.

## Employment contracts

Reuse the shared shell, employee table, profile facts and white detail surfaces from
Figma frames 02/08/34. `/contracts/me` shows only own contracts. `/admin/contracts`
shows operational metadata and, for private HR administrators, searchable Employee
Master selection (name/department/title/email), templates and individual/bulk creation.
Employee detail adds a scoped 근로계약 tab. Detail shows immutable snapshot, versioned
preview, deliberate consent, stage dates (Asia/Seoul), audit trail and private PDF link.
Actual mounted employee views record first_viewed_at; link prefetch does not.
Sending makes the request available in-app. Automatic Gmail and cron remain disabled.

Contract UX follow-up: existing Figma HR-private detail (node `43:2`) supplies the
shell, typography, indigo/gray surfaces and main/rail hierarchy. The user-requested
contract-specific A4 document, progress summary, signing rail and company seal
management extend that style. Existing Figma shell assets are reused. Screenshots
in `docs/screenshots/contracts-*` use synthetic data and TEST seal images.

## Asset handoff extension (Issue #19)

Preserve Figma frames 22/23 and the existing cards, table, notices and shared shell.
`/assets/me` separates 현재 장비, 인계 확인 대기 중, 받을 장비 and 과거 장비.
Pending outgoing equipment is removed from the current-use section until resolved;
show “인계 완료 / 상대 확인 대기”. Incoming equipment offers deliberate 인수 확인.
Admin asset detail adds transfer participants, requested/handoff/confirmed dates,
force-confirm/cancel controls and full assignment/event history. Use 현재 보유자 or
지급자, not legal-ownership terminology.
