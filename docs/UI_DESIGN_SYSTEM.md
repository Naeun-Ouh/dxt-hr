# DXT Enterprise UI system

## Pre-implementation audit (2026-11-20)

Baseline: main dba7fbe (contracts/seals merged). Asset transfers PR #20 and Expense
Grid PR #24 are independent work; do not import their business changes here.
Read AGENTS and all eight required documents before this audit.

Inspected Figma frame 43:2 (existing shell), globals.css, shell, and employee,
project, expense, asset, contract screens/forms. Figma retains a 240px sidebar,
60px top bar, indigo #4f46e5, existing local icons and protected HR surfaces.
This request explicitly adjusts density/component language beyond that reference.
Ant reference: https://ant.design/docs/spec/overview/ (patterns, not copied code).

| Finding | Proposed correction |
| --- | --- |
| globals.css mixes domain layout with repeated colors and control rules | Separate shared tokens and component rules; retain domain geometry |
| Project cells use 21px vertical padding, employee cells 12px; headers vary | 44px minimum rows, 12px horizontal inset, common sticky header/hover |
| Button padding/radius overridden by project and contract styles | One 36px default, 32px small, 44px primary/large system |
| Pills and rectangular badges differ; sent expenses appear green | Shared semantic StatusTag; neutral draft, blue processing, green completion |
| Heading wrappers duplicated; varying title sizes/gaps | Shared PageHeader with description and wrapping right actions |
| Form sections use 24–32px padding and differing help sizes | 24px sections, 16px field rhythm, 36px controls, explicit error/helper |
| Cards dominate sparse admin screens | Compact summary cards and table-first content |
| Disabled buttons use wait cursor even when no request runs | Distinguish disabled from aria-busy loading |
| Dialog/drawer patterns already use native dialog | Preserve modal/focus semantics, share surface rules |

## Design proposal and component inventory

No Ant Design dependency: existing semantic HTML/React and local Figma assets fit
this product. Avoid a second theme/reset, new runtime bundle, and duplicate inputs.
Tokens cover primary/hover, text/secondary/muted, border/surface/background,
success/info/warning/error and their surfaces; 4/6/8px radii; 4/8/12/16/24/32px
spacing; 24/16/13/12px type; 32/36/44px control heights.

Implement PageHeader, Button (primary/default/text/danger, sizes, busy), StatusTag,
DataTable, FormField, SectionCard, SummaryCard, FilterBar, EmptyState and Alert.
Extract only used patterns; retain existing native dialog/drawer and navigation tabs
with shared CSS contracts, rather than introducing unused modal state abstractions.
A4 contract paper/signing evidence and HR-private warning remain domain-specific.
Numeric columns use tabular figures/right alignment. State always retains text.

## Planned files (before implementation)

- src/app/globals.css: replace common declarations with token references; load system styles.
- src/app/design-system.css: shared system and compatible domain class bridges.
- src/components/ui/*: small presentational components, no fetching/authorization.
- src/components/{employees,projects,expenses,assets,contracts}/{screens,forms}.tsx:
  incremental component adoption; existing actions/IDs/validation remain unchanged.
- tests/e2e/ui-system.spec.ts: keyboard, responsive, density and synthetic screenshots.
- docs/screenshots/ui-system/*: same fixture/routes before and after.
- This document: delivery evidence, compatibility and build measurements.

## Ordered migration plan

1. Capture baseline screenshots/build assets; establish tokens, Button, Form, Table,
   Tag, PageHeader and Card. Write this plan before any source edits.
2. Adopt shared pieces in Employees → Projects → Expenses → Assets → Contracts.
   Preserve capability conditionals, links, handlers, input names and hidden IDs.
3. Normalize existing tabs, empty, alert, modal and drawer styles. Ensure mobile
   reflow; tables scroll inside their container, never widen the document.
4. Check separate PR compatibility without merging those business changes here.
5. Run lint/build/typecheck, all unit/DB and browser regressions. Review synthetic
   before/after screenshots and report measurements/limitations. Open PR, no merge.

## Boundaries

No DB migration, RLS, server action, API, permission, OAuth, PDF renderer, immutable
completion, Gmail or cron changes. No new sorting/pagination/business semantics.
Existing sort/filter/page behavior keeps its original data boundary.

### Compatibility refinement during implementation

Asset and expense authoring source files are deliberately not rewritten: their
open PRs change those same authoring surfaces. They adopt shared class contracts
from design-system.css instead. Employee/project/contract components are extracted.
This keeps new expense Grid and asset transfer logic isolated from the UI PR.
The legacy expense `.success` class groups submitted/paid; it uses an informational
blue tag with explicit text. Adopting per-state StatusTag in that owning slice is
deferred to avoid a proven merge conflict with PR #24. This is a visual limitation,
not a state or policy change.

## Implemented component contracts

- `PageHeader`: title/description + optional actions; responsive wrapping; native h1.
- `Button`: native button props/actions/names remain intact; primary/default/text/danger,
  small/default/large, disabled and aria-busy loading with reduced-motion support.
  Existing link buttons use identical class tokens and remain links.
- `StatusTag`: explicit text plus semantic tone. It never changes domain status.
- `DataTable`: native table, scope=col headings, named focusable overflow region;
  caller keeps rows, sorting, filters and pagination. No client data engine added.
- `FormField`: native wrapping label, caller-owned input attributes/IDs, required marker,
  associated helper/error text. Existing validation is untouched.
- `SectionCard`, `SummaryCard`, `FilterBar`, `EmptyState`, `Alert`: presentation only.
- Tabs remain real navigation links with aria-current; existing native dialog owns
  focus containment/Escape. Shared styles do not introduce a parallel dialog state.

## Module adoption

| Area | Application |
| --- | --- |
| Employees | directory/form/detail/private headers, fields, cards, controls, tags |
| Projects | shared header/table/filter/summary/alert, compact rows and forms |
| Expenses | shared legacy table/form/buttons/surfaces; Grid-specific compact control bridge |
| Assets | shared table/form/buttons/surfaces; existing current/history grouping untouched |
| Contracts/seals | shared header/cards/tags/buttons; A4 paper, consent and PDF flow retained |
| Leave/operations | shell/control/table/tab/dialog CSS contracts, existing behavior retained |

## Accessibility and responsive scope

Keep local Figma SVG icons and semantic controls. Visible focus, text status labels,
16px native checks, error associations, keyboard-scrollable project tables, no hidden
unauthorized menu placeholders. Sidebar scrolls independently on desktop; narrow
layouts stack forms/cards and constrain tables to local scroll regions. Motion can be
reduced by OS preference. Automated checks are not a complete WCAG certification.

No dependency or lockfile change, no new remote fonts/assets, no CSS-in-JS runtime.
Existing domain CSS remains a compatibility layer rather than a wholesale rewrite.

## Verification evidence

- Baseline and final build: Next.js 16.4.6 / Node 22; no dependency changes.
- Sum of gzip-compressed emitted `.next/static` files (whole build, not a route's
  transfer size): JavaScript 202,638 → 202,963 bytes (+325); CSS 9,078 → 11,338
  bytes (+2,260). Includes shared assets; filesystem build compression is a proxy,
  not a browser performance benchmark.
- Lint, production build and TypeScript pass. Unit/database suite: 68/68 passed.
- Negative coverage includes ownership/UUID/RPC/RSC/Server Action replays, specialist
  boundaries, private HR, contracts/signatures, receipt objects and private seals.
- Read-only `git merge-tree --write-tree` simulations with PR #20
  (`4bfde91a934021cc2a818f943ce7445fd3d2264d`) and PR #24
  (`f32ac2ad4e134c6e1872552b54c43f117834affb`) both merge without conflicts.
  This is source compatibility, not live staging acceptance of their combined flow.
- All screenshots use local synthetic fixtures. No production or staging data used.
- Final full browser regression: **56/56 passed**, including the new three UI
  scenarios (7 routes at 1440/768/390px, keyboard/required controls, hidden navigation).
  The initial new table-focus test selected a named sidebar region; scoping to main
  fixed the test locator. Existing feature/security tests required no changes.
- Before/after pairs are captured with a fresh instance of the same synthetic seed;
  extra signing/private screenshots come from the full regression flow.
