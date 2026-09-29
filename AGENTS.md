# Codex Working Agreement — DXT People & Operations

This repository is implemented from an approved product specification and Figma design.

## Non-negotiable rules

1. Read these files before changing product behavior:
   - `docs/PRODUCT_SPEC.md`
   - `docs/BUSINESS_RULES.md`
   - `docs/PERMISSIONS.md`
   - `docs/DATA_MODEL.md`
   - `docs/ROUTES.md`
   - `docs/UI_IMPLEMENTATION.md`

2. Figma is the UI source of truth:
   https://www.figma.com/design/BL670ZpeySoSAhEZLgK62e/DXT-HR_AI?node-id=0-1

3. Do not invent business rules.
   If a rule is not specified, implement the neutral/minimal behavior and leave a TODO referencing the unresolved policy.

4. Do not introduce generic global HR SaaS concepts such as Deel sync, W2, passport/tax compliance, payroll registry, or international payroll workflows.

5. Role permissions are additive.
   A user may hold multiple roles. Visible menus and capabilities are the union of explicitly granted role capabilities.

6. Unauthorized navigation is hidden, not disabled.

7. Sensitive HR data requires `PRIVATE_HR_ACCESS`.
   This capability is granted only to CEO + one designated ADMIN.
   TEAM_LEADER, EXPENSE_ADMIN, IT_ADMIN, and DIVISION_HEAD do not inherit it.

8. Never store plaintext passwords, resident registration numbers, bank account details, salary data, or full Windows product keys in unencrypted application fields.

9. Prefer ledger/event records for mutable balances such as leave.

10. Each PR should implement one focused vertical slice and include:
    - routes/screens changed,
    - DB/schema changes,
    - validation rules,
    - permission checks,
    - test coverage,
    - screenshots for major UI changes.

## Suggested stack

- Next.js + TypeScript
- PostgreSQL / Supabase
- Supabase Auth or Google Workspace SSO
- Supabase Storage for uploaded files
- Gmail API for birthday/family-event email flows
- Vercel-compatible scheduled jobs

If the existing codebase later adopts another stack, preserve the product/business contracts above.

## Delivery order

1. Foundation/auth/roles/layout
2. Employee + organization + HR Private
3. Project + assignment + career
4. Leave + holiday + weekend work/substitute leave
5. Expense + Excel validation + admin export
6. Asset + Windows license + account vault UI
7. Onboarding + offboarding
8. Announcements + family events + birthday email
9. Admin hardening, audit logs, tests, deployment
