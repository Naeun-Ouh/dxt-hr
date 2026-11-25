# Phase 4B — holidays and workday calculation

Focused first slice of Issue #4 under Issue #35. It does not complete Phase 4B.
Automatic annual entitlement, birthday entitlement, project carryover and weekend
wage/benefit decisions remain outside this PR. Google OAuth/mail shutdown are unchanged.

## Screens and behavior

- `/admin/holidays`: DXT Design System v2 compact toolbar, source/version row, dense
  holiday table and shared accessible Modal for company-holiday create/update/remove.
- `/leave/request`: Saturday/Sunday and active statutory/substitute/company holidays
  are excluded from the preview and authoritative DB calculation. Half-days require a
  working day. Only verified calendar years may be submitted; an unsupported year shows
  an actionable message instead of silently treating weekdays as workdays.
- `/leave/team-calendar`: holiday labels alongside the existing reason-free team
  projection. New approved requests render only their originally frozen working dates.

## Data and migration

Apply `20261124221310_leave_holiday_calendar.sql` after all previous migrations.
`holiday_year` stores coverage, revision, source/version and verification date;
`holiday_calendar` stores full-day dates and active company entries; `holiday_event`
retains before/after administrative changes. Removal deactivates, never purges history.
The migration extends the installed capability switch without discarding independently
added contract/certificate/HR capabilities. Old migrations are unchanged.

The initial reviewed coverage is **2026 and 2027**, not a guessed perpetual holiday engine.
The 2026 list has 22 dated entries and 2027 has 24. Both use official-year announcements and the 2026 legal amendment.
Weekends are calculated separately and are never double deducted. Same-date statutory
and company entries are safe: exclusion uses existence, not a count. There are no
employee/customer calendars or automatic imports/cron jobs.

Primary provenance reviewed 2026-11-25:

- [KASA 2026 almanac announcement, 2025-06-30](https://www.kasa.go.kr/prog/bbsArticle/BBSMSTR_000000000010/view.do?bbsId=B000000000010&nttId=B000000001860Pe2zT3)
- [KASA 2027 almanac announcement, 2026-06-29](https://www.kasa.go.kr/prog/plcyBrf/brief/kor/sub01_01_04/view.do?plcyBrfNo=431)
- [NEC election-date record](https://www.data.go.kr/data/15162288/fileData.do)
- [Current holiday regulation](https://www.law.go.kr/LSW/lsInfoP.do?ancYnChk=0&lsId=002404)
- [Decree 36290 amendment](https://www.law.go.kr/lsInfoP.do?chrClsCd=010102&lsiSeq=285779&viewCls=lsRvsDocInfoR)

The amended regulation adds Labor Day and Constitution Day. The preliminary KASI
`calendarData` pages expressly disclaim official status: they were cross-checks, not
sufficient authority to seed future years. Add another year or an extraordinary public
holiday through a reviewed additive data migration carrying the new official source,
verification date and year revision. Company editors cannot turn company dates into
statutory coverage or edit official rows. No external API key is needed at runtime.

## Concurrency and historical integrity

Every company edit increments its calendar-year revision under an exclusive row lock.
`submit_leave_checked` takes a shared lock and rejects an old preview revision, then
reuses the existing employee/ledger/approval lifecycle. Direct authenticated execution
of the previous submit RPC is revoked, preventing bypass of preview checking.
New requests freeze working dates and calendar revision in the same transaction.

Approval holds calendar locks before the existing ordered employee/request locks. If a
new pending request's actual working dates differ, approval fails atomically with
instructions to reject and resubmit. Migration-era pending requests compare the old
charged day count against the verified calendar; no silent repricing occurs. Unchanged
working dates remain approvable after an unrelated edit. Rejection/cancellation do not
require current-year coverage. Approved records and ledger entries are not rewritten;
cancellation restores their original debit, including old weekend-only calculations.
Legacy approved requests retain null work-date snapshots rather than fabricated history.

## Security and verification

Employee access reads active calendar dates and source metadata only. Admin/CEO's
existing HOLIDAY_MANAGE capability is now enforced in SQL as well as server actions.
Authenticated table writes and direct internal-helper execution are revoked. RLS keeps
administrative event details and removed entries manager-only. Identity comes from the
existing trusted membership/auth.uid boundary, never submitted roles. All new definer
functions have empty search paths, explicit grants and scoped checks where callable.
No leave reasons are added to the team-calendar payload.

Added DB tests cover year coverage, 2026 amended holidays, full/half-day parity,
company edit scope, official-row tampering, anon/direct writes, audit preservation,
stale submission, obsolete pending approval, preserved approved ledger/reversal and
cross-user leave isolation. Added browser tests cover the compact company-holiday CRUD,
request calculation/reload, stale preview, unverified future year and role-switch replay.
Existing browser past-date examples move from October 5 (a public holiday) to October 2.

Local test counts and hosted CI results are recorded in the PR after execution.
Screenshots: `phase4b-holidays.png`, `phase4b-holiday-request.png` (synthetic fixtures).
Hosted Supabase/Auth acceptance and verified opening balances remain an operational
activation gate. No local mock result is claimed as live acceptance.

Local lint/typecheck and four focused DB/security groups passed, including verified
2027 opening-balance/request and capability preservation. Full unit/build/browser
regression runs in CI because the host Mac exhausted disk during the preceding PR34
suite. CI browser-evidence includes the holiday admin and leave request screenshots.

After disk recovery, local production build/typecheck and all seven holiday/basic-leave
browser tests passed. Tests explicitly match the existing 1.0-day detail format and
scope form errors separately from Next.js route announcements. Both new UI screenshots
are committed. Full CI reruns on this reviewed HEAD; the previous run passed every
non-browser step and 76/77 browser cases before the assertion correction.

## Integration review — 2026-11-25

Prepared on the merged HR document main (`4d13df5`) and the reviewed certificate
branch. Apply document migrations, certificate migration, then holiday migration in
filename order. HR document routes/tabs, private scope, certificate settings/PDF,
and holiday handling coexist in the shared route and browser fixture. The added
`integrated-scopes.test.ts` executes the actual migrations together and verifies
ordinary/admin/designated-HR/CEO/specialist scope separation, private buckets and
service-only publication RPCs. This is synthetic integration evidence, not hosted
role-session acceptance. PR #36 must merge before this dependent PR; rerun against
its final merged main if the reviewed source changes. Issue #4 remains open.
