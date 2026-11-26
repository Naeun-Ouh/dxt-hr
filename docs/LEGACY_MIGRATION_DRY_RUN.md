# Legacy migration dry-run — Issue #35

This is an **offline review tool**, not an import permission or an apply mechanism.
It has no database, Auth, Storage, server-action or network client. No schema, UI,
role, operational history or balances change. Existing asset validation and expense
workbook/parser validation are reused. This PR does not close the migration roadmap.

## Run

Use Node 22 and installed repository dependencies:

```sh
node --import tsx scripts/legacy-dry-run.ts json /secure/source.json /secure/mapping.json /secure/new-report.json
node --import tsx scripts/legacy-dry-run.ts xlsx /secure/legacy.xlsx /secure/mapping.json /secure/new-report.json
```

Sources are capped at 5 MiB; mappings at 1 MiB. Output must not already exist (including
symlinks), is created with mode 0600, and never overwrites inputs. Stdout contains only
status/counts. Exit 0 means ready for **human review**, 2 means a written blocked report,
1 means invalid input/I/O. Errors never echo paths, employee names, source cell text,
credentials or raw parser errors. The report includes sheet names, row positions,
amounts and hashes; treat it as confidential local data, not a public artifact. Do not
commit source/mapping/report files or upload them as CI artifacts. No remote source is
retrieved and no real workbook is bundled. Tests use synthetic data only.

## Explicit mapping / inventory contract

```json
{
  "version": "review-1",
  "reviewedSourceSha256": "<64 lowercase hex SHA-256 of exact source bytes>",
  "asOf": "2026-01-31",
  "employees": {"legacy-person-key": "<reviewed employee UUID>"},
  "expected": {"records": 1, "assets": 1, "expenseAmount": 0, "historyPeriods": 0},
  "exclusions": []
}
```

JSON source is an array of records. Every record has an explicit `key`, `sheet` and
positive physical `row`, optional `employeeKey`, and exactly one `asset` or `expense`.
Keys are source identifiers, not names guessed into employees. Employee UUID format
is validated; existence and identity correctness are a separate reviewed-map gate.
Duplicate source keys and case/whitespace-normalized serial numbers block all affected
rows. The report hashes keys, serials, employees and payloads rather than echoing them.
Changing source bytes or mapping changes provenance; stable record keys are scoped to
an exact source hash. Do not treat this as a cross-file deduplication database.

Asset fields: `type`, `status`, `manufacturer`, `model`, `serial_number`, using current
DXT enum values. `employeeKey` maps the current holder. Optional `history` is an ordered
array of `{employeeKey,start,end}` with ISO dates and null end for current possession.
Invalid/overlapping periods, multiple open holders and holder mismatch block review.
No dates/events are invented when history is missing; a current holder without history
has a warning and zero history periods. Windows keys/accounts are outside this tool.

Expense input uses the existing `ItemInput` shape in `src/lib/expenses/types.ts`.
Integer won amounts, pinned `asOf` dates and existing error/warning rules apply. UUIDs
for attendees must appear in the explicit employee map. Project/card/attachment
references block review in this first slice: those need separate approved mappings.
No receipt readiness, paid state, lock state or submission timestamp is inferred.

For XLSX, add `workbook` with `month`, explicit `vehicleDate`, `attendees` containing
`{key,email}` for reviewed employee mappings, and `rows` keyed by exact parser origin:

```json
{"month":"2026-01","vehicleDate":"2026-01-10","attendees":[],"rows":{
  "주유비,통행비!6 (주유비)":{"key":"legacy-fuel-1","employeeKey":"legacy-person-key"}
}}
```

The existing parser accepts the two DXT sheets, validates archive bounds, computes
vehicle amounts from one-way amount × count, and excludes legacy SAMPLE areas and
summary rows. This wrapper requires a mapping for every parsed origin and rejects
unused mappings. It does not independently discover every ignored workbook cell.
The reviewer must supply the source inventory, expected counts/totals and explicit
excluded business rows; blank cells/formatting are not business records. Exclusions
use `{key,sheet,row,reason,amount}` with reason SAMPLE, SUMMARY or OUT_OF_SCOPE.
For duplicate summary totals, amount is zero to avoid double counting detail. This
choice must be reconciled against the source by a reviewer, not assumed by tooling.

`records = candidate input rows + excluded business records`.
`expenseAmount = valid integer expense amounts (including rejected rows) + excluded amounts`.
`assets` and `historyPeriods` count input asset records and explicitly supplied periods.
Each mismatch blocks review. Invalid monetary values also block review and are not
silently coerced to zero valid amounts. Records may remain REVIEW_CANDIDATE when a
source-level reconciliation error blocks the whole manifest; **only reviewStatus**
indicates whether the report is ready for human review. It never authorizes applying.

## Apply gate — intentionally not implemented

Before any future bulk write, separately approve actual sources and source hashes,
cutover, employee/foreign-reference mappings, exclusions and totals, existing-target
conflict/idempotency strategy, receipt/file linkage, exact historical payment/lock
states and assignment chronology, rollback and authorization/audit design. Normal
asset save must not manufacture backdated assignment events. Normal expense submit
must not reconstruct paid or locked history. Preserve existing history and immutable
records. No fabricated employee/balance data, secrets or production writes.

## Verification / limits

Unit tests cover deterministic output, exact-byte provenance, duplicate keys/SNs,
identity mapping, invalid date/money, history conflicts, reconciliation/exclusions,
actual-layout synthetic workbook parsing, and CLI privacy/no-overwrite behavior.
No new web surface or database privilege exists; existing cross-user/RLS regression
remains required at integration CI. Hosted Auth/Storage acceptance is independent.

## Private mapping and review workspace (Issue #35)

`/admin/migration-review` provides a compact DSv2 workspace over the same offline engine. Access requires the existing `PRIVATE_HR_ACCESS` capability (CEO or designated private-HR administrator), independently checked on the page and every preview request. Ordinary ADMIN, Team Leader, expense/asset specialists, and employees do not gain migration access. This combined legacy source may contain sensitive personnel data, so specialist scope is not sufficient. No new capability, database table, RLS policy, persistent draft, service key, or apply endpoint is introduced.

1. Select an authorized, synthetic/non-production JSON or XLSX source. The browser computes its SHA-256; explicitly designate that exact source as the review baseline.
2. Load an existing mapping JSON or connect source employee keys to Employee Master entries. Specify mapping version, cutoff date, and independently checked reconciliation totals.
3. Use the advanced mapping editor for exclusions and explicit legacy Excel row/origin mappings. This initial UI intentionally does not infer employee identity or silently map workbook rows. The existing CLI mapping format above remains authoritative.
4. Run write-free validation. Review candidate/rejected records by source sheet/row, search and page through the results, and inspect diagnostics and expected/observed totals. Missing history remains missing; the UI never fabricates historical assignments.
5. Only an error-free report permits the local review acknowledgement. Diagnostic export remains possible for blocked reports. All exports contain `applyAuthorized: false`; acknowledgement is neither authorization to import nor proof of historical eligibility.

Source/mapping edits immediately discard the report and acknowledgement; request generation checks prevent a delayed response from restoring an obsolete report. No source, mapping, or report is kept in browser persistent storage. Exported reports still contain amounts and source locations and must be handled as confidential local files.

Web limits are **3 MiB source, 512 KiB mapping, 4 MiB total request**, lower than the CLI limits to fit hosted transport constraints. The endpoint authenticates before reading the body, requires the exact same Origin, bounds the actual streamed bytes independently of Content-Length, verifies employee mapping UUIDs against the authenticated live directory, and returns `private, no-store`. Errors do not echo source content. The parser and report have no database or Storage write path. Existing XLSX archive/row limits still apply.

Verification: focused unit tests exercise stream limits (including false Content-Length), deterministic preview, unknown employee mappings, source hash mismatch and unsupported/oversized files. Browser coverage exercises synthetic asset mapping/reconciliation/export, edit invalidation, blocked acknowledgement, session downgrade, ordinary-admin/leader/specialist/anonymous denial, CSRF, response caching, and CEO access. These are local synthetic checks; hosted acceptance and reviewed real-source import remain separate gates. Bulk apply remains unsupported.
