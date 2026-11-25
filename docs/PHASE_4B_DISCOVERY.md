# Phase 4B discovery — 2026-11-25

Discovery only; no schema/runtime changes or test execution. Audited main
`722f790de2283883f6b3b3af195eea7880ac8702`, AGENTS mandatory documents,
PHASE_4A_CONTEXT/DELIVERY, Issue #4 including its latest comment, and Issue #35.
The latest user instruction authorizes Phase 4B development; the existing basic-leave
hosted acceptance gate remains a condition of operational activation, not a reason
to stop independent code/test preparation. No production access was used.

## Existing implementation and gaps

| Area | Actual evidence | Remaining work |
|---|---|---|
| Basic leave | `202610060012_basic_leave.sql`; `src/lib/leave`; actions and screens | Reuse full/AM/PM requests, scoped approvals, atomic bulk decisions, leader self-leave auto-approval, cancellation reversals, past reasons and reason-free calendar |
| Annual account | SQL CHECK restricts `leave_account.bucket` to ANNUAL; adjustments are reasoned/versioned; no accrual engine | Keep confirmed opening balances/manual adjustments. Automatic entitlement needs attendance and approved company cutover rules |
| Allocation | Ledger unique(request_id,event_type); summary, submit, review and adjustment assume one account/year | Add multi-bucket allocation with exact original-source reversal and replay protection; do not rewrite existing annual history |
| Weekend/substitute | Route declared, catch-all placeholder; no table/RPC/tests | Registration, approval and grant missing; statutory/company-benefit classification unresolved |
| Birthday | Encrypted DOB and internal `birthday_calendar` month/day already exist; no authenticated SELECT | Scoped eligibility check can reuse internal projection without exposing birthdays or reactivating mail; benefit/request logic missing |
| Carryover | Project/assignment dates and extension history exist; no carryover operation | Candidate snapshot, year-end reconciliation, carryover event, use-first prompts missing |
| Holidays | `/admin/holidays` placeholder. TS has HOLIDAY_MANAGE; SQL capability switch does not | Verified holiday dataset, company dates, DB capability, workday integration and calendar missing |
| Tests | Five DB test groups and five browser tests in leave suites | Preserve cross-user/reason privacy, forged bulk rollback, concurrency, insufficient balance and cancellation; extend all new boundaries |

`STAGING_ACCEPTANCE.md` still records real Auth/team mappings, verified opening
balances and basic-leave workflow acceptance as PENDING. This is historical recorded
evidence, not a new live environment check. Local PGlite/browser mocks cannot close it.

## Confirmed DXT policy

- Fiscal/calendar-year annual administration; under-one-year monthly behavior follows
  existing Handysoft operation; tenure additions thereafter. Latest Issue #4 explicitly
  keeps actual entitlement Admin-managed until missing facts are supplied.
- Deduct substitute, then carried annual, then current annual. Birthday is a distinct
  half-day benefit, not a generic fallback balance.
- Birthday AM/PM 0.5, normal inclusive birthday ±7-day window even for a nonworking
  birthday. Outside-window project exception needs a reason. No annual accumulation.
- Weekend work can be registered retrospectively; Team Leader approval; 4+ hours 0.5,
  8+ hours 1, maximum 1. Normal validity December 31; project exception follows carryover.
- November 30 active paid external-project assignment creates a carryover candidate.
  December project completion prompts use first; only actual December 31 remainder
  carries. No fixed cap, no 30/60-day cutoff; no utilization-percentage dependency.
- Saturdays/Sundays and statutory/substitute/company holidays are nonworking. No
  employee-specific/customer-specific calendars. No automatic mail or cron.

## Legal verification and limits

Verified primary government sources on 2026-11-25; no law was encoded in this discovery.

- Annual entitlement depends on attendance, tenure and coverage, not hire date alone.
  MOEL describes 15 days after a qualifying year and monthly days for eligible shorter
  service/attendance cases; fiscal-year administration must not undercut hire-date
  entitlement. This supports retaining manual confirmed grants while attendance,
  first-year proration, rounding, monthly cutoff and migration reconciliation are unknown.
  [MOEL annual-leave guidance, including 2026-11-23 answer](https://1350.moel.go.kr/rtmview.do?id=1000306110).
- Statutory compensatory leave replacing wages requires a worker-representative written
  agreement. [Labor Standards Act Article 57, effective 2026-10-08](https://www.law.go.kr/LSW/lsLinkCommonInfo.do?lsJoLnkSeq=1029728249).
  MOEL explains that wage-equivalent leave includes applicable premium time; a simple
  8-hour-work → one-day cap cannot silently be presented as full statutory compensation.
  [MOEL compensatory-leave policy](https://moel.go.kr/policy/policybbs/workinghour/detailList.do?tpi_seq=18).
- The safe technical boundary is separate company-benefit accounting with **no wage
  discharge, payroll offset or legal-compliance claim**. Whether DXT's existing rule
  is that additional benefit or intended statutory replacement is a consequential
  company fact: confirm before activating automatic weekend grants. Do not infer that
  approving a weekend record settles wage obligations. Holiday substitution is a
  different legal mechanism; do not relabel it as this benefit.
- Calendar law changed in 2026: current rules include Constitution Day and Labor Day
  and corresponding substitute-holiday treatment. An old holiday library/list is unsafe
  without effective-date verification.
  [Current holiday regulation](https://www.law.go.kr/LSW/lsInfoP.do?ancYnChk=0&lsId=002404),
  [2026 amendment and effective dates](https://www.law.go.kr/lsInfoP.do?chrClsCd=010102&lsiSeq=285779&viewCls=lsRvsDocInfoR).
  [Labor Act implementing decree Article 30 holiday linkage](https://law.go.kr/LSW/lsLinkCommonInfo.do?lspttninfSeq=172595).
  Use published [KASI/KASA annual calendar sources](https://astro.kasi.re.kr/kor/life/post/almanac?year=2026)
  with provenance and later amendments, not a generic lunar-date guess.
- Ordinary UI nudges are not statutory annual-leave-use-promotion notices and must not
  imply extinguishment of unused-leave wage claims. No payroll settlement or automatic
  forfeiture implementation belongs in these slices.

## Smallest dependency-ordered implementation slices

1. **Holiday/workday vertical slice (independent, ready to implement).** New versioned
   holiday rows with date/type/source/publication or retrieval evidence, verified year
   coverage, checked Admin/CEO company-holiday editor, private mutation audit and public
   employee calendar projection. Reuse compact toolbar/table/Modal. Add SQL HOLIDAY_MANAGE
   parity without broadening other roles. Both TS preview and SQL request calculation
   consume the same accepted calendar; freeze charged workdays on each new request.
   New holiday facts must not silently rewrite approved requests or old ledger entries.
   Reject stale previews when calendar changes; show unsupported-year coverage clearly.
   Test weekend overlap, substitute collision, 2026 amendments, company-date edits,
   stale request, anonymous/specialist writes and historical charge preservation.
2. **Multi-bucket ledger foundation (ready with manually confirmed grants).** Expand
   account buckets additively; preserve all annual rows and request IDs. Introduce stable
   grant/source or allocation identity, per-bucket validity metadata and per-source
   deduction/reversal uniqueness. Lock employees before account/request rows consistently.
   Priority is substitute → carryover → annual; approved cancellation restores the exact
   sources originally consumed, not today's priority. Keep source validity/history and
   expiry eligibility separate from deleting balances. No automatic annual accrual,
   wage replacement or destructive expiry. Test split deduction, cancellation after
   year-end, replay, competing approval, full-batch rollback and own-only balances.
3. **Birthday half-day (mostly ready after foundation).** Auth-derived own eligibility;
   internal month/day check without exposing the raw birthday table. Separate benefit-year
   cap, project-exception reason, AM/PM only; existing approval lifecycle. Include Jan/Dec
   boundary, ±7 inclusivity, holiday dates, duplicates, reversal and cross-user tests.
   Leap-day/non-leap-year birthday and cross-calendar-year window entitlement ownership
   are unconfirmed policy edges: expose explicit admin-reviewed exception handling until
   settled rather than invent February 28/March 1 or duplicate annual grants.
4. **Project carryover preview + explicit apply (partly ready).** Snapshot November 30
   assignment/project evidence; never use utilization. Show candidates and December
   completion reminders in existing leave administration. At year-end, lock/reconcile
   actual remainder and apply a uniquely keyed paired transfer with source provenance;
   no automatic cron or artificial cap. Existing project records represent paid external
   work by domain policy, so no new payment flag is needed. Current assignment state is
   mutable and historical Nov30 status cannot always be reconstructed: do not fabricate
   historical eligibility from today's ACTIVE flag. Use verified dated source/manager
   reconciliation for prior years. Retroactive prior-year cancellation after carryover
   needs an explicit correction path; never duplicate restored entitlement in two years.
5. **Weekend registration/review then grant activation.** Own time intervals, explicit
   breaks/worked minutes, optional own assignment, reason and direct-team review can be
   prepared with no statutory wage-offset claim. Preserve work evidence and deny overlaps,
   cross-user IDs, role-switch replay and double approvals. Do not infer that leave's
   Team Leader self-auto-approval also applies to weekend-work grants. Grant activation
   waits for the company-benefit/legal classification and leader-own-work approver rule.
6. **Operational acceptance.** Rebase each focused PR on merged main; full lint/build/
   typecheck/DB/browser/domain regression, synthetic screenshots, migration order and
   HEAD. Hosted Auth/RLS/calendar/ledger acceptance and verified balances remain separate
   before switching away from the existing leave system.

## Facts requiring policy owner, not routine UI questions

- Existing Handysoft entitlement/export policy: attendance inputs, initial fiscal-year
  proration/rounding, monthly cutoff, opening/cutover balances and reconciliation.
- DXT weekend benefit versus statutory wage replacement, applicable written agreement
  if replacement is intended, and approver for a Team Leader's own weekend work.
- Only if exercising those edges: leap-day birthday in non-leap years and ownership of
  a birthday window crossing calendar years. Ordinary in-year windows need no new policy.
- Historic carryover eligibility when dated assignment evidence is absent; no invented
  historical active state. Current-year prospective candidate snapshots can proceed.

All other compact UI, technical locking/idempotency, explicit source provenance,
validation copy, accessible overlays and negative tests can be decided autonomously.
