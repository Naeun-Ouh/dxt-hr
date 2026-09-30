# Phase 3 — Projects, assignments, resource coverage and career

Implements Issue #3 from main, including `PHASE_3_CONTEXT.md`, its referenced product contracts, the latest issue comments, and `HR_PRODUCT_PRINCIPLES.md`.

## Routes and behavior

- `/admin/projects`: searched, customer/status-filtered and paginated paid external project list, current assignment counts, create/edit/detail navigation.
- `/admin/projects/new`, `/admin/projects/[id]/edit`: customer, name, project dates, PM, location and lifecycle status.
- `/admin/projects/[id]`: project facts, assignment create/edit/delete, date-change history, optional reason, versioned end-date changes and restricted project deletion.
- `/admin/resources`: selected-year union of registered assignment periods, including scheduled dates. Inclusive covered dates are counted once across overlapping or adjacent assignments. The UI shows periods and deduplicated date counts, **no utilization percentage**. No denominator or leave-carryover policy is inferred.
- `/projects/team`: the same period calculation over authorized team assignments.
- `/projects/me`, `/projects/assignments/[id]`: own current assignments and planned/past history, including project/customer, dates, role, PM and location. Query parameters cannot change the owner.
- `/career`, `/career/new`, `/career/[id]/edit`: own authoring records, actual own-assignment selector, derived customer/project/period, job function, role, responsibilities, removable skills, live profile preview and immediate save without approval. Active-project records can be edited.
- Existing employee profile project tabs render only authorized assignments. Career tabs show owner or same-department Team Leader reads, with team content strictly read-only. Unauthorized career tabs are hidden. The team project table links to these career tabs.

## Migration and integrity

Apply `supabase/migrations/202609300004_projects.sql` after migrations 001–003, then `202609300005_team_career_read.sql`. The additive migration replaces only the career SELECT policy with a separate owner/team read helper; it does not widen writes. No service-role credential is used by the application. It adds `project`, `project_assignment`, `project_extension`, and `career`; skills are a bounded array on career rather than a separately mutable child table. Career derives its project and dates through the assignment FK to avoid inconsistent duplicate metadata.

Projects require a PM employee and location per the focused brief. Assignment end dates are explicit and bounded by the project interval; extending a project does not silently extend its assignments. Multiple concurrent assignments remain independent. Planned/active/completed are explicit lifecycle states. The current-assignment view also requires today's date (Asia/Seoul) to fall within the assignment dates.

All edits use optimistic versions. Project and assignment writes take the project row lock in the same order. Range changes cannot strand existing assignments outside their parent project. A database trigger records every end-date change, including shortening, with previous/new date, actor ID and display-name snapshot, timestamp and optional reason. Invalid changes roll back both the record and history.

Deletion uses restrictive foreign keys: a project with assignments or end-date history cannot be deleted; an assignment linked to career cannot be deleted. Unreferenced mistakes can be deleted through the explicit confirmation controls. Ending a project/assignment does not invalidate career. Inactivating an employee revokes access while retaining their career rows. Metadata-only mutation audit records contain actor, operation, entity and time, never narrative career content.

## Authorization and unresolved scope

Authentication and trusted membership capabilities are checked on every protected request. The database independently verifies active membership and linked employment status. UI role hiding is not a security boundary.

- ADMIN/CEO: `PROJECT_MANAGE` grants project/assignment management and resource reads, **not another employee's career**.
- Employee: reads own assignments and the associated project summary. Career authoring screens and all writes are owner-only; the owner is derived from the trusted auth-to-employee link, never supplied by a form.
- TEAM_LEADER: `TEAM_PROJECT_READ` and the separate `TEAM_CAREER_READ` are limited to the same non-null direct `department_id` as the linked employee. Career reads use the same direct-department scope, without inheriting the project administrator bypass. No descendant organization or division-wide access is inferred. An unlinked leader/no-department leader gets no broader scope.
- EXPENSE_ADMIN, IT_ADMIN and DIVISION_HEAD do not receive project management through those roles. Additive combinations still work.
- Unlinked accounts receive an actionable own-project/career empty state; trusted provisioning must set `employee.auth_user_id` after joining.

TODO (`PERMISSIONS.md`): replace the conservative direct-department team mapping if an explicit leader/team relationship or broader division policy is approved. TODO (`PHASE_3_CONTEXT.md`): establish the utilization denominator before adding any rate. No allocation percentage, billing, budget, profitability, time tracking or approval workflow is added.

RLS restricts all four tables. Authenticated clients receive SELECT only; writes go through explicit checked RPCs with an empty search path and PUBLIC/anon execution revoked. Server Actions check management capability, and career actions separately verify owner and assignment before calling the independently checked RPC. Forging IDs, hidden inputs or a previously authorized form does not bypass either boundary.

## Validation and evidence

Local validation passed: 20 unit/database tests, 25 browser tests, lint, production build, and TypeScript checking.

Run the same commands as CI: `npm run lint`, `npm test`, `npm run build`, `npm run typecheck`, and `npm run test:e2e`.

The database suite uses PGlite with all actual migrations and authenticated roles. Coverage includes overlap/adjacency/leap-year/year-boundary calculations; invalid dates/selectors; direct RPC and table-write denial; cross-user career and assignment isolation; specialist and out-of-team rejection; null-department scope; CRUD; stale writes; invalid range rollback; extension history; restrictive deletion; forged owner input; and former-employee retention. Review regression tests prove in-team career reads, out-of-team/specialist denial, owner-only writes even with a valid leader-owned assignment, and null-department/inactive revocation.

Playwright runs the production Next build against a local Auth/PostgREST double backed by those migrations. It covers full project/assignment CRUD, history, project filtering, stale project edits, resource deduplication, own/team pages, career creation/update/preview, forged selectors and URLs/RSC requests, and action replay after changing the authenticated session. Existing employee/auth/security regression tests remain included. All fixture names/content are synthetic.

This is not a live Supabase/OAuth integration test. Before deployment, apply the migrations to staging, configure real Auth and employee identity links, and exercise these same account scopes through real PostgREST.

## Figma comparison

Compared the rendered screens with Figma file `BL670ZpeySoSAhEZLgK62e`, frames 14 (`35:2`), 15 (`35:253`), 16 (`35:503`), 17 (`35:664`), and 33 (`40:663`). Reused the existing 240px sidebar, header, exact shell assets, indigo tokens, white cards, tables, project facts, and the 700/380 two-column career form/preview. No new icon substitutes or Tailwind dependency.

Intentional adaptations: responsive flow instead of prototype absolute coordinates; period counts replace the unresolved utilization percentage; real data/empty/error states; readable date-change audit history; CRUD and confirmation controls; an additional bottom save button for long career forms; and explicit planned/history grouping. Existing shell remains intact.

- [14 — Project management](screenshots/phase3-project-list.png)
- [15 — Resource coverage](screenshots/phase3-resources.png)
- [16 — My projects](screenshots/phase3-my-projects.png)
- [17 — Career form and preview](screenshots/phase3-career.png)
- [33 — Project detail and extension history](screenshots/phase3-project-detail.png)
- [Team member career — read-only](screenshots/phase3-team-career.png)
- [Mobile career form](screenshots/phase3-career-mobile.png)

After review and merge, the next priority remains Phase 5 Expense; this PR does not start that phase.
