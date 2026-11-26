# Leave activation readiness — Issue #4 / #35

Reviewed 2026-11-26 against main `086fe5709a468f05aa295db468dc53a1cd01ae2f`,
PR #39 comment 7178153087 and Issue #35 comment 7178153883. This is an implementation
contract for later activation, not authority to grant days, import balances or offset pay.

## Confirmed rules and executable review boundary

| Flow | Confirmed DXT rule | Required input before a grant can be proposed | Apply boundary |
| --- | --- | --- | --- |
| Annual | Calendar-year management, monthly first-year behavior, tenure additions, manual reasoned correction | Approved Handysoft policy/export, attendance and monthly eligibility, proration/rounding and cutoff, hire dates, verified opening balances, already-granted days | No hire-date-only calculator. A future preview must show provenance and differences before a separate authorized atomic apply |
| Carryover | November 30 paid external-project evidence; December ending use-first; only actual December 31 remainder; no day cap | Confirmed dated project evidence, source-level year-end remainder and revision, receiving year, existing transfer identity | Receiving-year December 31 validity per latest review; no unlimited carryover. Paired source debit/credit must conserve days and reject duplicate apply |
| Substitute | Verified weekend evidence; 4h → 0.5, 8h → 1, max 1; normal annual-policy validity | Company-benefit vs statutory-compensation classification, approved minutes/breaks, leader-own-work reviewer policy, prior grant identity | Evidence approval alone never creates a grant or settles wages. Separate preview and deliberate grant after policy approval |
| Birthday | AM/PM half-day, inclusive ±7-day window, project-prevented exception, no accumulation | Verified private birthday projection; actual project-related exception evidence when needed | Existing approval scope retained; ambiguous leap/year boundary blocked explicitly rather than choosing a date or double-granting |

Expiry is a **use-eligibility boundary**, not deletion of historical ledger value or
an assertion that a wage claim is extinguished. PR #39 must distinguish recorded balance,
date-usable balance and unverified historical validity. Exact historical reversals retain
original source identity and validity. An expiry-spanning request needs eligible workdate
allocation or a clear safe split; it must never silently charge a lower-priority source.

## Policy verification

- [Labor Standards Act Article 60](https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1034322305)
  makes statutory annual entitlement dependent on qualifying service/attendance. This
  supports collecting eligibility evidence before deriving grants; it does not establish
  DXT's missing first-year rounding or migration cutoff rules.
- [MOEL fiscal-year guidance, including 2026-11-23 answer](https://1350.moel.go.kr/rtmview.do?id=1000306110)
  explains that fiscal-year administration must be reconciled against hire-date entitlement
  without disadvantaging employees. Retirement settlement depends on the actual rules and
  employment facts; no payroll settlement formula is encoded here.
- [Labor Standards Act Article 57](https://www.law.go.kr/LSW/lsLinkCommonInfo.do?lsJoLnkSeq=1029728249)
  requires a worker-representative written agreement for compensatory leave in place of
  covered wages. DXT's 4h/8h thresholds must not be assumed to satisfy that arrangement.
- [Article 61](https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1027161139)
  describes a separate leave-use-promotion process. UI reminders or December 31 eligibility
  limits are not evidence that the statutory process occurred.

These references delimit implementation; they do not certify DXT's employment arrangements.
No law-based entitlement amounts, wage offsets or forfeiture jobs are added by this PR.

## Future preview → apply protocol

1. Pin policy revision, source evidence hashes/IDs, employee identity, reference date,
   validity and every affected account/source revision. Missing facts are explicit blockers.
2. Preview per-source proposed changes and reconciliation totals without writing grants.
   Show rejected/unmapped/duplicate items; do not convert unknown values into zero.
3. Changing evidence, dates, eligibility, mappings or revisions invalidates the preview.
   An export of a preview is not an approval or an executable import package.
4. A later apply operation must reauthorize, acquire consistent employee/source locks,
   re-read all revisions, reject stale evidence, and write all paired changes atomically.
   Use a unique business event key and identical-payload replay semantics.
5. Preserve existing sources/events; corrections append compensating entries. Carryover
   must not duplicate entitlement if prior-year leave is later reversed. Require an explicit
   correction decision before moving that restored amount to another year.
6. Required tests: competing applies, stale multi-year revisions, partial failure rollback,
   exact replay/conflicting replay, source conservation, expiration boundaries, cross-user
   and specialist denial, no implicit grants from evidence-only review.

## Operational gate

Keep basic-leave hosted role-session acceptance separate from mock/CI results. Reconcile
approved opening balances against the existing system before switching authority. Preserve
Google OAuth and disabled Gmail/cron. Any future real import or grant is a separately scoped
operation with reviewed input, a restore/compensation plan and an explicit apply decision.
