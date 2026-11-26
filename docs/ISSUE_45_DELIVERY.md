# Issue 45 — Employee My Page

Base: main `00ae928`. No schema, dependencies, business-policy or hosted changes.

## Delivered

- `/me` is a compact DXT Design System v2 self-service workspace, linked in the Home navigation group. Existing Employee Master supplies name, department, title, company email, hire date and employment state.
- Current-session `current_employee_id()` is the only identity input. `/me` accepts no employee/user identifier; forged query values have no effect. ADMIN/CEO personal views never become company-wide dashboards.
- Small actionable summaries show today's usable non-birthday leave, current ACTIVE assignments whose dates include today, SENT/VIEWED employee signature requests, certificates awaiting review/issue, and issued certificates. Positive legacy leave with unverified validity is explicitly disclosed and excluded from usable leave. None of these summaries infer new entitlements.
- Shortcuts reuse own expenses, assets, career, contracts, certificates, leave, projects and own allowed HR-document screens. My Page does not query HR-private fields, contract bodies/signatures/PDFs or Storage objects.
- Employee detail's 장비 tab now renders a bounded current-assignment asset table. The tab and deep link require self identity or ASSET_MANAGE; the data loader repeats this authorization and explicitly filters the target holder with the normal session. Current asset details and transfer/history stay on existing routes. Admin/CEO own equipment remains reachable through My Page even when specialist navigation emphasizes management.

## Queries and resilience

After session identity/date resolution, profile, department, source summary and four exact count queries execute in parallel. Count queries return at most one identifier; exact totals come from the server. Only the selected year's own leave sources are aggregated, never returned as sensitive client payloads. Current profile equipment is capped at 100 rows with an explicit notice and full-view link. Existing normal-session RLS remains the independent data boundary; no service client, elevated RPC, new view or materialized copy exists.

Suspense provides loading feedback. An unlinked account has a clear empty state and never falls back to another employee. Failed summaries display 확인 필요 rather than zero; failed profile/identity queries display a retry message without exposing raw errors. Compact links wrap at tablet/mobile widths. Existing Google OAuth and dormant automatic Gmail/cron behavior remain unchanged.

## Verification

- New DB test checks cross-user asset/contract RLS and linked ADMIN self identity: personal asset query selects one own item while management can still see other authorized items; own contract count remains zero while management sees two.
- Browser cases: identity-query forgery, no private field leakage, own contract count, self HR documents link, own asset details, employee/team-leader/specialist direct-tab denial, CEO additive-role scope, unlinked ADMIN empty state and authorized asset-manager access.
- Responsive checks at 768px/390px and screenshots: `issue45-my-page.png`, `issue45-my-page-mobile.png`, `issue45-own-assets.png` under `docs/screenshots/`.
- Navigation expectations include `/me`. Test PostgREST double supports bound `lte`/`gte` comparisons used by the date-scoped assignment count.
- Focused unit, lint and typecheck run in the feature worktree. Production build/browser/full regression/CI and screenshot capture are root integration steps; no live staging acceptance is claimed.

## Documentation integration

Add `/me` to ROUTES and UI_IMPLEMENTATION when integrating shared documentation. Existing permission policy is unchanged: personal summaries remain own-only; employee asset detail is own or ASSET_MANAGE. No education, evaluation or payroll scope was added.
