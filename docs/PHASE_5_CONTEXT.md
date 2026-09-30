# Phase 5 Implementation Context — Expense, Excel Validation, Admin Export

This is the focused implementation brief for Issue #5. It consolidates the approved DXT expense rules, the uploaded legacy workbook structure, security rules, and product principles.

## Read first

- AGENTS.md
- docs/ROADMAP.md
- docs/BUSINESS_RULES.md
- docs/PERMISSIONS.md
- docs/DATA_MODEL.md
- docs/ROUTES.md
- docs/UI_IMPLEMENTATION.md
- docs/HR_PRODUCT_PRINCIPLES.md
- Issue #5 and its latest comments

Figma source of truth:
- 18 — 내 경비
- 19 — 경비 등록
- 20 — Excel 업로드 & Validation
- 21 — 경비 관리
- 37 — Validation & Edge States

## Product goal

Deliver a complete, usable DXT expense vertical slice before moving to Assets.

This phase should replace manual spreadsheet handling while preserving the real DXT accounting workflow where it matters.

## Core workflow

Employee:
1. register expense directly or upload official Excel template
2. attach evidence
3. review warnings/errors
4. submit monthly claim

Expense Admin:
1. review all submitted expenses
2. inspect validation state
3. export Excel for accountant
4. handle payment/lock state

There is no Team Leader or PM approval workflow.

## Expense ownership and security

This is financial HR data.

### EMPLOYEE
May:
- create own claim
- read own claim/items/attachments
- edit own claim until lock
- upload Excel for own claim

May not:
- read another employee's claim
- read another employee's receipt
- edit another employee's claim
- change employee_id to impersonate another submitter

### TEAM_LEADER
Does not gain team expense visibility.

### EXPENSE_ADMIN
May:
- read all expense claims/items/attachments
- review validation state
- export
- manage payment/lock status

### IT_ADMIN / DIVISION_HEAD
No expense access beyond their own employee expense capability.

### ADMIN / CEO
Only the explicitly documented expense capability applies. Do not infer HR Private or other specialist capabilities.

## Mandatory enforcement

Use all applicable layers:
1. UI/menu visibility
2. server route/action/API ownership and capability checks
3. PostgreSQL/Supabase RLS

Knowing another employee's URL, expense ID, item ID, attachment ID, UUID, or changing query/body fields must not expose data.

Required negative tests:
- Employee A cannot read Employee B expense
- Employee A cannot read Employee B receipt
- Employee A cannot edit Employee B expense/item
- TEAM_LEADER cannot read team expenses
- IT_ADMIN cannot read all expenses
- forged employee_id is ignored/rejected
- direct Server Action/API/RPC attempts fail
- session switching/replay fails closed

## Monthly claim model

Recommended normalized hierarchy:

ExpenseClaim
- id
- employee_id
- usage_month
- status
- submitted_at
- late_reason
- locked_at
- payment_date
- created_at / updated_at

ExpenseItem
- id
- claim_id
- usage_date
- expense_type
- merchant
- description/item
- account_category
- amount
- evidence_type
- project_id?
- trip_context?
- payment_method
- notes
- version

ExpenseAttachment
- id
- claim_id or item_id
- storage path
- filename
- mime type

ExpenseValidation
- claim/item/import row reference
- severity: ERROR | WARNING
- code
- message

ExpenseAttendee
- item_id
- employee_id

VehicleTravelDetail
- item_id
- kind: FUEL | TOLL
- project_or_trip_name
- origin
- destination
- one_way_amount
- trip_count
- calculated_total

Do not create duplicate manual totals when the system can derive them.

## Current DXT timing rules

- usage month = calendar month
- submission deadline = first weekend of following month
- payment date = 15th
- late submission is allowed with warning
- 2–3 month retroactive claim allowed, reason required
- employee may edit until the 15th/payment lock
- after paid/locked period: read-only
- no in-system reject workflow

If an exact first-weekend calculation needs implementation detail, derive it deterministically from the following month rather than storing a fragile manual date.

## Validation semantics

### ERROR
Blocks registration/import.
Use for:
- missing required field
- invalid date
- invalid numeric value
- malformed Excel schema
- unsupported structural content
- missing mandatory evidence if DXT policy says submission cannot proceed

### WARNING
Does not block unless the approved DXT rule explicitly says otherwise.
Use for:
- likely duplicate
- policy threshold
- unusual late/retroactive submission
- combined allowance excess where policy permits submission

Warnings must be friendly and actionable.

Duplicate warning copy:
"비슷한 경비 내역이 있어요 👀 같은 날짜에 비슷한 금액의 경비가 이미 등록되어 있습니다. 중복 등록이 아닌지 한 번만 확인해주세요. 문제가 없다면 그대로 제출하셔도 됩니다."

Duplicate suspicion key:
- employee
- usage date
- merchant
- amount

Duplicate is warning only.

## Evidence

Receipt/proof is mandatory.

Allowed examples:
- PDF receipt bundle
- online card-history PDF
- map screenshot for route/fuel basis
- high-pass receipt for toll evidence

Evidence access follows the same ownership/RLS policy as the expense item.

## Meal / dining rules

### Non-project overtime meal
- cap: ₩10,000
- above cap: warning and employee corrects
- do not auto-adjust amount

### Team dining
- allowance: ₩30,000 per attendee per month
- one employee submits
- all attendees must be explicitly selected/named
- attendee monthly usage is cumulative
- an attendee cannot reuse allowance already consumed
- if individual attendee remaining allowance is exceeded: block the invalid allocation
- overall combined amount may warn and still submit when consistent with approved policy

Do not invent per-team-manager approval.

## Other expense rules

- equipment purchase: CEO agreement is company policy only; no approval workflow in this phase
- taxi: allowed with CEO approval in policy; no approval checkbox/workflow
- training parking: historically non-reimbursable; educate via policy/warning, do not hard-block unless later approved
- no lodging cap
- no rail/air class restriction
- personal card indicator required
- no corporate-card workflow in v1

## Expense language

Employee-facing UI should use understandable expense purposes rather than requiring accounting expertise.

Preferred:
- 야근 식대
- 회식
- 주유비
- 통행비
- 택시
- 교육비
- 소모품
- 기타

Back-office account-category mapping may be stored separately.

## Legacy workbook source

Uploaded file:
2024_DXT지출결의서_00월_홍길동_NEW.xlsx

Treat it as a source of current DXT process, not as a design to reproduce literally.

### Sheet 1 — 지출결의서

Header/meta:
- report month
- submitter
- submission date
- scheduled payment date
- payment/card information
- card issuer/details

Special summary rows:
- 주유비
- 통행비

General expense columns:
- 일자
- 업체명
- 품목
- 계정과목
- 합계
- 증빙종류
- 비고

Reference mapping visible in workbook:
- 임직원식대등 → 복리후생비
- 차량유류대, 차량수리비등 → 차량유지비
- 시내교통비, 톨게이트, 하이플러스카드 등 → 여비교통비
- 송금수수료, 기타수수료등 → 지급수수료
- 택배비, 퀵서비스, 용달비등 → 운반비
- 소모품, 사무용품등 → 소모품비
- 전화요금, 우편물발송비등 → 통신비
- 거래처 접식대등 → 카드접대비
- 임직원 교육비등 → 교육훈련비
- 도서구입비, 명함, 인쇄등 → 도서인쇄비
- 보험료 → 보험료
- 세금과공과 → 세금과공과
- 전기요금외 → 수도광열비
- 사무실 임차료등 → 임차료
- 백만원 넘는 사무기기등 → 비품
- 소프트웨어 비용 → 소모품비

Evidence examples:
- 현금영수증
- 간이영수증
- 개인카드

The sheet total includes fuel/toll summary rows and ordinary expenses.

### Sheet 2 — 주유비,통행비

Purpose:
supporting calculation/detail for vehicle travel.

Fuel fields:
- 프로젝트명/출장명
- 출발지
- 도착지
- 편도 주유비
- 횟수
- 총 금액
- 네이버 지도 캡처

Toll fields:
- 프로젝트명/출장명
- 출발지
- 도착지
- 편도 통행비
- 횟수
- 총 금액

Current manual process:
Sheet 2 total is copied manually into Sheet 1 fuel/toll rows.

Do not reproduce this manual transfer in the web product.

Preferred web behavior:
- register detailed fuel/toll rows once
- total = one_way_amount × trip_count
- derive monthly summary automatically
- link evidence to detail/item
- Excel importer converts both sheets into normalized records

## Known workbook formula issues

The uploaded workbook contains inconsistent formulas.

Observed examples:
- F8 = D8*D8, expected by headers: D8*E8
- F9 = D9*D9, expected D9*E9
- some later fuel rows contain literal 0
- N8 correctly uses L8*M8
- N9:N12 use K*L despite visible semantics indicating L*M

Do not reproduce workbook formula bugs.

Authoritative business interpretation:
total = one-way amount × trip count

## Excel import behavior

Import both sheets.

### Import pipeline
1. file/schema validation
2. sheet detection
3. cell/type/date normalization
4. policy validation
5. duplicate suspicion
6. preview with ERROR/WARNING
7. register normalized records

### Sheet 1
Parse:
- monthly metadata
- ordinary expense rows
- existing fuel/toll summary rows

Do not create duplicate vehicle expenses if Sheet 2 detail exists.
Sheet 2 detail should be the authoritative normalized source for fuel/toll when present.

### Sheet 2
Parse fuel and toll detail rows into VehicleTravelDetail records.
Calculate totals from semantic fields, not workbook formulas.

### Import traceability
Preserve:
- original filename
- import timestamp
- row/sheet origin where useful for validation feedback

## Direct entry UI

The direct entry form should support:
- usage date
- expense purpose/type
- merchant
- amount
- project where relevant
- personal-card/payment indicator
- evidence upload
- notes
- attendees for dining
- fuel/toll detail fields when that type is selected

Use progressive disclosure:
do not show route/count fields for normal meal or supplies expense.

## My Expenses

Employee dashboard/list should show:
- usage month
- total amount
- status
- late/locked state
- item list
- warnings
- evidence state

Only own records.

## Expense Admin

Admin screen should support:
- month filter
- employee filter
- validation state
- submitted/locked/payment state
- claim/item detail
- export

No reject button.

If there is a problem, the current DXT process handles contact outside the system.

## Export

Provide an accountant-friendly Excel export.

The export does not need to recreate every merged cell/style of the legacy workbook unless necessary.
Prioritize:
- complete normalized data
- account category
- evidence reference
- employee
- dates
- amount
- project/context
- validation/admin state

If compatibility with the exact old workbook becomes necessary, document it separately rather than contaminating the core model.

## History and audit

Preserve useful lifecycle state:
- claim submission
- lock/payment status
- significant admin status changes

Audit sensitive/admin actions without storing receipt contents or other private raw values in logs.

## UX principles

Apply docs/HR_PRODUCT_PRINCIPLES.md:
- employee language before accounting language
- no duplicate entry
- WARNING vs ERROR clearly separated
- admin complexity stays in admin view
- configuration only where DXT truly needs it
- no unnecessary approval workflow

## Acceptance checklist

Phase 5 is complete only when:
- direct expense registration works
- own expense list/detail works
- receipts/evidence work
- Excel upload parses both Sheet 1 and Sheet 2
- fuel/toll totals derive correctly
- duplicate warning works
- overtime meal rule works
- dining attendee monthly allowance works
- retroactive reason rule works
- post-payment lock works
- Expense Admin can review all and export
- no reject workflow is introduced
- Employee cannot access another employee's expenses or receipts
- Team Leader cannot access team expenses
- specialist roles stay isolated
- forged IDs/URLs/API calls fail
- RLS tests exist
- Excel ERROR/WARNING preview matches Figma 20/37
- major screens match Figma 18/19/20/21/37
- CI passes

## Next phase

After review/merge, proceed to Phase 6 Assets / Windows / Account Vault.
