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
