# Leave balance and request experience

Read-only presentation over existing authenticated leave_sources/summary/request RPCs. No new schema, permissions, ledger writes, source eligibility or approval rules.

- Separate current annual/carryover/substitute/birthday balances, net annual use, annual and birthday pending requests, non-reserving pending estimate, 60-day expiry horizon, and unconfirmed validity balance. Missing grant evidence is shown as needing confirmation, not a zero entitlement.
- Request preview enumerates working dates, excluded weekends and weekday holidays, and substitute → carryover → annual estimated bucket deduction/remaining amounts. Estimates exclude other pending requests and are revalidated at submission/approval.
- Cross-year requests show each year's working interval/day count and verified available balance, requiring explicit separate applications. Existing single-year CHECK, calendar revision pin and allocation constraints are intentionally preserved. Same-year source-validity boundaries explain split requirements.
- Admin overview identifies expiring and unconfirmed amounts for usage planning. This does not certify statutory leave promotion, extinguish a right, or determine wages.
- Reuses existing verified holiday years and DXT components. No hosted mutation.

Validation: four focused unit tests cover unknown evidence, separate birthday/pending, calendar exclusions, allocation priority, half-days and split boundaries. Added browser journey + cross-user source denial and team-leader admin-route denial. Parent runs canonical browser/build and full regression; browser screenshot target docs/screenshots/leave-experience-request.png.

## Grant provenance and promotion review follow-up

Annual positive grant/adjustment totals and negative adjustment totals are taken from source-linked annual ledger events, separately from net annual deductions/reversals. Legacy sources are excluded from confirmed grant totals and explicitly flagged for original evidence review. A current balance is never treated as the original grant. Positive adjustments may include restored amounts, and negative adjustments may include carryover movements; labels do not imply statutory entitlement.

Admin help provides a manual Article 61 review checklist and general statutory timing (six months/ten days and two months), with a separate first-year rule warning. Sources checked 2026-11-26: [Labor Standards Act Article 61](https://www.law.go.kr/법령/근로기준법/제61조), [Ministry of Employment and Labor procedural guidance](https://1350.moel.go.kr/rtmview.do?id=1000269430). Employee-specific legal targeting/date calculation, written delivery/response evidence storage, sending and legal completion judgments remain unsupported; the 60-day expiration horizon is not legal promotion fulfillment. No wage waiver, rights extinction, mail or cron operation occurs.
