# DXT People & Operations — Delivery Priority

Updated priority reflects current business urgency.

## Completed

1. Phase 1 — Foundation / Auth / Roles / App Shell
2. Phase 2 — Employees / Organization / HR Private
3. Phase 3 — Projects / Assignments / Resource View / Career
4. Phase 5 — Expense Entry / Excel Validation / Admin Export
5. Phase 6 — Assets / Windows Keys / Account Vault
6. Phase 7 — Onboarding / Offboarding / Announcements / Family Events

## Active priority

7. Scope cleanup — keep Google email login, defer birthday/family-event automatic mail
8. Phase 4A — Basic Leave Management
9. Staging integration — Supabase Auth / RLS / Storage / Vercel deployment
10. Phase 4B — advanced leave rules only after basic leave is stable

## Authentication direction

Google email login remains required for DXT.
Supabase Auth / Google OAuth remains the intended login path.

## Automatic mail scope

Birthday and family-event automatic email delivery are deferred from the current v1 operational scope.

For now:
- do not require Gmail OAuth variables for normal app operation;
- do not schedule or run automatic birthday/family-event mail in the active deployment;
- preserve the existing implementation history/code where practical so it can be re-enabled later;
- do not let dormant mail code complicate Google login.

Family-event registration and board functionality remain.
Birthday data/privacy handling remains.
Only the automatic Gmail delivery workflow is deferred.

## Leave delivery strategy

Implement Leave in two stages.

### Phase 4A — Basic leave first

Must deliver a usable daily workflow:
- own leave balance/ledger summary
- leave request
- Team Leader approve/reject
- Team Leader own leave auto-approval
- same-day request
- past-date request with required reason
- full-day / AM half-day / PM half-day
- employee cannot delete approved leave
- Team Leader/Admin cancellation
- team calendar with reason hidden from peers
- Admin manual leave adjustment with required reason
- row-level ownership and team-scope security

### Phase 4B — advanced rules later

After Phase 4A is stable:
- project-based annual leave carryover
- birthday half-day exception rules
- weekend work → substitute leave
- Korea statutory/company holiday automation
- year-end carryover processing and nudges

## Delivery principles

- usable business workflow before broad feature coverage;
- no invented HR rules;
- HR data authorization enforced at UI + server + DB RLS;
- Figma remains UI source of truth;
- tests must include cross-user/forged-ID negative cases;
- advanced policy automation must not block basic usability.
