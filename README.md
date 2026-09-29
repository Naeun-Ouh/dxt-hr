# DXT People & Operations

Internal HR & Operations system for DXT.

## Source of truth

- Product/UI source of truth: DXT HR Figma
  - https://www.figma.com/design/BL670ZpeySoSAhEZLgK62e/DXT-HR_AI?node-id=0-1
- Business policy source of truth: `docs/BUSINESS_RULES.md`
- Role/data access source of truth: `docs/PERMISSIONS.md`
- Implementation contract for Codex: `AGENTS.md`

## Product scope

DXT People & Operations consolidates employee, organization, project assignment, career, leave, expense, equipment, Windows license, onboarding/offboarding, announcements, family events, and selected Gmail automation workflows.

This repository is intentionally implementation-first:
- do not invent HR policies,
- do not add global payroll SaaS concepts,
- do not expose unauthorized navigation,
- preserve DXT-specific business rules,
- keep the UI aligned with the approved Figma frames.

## Development workflow

1. Read `AGENTS.md`.
2. Read the relevant files under `docs/`.
3. Implement only approved v1 scope.
4. Open focused PRs.
5. Reconcile implementation with Figma and documented validation/permission rules before merging.
