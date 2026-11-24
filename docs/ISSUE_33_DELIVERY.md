# Issue 33 — Employee HR card and private documents

## Scope and policy

The compact v2 employee header retains name, email, department, title, employment
status and hire date. URL tabs now use 기본정보 / 인사정보 / 인사서류 / 프로젝트 /
커리어 / 장비 / 근로계약, filtered by the existing domain scopes. The prior private
URL remains compatible. Existing private fields stay encrypted and masked until
explicit audited reveal. No general directory thumbnails or bank account extraction.

Issue 33's broad ADMIN wording is interpreted through AGENTS/PERMISSIONS: only CEO
and the single designated ADMIN with PRIVATE_HR_ACCESS manage documents. Ordinary
ADMIN, TEAM_LEADER and specialist roles do not gain private access. Active linked
employees may read their own published BANKBOOK_COPY, RESIDENT_REGISTRATION_COPY and
RESUME. OTHER_HR and archived history remain private HR only. Additive roles never
grant team scope. Self upload is intentionally not included; employees request updates
from HR. No new permission capability, OCR, payroll or advanced leave scope.

## Schema and storage

New migration `20261124134708_employee_hr_documents.sql` adds employee_hr_document
and append-only employee_hr_document_event. Per employee/type versions are allocated
under an employee row lock. Each upload creates a new immutable identity/path/hash;
previous records remain until explicitly archived, and archive never deletes bytes.
This supports side-by-side review before archiving an old resume. No existing migration
is modified. Incomplete uploads remain hidden; version gaps are valid.

A private employee-hr-documents bucket has no authenticated/anonymous object policy.
The server uses a server-only service adapter after authorization; no browser upload,
Storage URL, reusable signed URL or object overwrite is provided. The DB generates
an employee/document UUID path; the client cannot supply it. Supported PDF/PNG/JPEG
are limited to 10 MiB each, with filename/extension/MIME/magic and parser/decode checks.
SHA-256 and size are verified again on read. Files retain original bytes.

Reserve/archive RPCs require PRIVATE_HR_ACCESS. Finish is service-role only and checks
Storage metadata before making a reservation ready. Read RLS and access RPC independently
check current identity/capability. Public/anon execution and direct table writes are
revoked. Mutation guards preserve paths, employee ownership, versions and events.
Audit captures UPLOAD, VIEW, DOWNLOAD, ARCHIVE, actor and DB time, not document content.
VIEW/DOWNLOAD record an authorized access attempt before streaming; transport failure
can leave an audit event without a completed browser download. Archive is replay-safe.

`/api/hr-documents/[id]` rechecks server ownership and DB authorization on every request,
validates digest and returns private/no-store, nosniff and sandbox CSP. `?download=1`
sets attachment disposition. Metadata tabs use the existing dynamic protected page.
The storage adapter isolates provider calls and persists only logical paths.

## Verification

Local tests use synthetic personnel/files, real PostgreSQL RLS/RPC execution in PGlite,
and the existing Auth/PostgREST/Storage HTTP test double. Browser tests exercise upload,
versions, own download, archive/history, stale-role actions, forged path rejection,
private cache headers, cross-user/Team Leader/ordinary ADMIN denial and direct Storage
denial. Existing encryption/reveal, asset, leave, expense, contract and seal tests remain
in the full regression suite. Counts and CI results are recorded in the PR.

Screenshots: issue33-document-upload.png, issue33-document-history.png,
issue33-self-documents.png (synthetic documents only).

## Hosted staging and remaining limits

No production data or hosted database/storage was accessed or migrated. Hosted staging
must apply migrations, configure the server-only service key, verify real role sessions,
Storage rejection and the hosting request-size ceiling (a 10 MiB application limit may
exceed a provider's request-body limit). Malware scanning, OCR and automatic retention
are not implemented. Sandbox preview reduces active-document execution in the browser;
it is not antivirus certification of downloaded documents. Interrupted uploads may
leave hidden reservations/objects for authorized manual reconciliation; no cleanup cron.
Preserve database rows, private objects and existing HR encryption keys in backups.
Google login is unchanged; automatic Gmail and cron remain disabled.

### Local regression result

- lint / production build / typecheck: passed.
- Unit + PostgreSQL/RLS: 94 passed.
- Full Chrome browser suite: 78 passed; affected employee/document tests rerun after
  the final upload-form state reset. GitHub CI status is recorded in the PR.
