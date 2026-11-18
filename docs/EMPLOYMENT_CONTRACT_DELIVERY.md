# Employment contracts delivery

## Scope and policy

Employment contracts only. Google OAuth is unchanged; no Gmail delivery or cron.
Templates contain approved human-authored text; this change supplies no invented legal
clauses, salary formula, retention period or legal-enforceability guarantee. Explicit
consent is recorded through the authenticated Google-linked employee account and CEO
account. It is not a certificate-based/PAdES signature or an independent timestamp service.

Existing HR privacy remains intact: ordinary ADMIN operates metadata/send/cancel;
CEO and the designated PRIVATE_HR_ACCESS ADMIN create/preview/read sensitive documents.
Employees read/sign their own sent contracts. TEAM_LEADER has no team scope. Additive
roles do not prevent an ADMIN/CEO who is also an employee from signing their own contract.

## State transitions

| From | Action / actor | To |
|---|---|---|
| DRAFT | preview confirmed by private administrator | READY_TO_SEND |
| DRAFT / READY_TO_SEND | revise by private administrator | DRAFT, next immutable version |
| READY_TO_SEND | send by contract manager | SENT |
| SENT | actual employee view | VIEWED |
| SENT / VIEWED | own employee consent, exact version/hash | EMPLOYEE_SIGNED |
| EMPLOYEE_SIGNED | CEO consent | same state, company_signed_at set |
| EMPLOYEE_SIGNED with both signatures | trusted server uploads PDF and finalizes | COMPLETED |
| DRAFT / READY_TO_SEND / SENT / VIEWED | contract manager cancellation | CANCELLED |
| SENT / VIEWED | own employee decline | DECLINED |

Terminal records cannot be edited. Sent body changes require cancellation/new contract.
Bulk creation is one DB transaction, capped at 100 employees; Employee Master snapshots
are captured by the database. Approval of each preview remains explicit before sending.

## Security and evidence

RLS protects contract metadata, encrypted versions, templates, signatures and events.
All authenticated mutations use checked RPCs; direct table writes are revoked.
Employee signing accepts contract/version/hash/consent, never employee ID or role.
It requires the real auth.uid() -> ACTIVE employee.auth_user_id -> contract.employee_id
chain, an auth.identities Google record, and signed JWT OAuth AMR / Google app_metadata. Password, magic-link, missing and non-Google claims fail even for Google-linked accounts. Company signing separately requires CEO.
The [Supabase JWT claims reference](https://supabase.com/docs/guides/auth/jwt-fields) defines the trusted AMR/provider fields. The application login remains Google-only; enabling additional auth providers would
require revisiting the session-authentication policy before deployment.

Every signing RPC locks the parent row, verifies the current immutable version/hash,
and writes a unique party signature and audit event transactionally. A repeated matching
signature is a no-op, including after completion. Server/DB timestamps cannot be supplied
by the browser. Old versions, false consent and substituted hashes fail.

Contract text is AES-256-GCM encrypted with ID/version AAD; the stored plaintext-body
SHA-256 is checked again after decryption before display/rendering. The final PDF SHA-256
is computed over actual bytes and checked again at download. PDF embeds the frozen
employee snapshot, contract ID/version, body hash and both auth actors/signature times.
It cannot contain its own digest, so the completed document digest is in DB and detail UI.

Private `employment-contracts` bucket has **no authenticated object policies**, blocking
raw path reads, upload, replacement and signed URL minting. Server upload uses fresh paths
and `upsert:false`. Only the service-role RPC can finalize a PDF reference, after both
signatures and object existence. Server download checks current own/private scope and
returns `private, no-store`; no stored public/signed URLs. No sensitive body logging.

## Failure recovery and operational risks

DB and object storage cannot share one transaction. CEO consent is durable before PDF
creation; a failure leaves EMPLOYEE_SIGNED and exposes CEO “PDF 보관 재시도”. Concurrent
retries may upload orphan objects but only the first finalization wins; it never replaces
the completed pointer/hash. Orphan cleanup is an explicit operator task after checking
DB references, not a cron dependency. Never delete referenced objects.

Before live rollout: apply the new migration, confirm private bucket and blocked direct
access, configure the existing server-only HR keyring/service key, verify Google identities,
and run real staging acceptance with synthetic accounts and storage. Local PGlite and
mock-auth browser checks are not evidence of hosted Supabase/Google/Vercel verification.
Key backup/rotation, retention policy, approved contract wording and legal evidence
requirements remain owner decisions. Hosted DB/storage owners can bypass application
permissions and must be administratively controlled and backed up.

## Verification

Results and screenshots are finalized in the PR after the complete check suite.

PDF rendering uses an SFNT conversion of the pinned Korean WOFF font and full font
embedding. This avoids font-subset glyph loss observed during actual PDF rasterization;
reviewed Korean body text, numeric pay fixture, hash and both signature records remain
readable. The approximately 0.9 MB font contribution per document is intentional.

Dependency review upgraded Next.js and its ESLint config to 16.4.6 and refreshed compatible
vulnerable transitive packages. This addresses the existing Server Actions DoS advisory
[GHSA-p3m5-59mp-jv5r](https://github.com/advisories/GHSA-p3m5-59mp-jv5r) and related runtime
advisories. Full npm audit still reports the existing development-only picomatch ReDoS
chain (14 high entries, no patched picomatch range advertised); do not apply the suggested
breaking downgrade to Next 14 tooling. Production-only audit is recorded separately.

Final local checks (synthetic fixtures only): lint, production build and typecheck pass;
61 unit/database tests pass on CI-equivalent Node 22; all 51 browser tests pass, followed
by a 4-test contract-flow rerun after the OAuth-claim hardening. Node 24 encountered a
PGlite/V8 native WASM assertion during one parallel run; Node 22 completed normally.
`npm audit --omit=dev`: 0 vulnerabilities. Full audit: 14 development-only warnings as
noted above. Screenshots: contracts-employee/admin/ceo/completed/pdf in docs/screenshots.
No live migration, real Google account signing, hosted Storage check or deployment was
performed by this PR. Existing staging evidence files are preserved.
