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
   - `docs/HR_PRODUCT_PRINCIPLES.md`
   - `docs/PORTABILITY.md`

2. Figma is the UI source of truth:
   https://www.figma.com/design/BL670ZpeySoSAhEZLgK62e/DXT-HR_AI?node-id=0-1

3. Use `docs/HR_PRODUCT_PRINCIPLES.md` as a product-design lens when a detailed UX/implementation choice is ambiguous. It does not expand scope and never overrides confirmed DXT policy.

4. Do not invent business rules.
   If a rule is not specified, implement the neutral/minimal behavior and leave a TODO referencing the unresolved policy.

5. Do not introduce generic global HR SaaS concepts such as Deel sync, W2, passport/tax compliance, payroll registry, or international payroll workflows.

6. Role permissions are additive.
   A user may hold multiple roles. Visible menus and capabilities are the union of explicitly granted role capabilities.

7. Unauthorized navigation is hidden, not disabled.

8. Sensitive HR data requires `PRIVATE_HR_ACCESS`.
   This capability is granted only to CEO + one designated ADMIN.
   TEAM_LEADER, EXPENSE_ADMIN, IT_ADMIN, and DIVISION_HEAD do not inherit it.

9. Never store plaintext passwords, resident registration numbers, bank account details, salary data, or full Windows product keys in unencrypted application fields.

10. Prefer ledger/event records for mutable balances such as leave.

11. Treat row-level data isolation as a mandatory security boundary.
    - Employees can access only their own restricted records unless an explicit broader capability exists.
    - Never trust URL secrecy, hidden navigation, client state, employee_id/user_id parameters, or page guards as sufficient authorization.
    - Enforce ownership/capability in server actions/APIs and at the database layer with RLS or an equivalent row policy.
    - Knowing another employee's URL or UUID must not expose their expense, leave reason, equipment detail, HR-private data, offboarding detail, or other restricted records.
    - Every domain PR must include negative authorization tests proving cross-user access fails.

12. Each PR should implement one focused vertical slice and include:
    - routes/screens changed,
    - DB/schema changes,
    - validation rules,
    - permission and ownership checks,
    - negative cross-user authorization tests,
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

Infrastructure-specific implementation must also follow `docs/PORTABILITY.md`; Supabase/Vercel are replaceable providers, not domain dependencies.

## Delivery order

See `docs/ROADMAP.md` for current business priority.
