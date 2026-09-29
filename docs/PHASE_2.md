# Phase 2 — Employees, organization and HR Private

Implements Issue #2 from main `2805ad1`. The latest [issue guidance](https://github.com/Naeun-Ouh/dxt-hr/issues/2#issuecomment-5899585043) and all AGENTS.md reference documents were read before implementation. Phase 1 membership constraints remain authoritative; employee profiles are separate domain records.

## Routes and behavior

- `/people` and `/admin/employees`: database-backed directory, name/email search, department and ACTIVE/INACTIVE/all filters, stable pagination and empty state. ADMIN/CEO see creation and editing controls.
- `/admin/employees/new`, `/admin/employees/[id]/edit`: basic and work details, encrypted DOB, validation, duplicate-email feedback and optimistic concurrency. Creating a profile never provisions a login or changes roles.
- `/people/[id]`, `/admin/employees/[id]`: actual profile and status, detail tabs. Project, career and equipment tabs remain neutral placeholders for their scheduled phases; no fabricated records.
- `/organization`: hierarchy, department-directory links, ADMIN/CEO creation/editing; cycles and duplicate sibling names rejected.
- `/admin/employees/[id]/private`: HR Private absent from unauthorized navigation and denied on direct, RSC and action requests. Default values are masked; explicit audited reveal auto-hides after 60 seconds or tab backgrounding. Blank edit fields preserve stored values; explicit checkboxes clear fields.

## Schema and authorization

Apply `202609300001_foundation.sql`, then `202609300002_employees.sql`. The second migration adds `organization`, `employee`, `employee_birth_detail`, `employee_private_hr` and metadata-only `audit_log`, with RLS, restrictive grants and authenticated RPCs.

| Data / action | Employee and specialist roles | ADMIN | CEO / designated ADMIN |
| --- | --- | --- | --- |
| Basic employee and organization read | Yes | Yes | Yes |
| Employee and organization create/edit | No | Yes | Yes |
| Full DOB read/edit | No | Yes | Yes |
| HR Private read/edit | No | No | Yes |
| Membership / auth identity assignment | No | No | No |

All access additionally requires ACTIVE membership and no INACTIVE linked employee. Role combinations remain additive. Database decisions read `auth.uid()` and current membership, not client role claims. Security-definer helpers have an empty search path and no caller-controlled identity. Profile writes run atomically with optional birth/private creation. Optimistic versions reject stale form submissions.

`employee.auth_user_id` is nullable and writable only through trusted provisioning. Link an existing joined employee's auth user using trusted SQL; employee forms cannot grant login access, change roles or assign this link. The existing membership constraint still permits at most one non-CEO designated ADMIN. Deactivating a linked employee revokes access on subsequent protected requests and domain database queries.

The logical model's private fields are stored together in one authenticated encrypted JSON payload, including bank name. Full DOB uses a separate encrypted table because ordinary ADMIN has birthday-management access but no HR Private access. General employee queries never fetch either ciphertext. Initial private pages serialize only record presence/version to client components; decryption happens only in guarded server actions. Mutations and explicit reveals produce audit metadata (actor, action, entity, time), without input values or ciphertext.

## Encryption configuration

Set these **server-only** variables using your deployment secret store:

```text
HR_ENCRYPTION_ACTIVE_KEY=hr_v1
HR_ENCRYPTION_KEYS={"hr_v1":"<base64 random 32-byte key>"}
```

Generate a key with `openssl rand -base64 32`. Never commit actual keys or use `NEXT_PUBLIC_`. AES-256-GCM uses a fresh 96-bit nonce, an authentication tag and version/key ID in the envelope. Additional authenticated data binds the ciphertext to its employee and purpose (`birth` or `private`), preventing record/field substitution. Missing or invalid keys fail closed; no plaintext fallback. Errors shown to clients never contain raw database or crypto messages.

For rotation, add a new key to the JSON keyring and change the active ID; new writes use it while old records remain decryptable with retained keys. Retain old keys until every affected record has been re-encrypted and verified through a controlled migration. Do not remove an old key early. Bulk rotation tooling is outside this slice. Back up keys separately from the database and limit deployment-secret access.

## Validation and boundaries

Required name, company email, title and ISO hire date; bounded text; ACTIVE/INACTIVE status; valid department UUID/FK; case-insensitive unique email. DOB rejects impossible and future dates. Private RRN accepts 13 digits with an optional hyphen; salary accepts nonnegative integer won up to 12 digits. No invented checksum, payroll/tax calculation or payroll registry. Organization names are unique under each parent and parent cycles are rejected. Authentication linkage and role management remain trusted administrative operations.

TODO (later phase / unresolved policy): profile-photo storage/upload and optional gender collection have no storage/collection policy in this slice; initials are used for employee avatars. Project summaries, career data and equipment data arrive in their assigned phases. Do not fill these areas with sample production data.

## Figma and visual review

Read frames 02 (`15:205`), 03 (`15:583`), 08 (`15:2183`), 34 (`43:2`) and 38 (`48:65`) from the approved file. The implementation preserves the existing 240px sidebar, 60px header, 40px desktop content padding, purple controls, white bordered cards, form grids, tab treatment and masked private fields. Four additional SVG exports are unmodified at their original dimensions. Responsive layouts collapse forms/cards and scroll the directory table.

Intentional scope adaptations: initials replace sample portrait photos; the directory shows real work location instead of a fabricated project value; bulk role change is absent because membership mutation remains trusted provisioning. Frame 38 is permission reference material, not a new user-facing permissions editor. Private policy copy reflects CEO plus one designated ADMIN.

Screenshots use synthetic fixtures only:

- [Directory](screenshots/phase2-directory.png)
- [Employee creation](screenshots/phase2-employee-new.png)
- [Employee details](screenshots/phase2-employee-detail.png)
- [Masked HR Private](screenshots/phase2-private-masked.png)
- [Organization](screenshots/phase2-organization.png)
- [Mobile directory](screenshots/phase2-mobile-directory.png)

## Verification and deployment boundary

Local validation passed: 12 unit/database tests, 19 browser tests, lint, production build and TypeScript checks.

Run `npm run lint`, `npm test`, `npm run build`, `npm run typecheck` and `npm run test:e2e`. Tests cover role combinations, RLS, direct unauthorized writes, atomic rollback, encryption tampering/context/rotation, private initial HTML, audited reveal/masking, action reauthorization, profile creation/edit/inactivation, directory filters, organization edits and stale writes. Browser Auth is a test double; domain requests execute against the actual migrations in PGlite as the authenticated role.

No live Supabase credentials or production employee data were available. Before deployment, apply both migrations to staging, configure real encryption keys and Google OAuth, provision test memberships and linked profiles, and verify the same flows against live Supabase/PostgREST. This PR does not claim live OAuth, production key management or deployed migration validation.
