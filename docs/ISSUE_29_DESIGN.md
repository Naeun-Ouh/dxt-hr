# Issue 29 — DXT Design System v2

## Audit / base

Base: edfe8f4 (Issue 26 merged). Issue 28 is open; no published Issue 28 branch
was present at discovery. This PR changes presentation only. No card master,
Excel mapping, migrations, authorization, validation or lifecycle changes.

Current shell uses 240px navigation, 32px page padding, 24px gaps and 44px primary
buttons. Tables already have scoped data, hover and scrolling, but filter cards,
large profile/asset cards and stacked permanent forms push grids below the fold.
Expense has local filters and monthly files; import and row editing are permanent
inline panels. Employee detail already has permission-filtered URL tabs. Projects,
assets, leave and Vault already have safe server-filtered tables. Contracts have a
separate A4 detail surface that must remain unchanged.

## Reference patterns

Primary: DaouOffice work-screen composition described in Issue 29 and the supplied
brief. Actual reference image files were not attached to this request; no claim of
pixel-level screenshot comparison is made. Secondary: Ant Design interaction
conventions. Identity, assets and implementation: DXT only.

Use a compact header, optional useful summary, toolbar immediately above the data,
and contextual disclosure for secondary work. Do not add decorative metrics,
unimplemented leave buckets, fake filters or actions without existing permissions.

## Mapping

| Current | v2 |
| --- | --- |
| Wide sidebar / large user card | 208px sidebar / compact identity / preserved hidden navigation |
| Detached filter card | Borderless WorkToolbar adjacent to table |
| Large summary cards | SummaryStrip / KPIStat with restrained numeric emphasis |
| Employee profile + tabs | Compact profile / existing permission-scoped CompactTabs |
| Project table / separate assignment view | Table plus contextual assignment row expansion |
| Asset cards | Dense possession tables / contextual transfer controls |
| Expense inline import / detail | Modal import / Drawer detail, existing callbacks preserved |
| Leave overview | Small summary / year toolbar / table; no advanced leave additions |
| Contract list cards | Compact contract tables; A4 detail remains paper-oriented |
| Operations / Vault / seals | Same compact shell, controls, tables and field rhythm |

## Tokens and component contract

Page 22px, section 15px, body/table 13px, helper 12px. Page gap 16px,
section gap 12px; controls 32–36px, row 40–44px; radius 6px, border-led surfaces.
Primary #4f46e5 remains. Shell 208px / utility header 48px. Narrow layouts wrap
controls and scroll tables within their own region; no document-wide overflow.

Presentation primitives: PageHeader, WorkToolbar/GridToolbar, KPIStat/SummaryStrip,
DataTable/DataGrid, CompactTabs, StatusTag, SearchInput, FilterPopover, Modal,
Drawer, RowExpansion, FormField, EmptyState, Alert. Callers own data, permission,
mutation, selection and sorting; components never fetch sensitive records.
Native dialog supplies modal focus isolation, Escape and focus restoration.
URL tabs remain links; disclosure buttons expose expanded state and controlled IDs.

## Staged implementation

1. Capture synthetic baseline for six modules; shared tokens and components.
2. Expense reference workspace, employee/profile, projects, assets, leave.
3. Contract lists and remaining operations/Vault/seal presentation.
4. Interaction/overflow/accessibility checks at 1440, 768, 390; full regression.

No new dependency or schema. Keep large editing/document workflows as full pages.
Issue 28's final business changes can consume the shared overlays/toolbars; this
branch does not preempt payment-card or import-preview policy.

## Implemented scope / intentional boundaries

- Shell: compact desktop navigation and responsive collapsible menu; capability
  construction remains on the server. No new navigation privileges.
- Expense: month/search/filter/sort beside Grid, small status/amount/count/file/
  warning summary, native import Modal, row Drawer and submission confirmation.
  Existing import callback semantics remain; Issue 28 owns the separate preview/
  confirmation and payment-card work. Existing row-specific details remain available.
- Employees: dense directory and Quick Detail Drawer with already-authorized basic
  fields only; permission-filtered profile/project/career/asset/contract tabs.
- Projects: existing filters and KPI values; expandable assignment rows using
  already-authorized project data.
- Assets: personal current equipment is a table, four ownership sections remain;
  managers can expand assignment and transfer history using authenticated RLS reads
  after the existing ASSET_MANAGE guard. No employee gets manager history.
- Leave: compact header/year/summary/requests/ledger; existing advanced-leave
  deferrals remain. No substitute balance or other invented metrics.
- Contracts: local name/email/status filter and dense register, scoped metadata
  only; creation in a Modal; unchanged A4 document/signing controls.
- Operations, Vault, seals, announcements, family/birthday: shared shell, header,
  compact controls/table/field rhythm. Existing specialist workflows retained.

Intentionally retained full pages: large employee/project/asset record editors,
private HR, Vault secret reveal, detailed leave processing and contract documents.
No generic bulk mutation is added to tables that do not already support one.
Not every secondary screen gains a bespoke drawer; shared density applies across
all current modules, with targeted interaction refactors on frequent workflows.

## Accessibility and dependencies

Native semantic tables, explicit labels, text status tags, focus-visible styles,
URL tab navigation, disclosure expanded state and focusable scroll regions retained.
Modal/Drawer use showModal, Tab/Shift-Tab cycling, Escape and native focus restore.
Mobile navigation remains operable through its summary, with no permission expansion.
No package changes. New client components use React/HTML only; server-rendered
children keep authorization/data queries outside the presentation components.
