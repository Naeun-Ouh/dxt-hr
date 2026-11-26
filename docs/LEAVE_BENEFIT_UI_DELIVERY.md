# Administrator benefit reconciliation UI

Route integration: `/admin/leave/benefits` renders `LeaveBenefitsScreen`. Both its data loader and every server action require LEAVE_MANAGE. Reads use employee-session RLS; no service role or hosted mutations. RPC schema and route/mock registration are owned by the parent integration.

The compact workspace lists approved weekend evidence and confirmed carryover cases with eligible source choices. Preview is read-only. Changing the selected evidence clears plan, acknowledgement and reason. Apply requires source/prior-payment reconciliation and explicit company-benefit/no-wage-offset confirmation plus a reason. Database preview equality and locked allocation remain authoritative; client employee, amount, balance and versions cannot grant authority.

History preserves original operation, reason and validity; reversal uses current source account version and is blocked by the database for used/transferred benefits. Approved-work cancellation preserves original work and compensates unused connected benefits atomically. Self cancellation/review restriction remains in the RPC. RPC errors are mapped to safe actionable messages, including year-end not reconciled, stale preview and already-used benefit. No raw SQL errors or personal contract/HR data are logged.

New browser journey uses synthetic evidence only: employee records work → leader approves → admin previews → changes selection to invalidate → acknowledges → applies → reverses → cancels approved evidence; employee/leader/specialist route and RPC denials. Screenshot target: `docs/screenshots/leave-benefit-preview.png`. Parent runs integrated DB/browser checks once schema, whitelist and route are wired.
