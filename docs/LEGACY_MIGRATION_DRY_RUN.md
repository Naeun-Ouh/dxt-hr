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
