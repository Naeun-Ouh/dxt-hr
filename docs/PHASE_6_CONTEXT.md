# Phase 6 Implementation Context — Assets, Windows Keys, Account Vault

Focused implementation brief for Issue #6.

## Read first

- AGENTS.md
- docs/ROADMAP.md
- docs/BUSINESS_RULES.md
- docs/PERMISSIONS.md
- docs/DATA_MODEL.md
- docs/UI_IMPLEMENTATION.md
- docs/HR_PRODUCT_PRINCIPLES.md
- Issue #6 and latest comments

Figma source of truth:
- 22 — 장비 관리 (IT Admin)
- 23 — 내 장비 (Employee)
- 24 — Windows 라이선스 (IT Admin)
- 25 — 계정 관리 (IT Admin)

## Goal

Deliver a usable, secure equipment + Windows + shared-account management slice.

## Assets

Managed types:
- Notebook
- Desktop
- Monitor
- External Drive

Do not add mouse/keyboard tracking by default.

Statuses:
- 사용중
- 보유
- 수리
- 분실
- 폐기

Use Serial Number as the primary physical identifier.
Do not invent a DXT asset-number requirement.

Track:
- type
- manufacturer/model where available
- serial number
- status
- current holder
- assignment history

Employee transfer:
- no approval workflow
- preserve assignment history
- current holder updates atomically

Offboarding:
- unreturned asset is visible as an operational condition
- do not hard-block offboarding

## Access

EMPLOYEE:
- only own assigned equipment detail

IT_ADMIN:
- all managed equipment
- assign/transfer/return/status changes
- Windows license management
- account vault management

TEAM_LEADER / EXPENSE_ADMIN / DIVISION_HEAD:
- no company-wide asset/secret access simply from those roles

ADMIN / CEO:
- only explicitly documented capabilities; do not infer secret reveal unless capability exists

## Windows

Existing Windows keys migrate.

Fields should support:
- edition/product
- linked device
- assigned employee where relevant
- encrypted product key
- masked display

Rules:
- full key reveal defaults to IT_ADMIN through WINDOWS_KEY_REVEAL
- reveal must be checked server-side
- encrypted at rest
- never render full key into unauthorized HTML/RSC/API responses
- do not put plaintext key in logs
- no cost tracking
- no renewal alerts
- no SaaS subscription-management engine

## Account vault

This is simple internal service-account management, not a generic password manager product.

Fields:
- service
- login ID
- URL
- encrypted password
- memo
- visibility/access rule if needed

Rules:
- password encrypted at rest
- masked by default
- authorized reveal only
- reveal checked server-side
- no plaintext value in audit logs
- no automatic account disabling integrations in v1
- no cost/renewal tracking

## Security boundary

Knowing an asset/license/account URL or UUID must not bypass authorization.

Use:
1. UI visibility
2. Server route/action/API capability checks
3. DB RLS / equivalent row-level policies

Secret reveal should be a separate audited action.

Required negative tests:
- Employee A cannot read Employee B equipment detail if owner-restricted
- normal Employee cannot read Windows key metadata beyond allowed UI
- normal Employee cannot reveal Windows key
- EXPENSE_ADMIN cannot reveal Windows key/password
- TEAM_LEADER cannot reveal Windows key/password
- IT_ADMIN can reveal authorized secrets
- forged ID/URL/API/RPC requests fail
- session switch/replay after loading a secret screen fails
- unauthorized HTML/RSC responses never contain secret plaintext

## History

Preserve:
- asset assignment history
- holder changes
- significant status changes

Audit:
- key reveal
- password reveal
- secret edits
- assignment/transfer where useful

Do not record secret values in audit metadata.

## UX

Employee:
- simple "내 장비" cards/list
- model + serial + type + status
- no admin controls

IT Admin:
- dense searchable/filterable table
- assignment/transfer/status actions
- Windows masked key list
- Account masked password list
- reveal only on deliberate action

Use progressive disclosure for secrets.

## Acceptance

Complete only when:
- asset CRUD works
- assignment/transfer/history works
- own-equipment view is owner-scoped
- Windows keys are encrypted/masked/reveal-protected
- account passwords are encrypted/masked/reveal-protected
- secret reveal is audited
- no unrelated role receives secret access
- cross-user/cross-role negative tests exist
- Figma 22/23/24/25 matched
- CI passes

## Next phase

After merge, proceed to Phase 7 Onboarding / Offboarding / Announcements / Family Events / Birthday Email.
