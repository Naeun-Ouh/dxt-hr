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

## PR #21 signature-evidence review follow-up

`20261119104141_contract_signature_evidence.sql` adds immutable `auth_session_id`,
`authenticated_email` and `auth_provider` to the existing signature row. Both original
RPC interfaces remain contract/version/hash/consent only. A non-exposed, execute-revoked
private helper reads the trusted JWT session UUID, verifies its matching auth.sessions
user and not_after, and captures confirmed auth.users.email and auth.identities.provider.
Google OAuth AMR/provider checks remain mandatory; user_metadata and form fields are
never evidence sources. Session IDs are identifiers, not access/refresh tokens; no tokens
are persisted. The private PDF prints the full identifier, email and provider alongside
actor UUID, DB time and exact document hash. No evidence values are added to logs/events.

Session lookup follows the [Supabase session documentation](https://supabase.com/docs/guides/auth/sessions).
Deleted, missing, malformed, other-user and explicitly expired sessions fail closed.
Supabase inactivity/single-session settings still have their documented refresh-time
semantics. Auth configuration and live Google sessions require staging verification.

Signatures use evidence protocol `authenticated-google-consent-v2`. A different valid
session/email on retry cannot rewrite the first signature or create another event.
The session UUID deliberately has no foreign key to auth.sessions, so sign-out and
routine session cleanup cannot erase evidence. Existing pre-upgrade signatures/PDFs
are never rewritten or backfilled with guessed historical values. Nullable columns and
a NOT VALID check preserve those old rows while requiring the full tuple on every new
insert; old PDF-generation records explicitly show “이전 증적: 미기록” if unavailable.
If legacy rows exist, do not validate that constraint or claim they have v2 evidence.
IP/User-Agent capture is deferred: no untrusted forwarding headers are stored as evidence.

Regression coverage includes both signers, missing/malformed/foreign/expired/deleted
sessions, unconfirmed email, rejected additional RPC arguments, ignored forged HTML
fields/user_metadata, email changes and new-session replay, immutable evidence after
session deletion, and migration of legacy signatures. Full check results are recorded
in the PR; all use synthetic fixtures, not live staging accounts.

Review follow-up local result: lint/build/typecheck pass, 64 unit/database tests and
52 browser tests pass. Updated PDF rasterization confirms both evidence records.

## Document UX and company seals (2026-11-20)

The detail view now pairs an A4-style document with a summary, five-step progress
indicator and a signing rail. Employee lists separate required signatures, company
signature waiting, completed and past contracts. Admin lists prioritize pre-send
review and active signatures. Explicit consent enables the signing CTA; pending
submissions disable it. Completion shows both Seoul signing times and integrity
information. Existing private-body and own-contract boundaries are unchanged.

`/admin/contracts/seals` uses EMPLOYMENT_CONTRACT_MANAGE (ADMIN/CEO, including ordinary
ADMIN). This does not grant contract-body access. The new private `company-seals`
bucket has no authenticated object policies; even managers use the authorized,
`private, no-store` server preview. Employees see only the image baked into their
own final PDF. No public/signed URL is stored or minted.

Apply `20261120030704_company_seals.sql` after the existing contract/evidence
migrations and before deploying the application. Existing migrations are unchanged.
`company_seal` stores a random object path, normalized PNG digest, company/representative
names, DB upload timestamp, actor and ready/active flags. Metadata is immutable;
activation/deactivation events are append-only. Authenticated clients have SELECT
with manager RLS and no direct mutation grants. Checked RPCs reserve and activate
records; activation requires the reserving manager, uploaded object and expected
previous active ID. A partial unique index and shared transaction advisory lock
serialize activation/deactivation with company signing. Stale replacement fails.

The existing CEO signing RPC remains separate from employee signing. A DB trigger
snapshots the active seal ID and company/representative names into the immutable
company signature in that transaction. PDF retries load that exact seal, verify its
SHA-256, and never consult the latest active seal. Even replacement between signing
and storage finalization cannot change the selected image. Completed PDF generation
returns immediately; the existing first-writer-only finalization and pointer/hash
immutability remain. Downloads verify the original PDF digest. Pre-migration
signatures retain null seal fields; they are not retroactively stamped.

Upload accepts PNG only, at most 1 MiB and 2048 pixels per dimension. Server decoding
rejects malformed/excessive images and APNG, then re-encodes to strip metadata and
trailing content before hashing/uploading with `upsert:false`. The private bucket
caps normalized output at 2 MiB. See the [Sharp constructor bounds](https://sharp.pixelplumbing.com/api-constructor/)
and [PNG output documentation](https://sharp.pixelplumbing.com/api-output/#png).
No seal is required: with none active, new company signatures retain the DXT label
and DB-linked signer name. Uploaded seal names are explicitly entered by a manager.
There is no real production seal seeded; screenshot/test seals say TEST.

Limitations and rollout checks:

- Local PGlite/mock-auth/Storage browser results are separate from real staging;
  hosted Google OAuth, bucket/RLS and Vercel native Sharp runtime still require
  staging acceptance with synthetic accounts. No production data was used.
- Storage and DB cannot commit together. Upload failure or stale activation can
  leave an inactive pending record/object; PDF retry can leave an orphan PDF.
  Operator cleanup must check references. Never delete historical referenced seals.
  No automatic Gmail or cron operation is enabled.
- A seal image is visual evidence, not a certificate/PAdES signature, timestamp
  authority or independent proof of company authorization. Existing authenticated
  consent evidence is retained; legal wording/retention remain owner decisions.
- Managers can replace the active seal while a CEO has a page open; the transaction
  records the active seal at actual signing, not at page render. The frozen record
  and final PDF are authoritative. No additional seal-approval workflow is invented.

Seal/UX local verification: lint, production build and typecheck pass; 68 unique
unit/database tests pass (67-test full run plus the added legacy-seal migration
regression, followed by all four seal tests). Full browser suite: 53 passed.
Final-build seal browser flow was rerun separately. Screenshots were visually checked,
and the synthetic sealed PDF was rasterized and reviewed. GitHub CI results are
recorded in the PR; these checks do not claim live staging acceptance.
