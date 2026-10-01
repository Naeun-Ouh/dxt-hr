# Phase 6 — equipment and vault delivery

Implements Issue #6 and its latest implementation comment against Figma frames 22–25.

## Routes and workflow

- `/assets/me` and `/assets/me/[id]`: current employee's assigned equipment only; no management controls.
- `/admin/assets`, `/new`, `/[id]`: search by model/SN/holder, type/status filters, register/edit, assign/transfer/return, status and assignment history.
- `/admin/windows-licenses`, `/new`, `/[id]`: masked metadata list, encrypted key registration/replacement, device/employee linkage, deliberate reveal, deletion.
- `/admin/accounts`, `/new`, `/[id]`: service/login/URL/memo, encrypted password registration/replacement, deliberate reveal, deletion.

Transfers require no approval. Save atomically closes the previous assignment, opens the next, updates the current holder and records status/holder history. Inactive holders remain visible as `퇴사 · 미반납`; their equipment can be returned without blocking employment changes. Used equipment and significant status history cannot be deleted; use the 폐기 state after return. Unused entries without significant history may be deleted if no license references them.

Serial numbers are required and case-insensitively unique. Manufacturer/model are optional. 사용중 requires a holder; 보유/폐기 require no holder. 수리/분실 may retain a holder for operational follow-up. New assignment to an inactive employee is rejected. These consistency rules do not introduce an approval workflow.

## Database and authorization

Apply `supabase/migrations/202610010007_assets.sql` after the existing migrations. It adds asset, assignment and status/holder event tables; `vault_entry` holds Windows/account metadata, while `vault_secret` holds ciphertext separately. The shared physical vault tables implement the logical Windows license and service account records without duplicating secret-handling code.

All mutation RPCs validate the current authenticated user's database capabilities. Asset/vault writes use expected versions; asset and vault saves serialize by record ID. Asset RLS exposes only the current holder's records, unless ASSET_MANAGE exists. Employee assignment reads expose only their current assignment; complete history and status events are management-only. No direct authenticated table mutations are granted. A transfer removes the previous holder's access immediately.

IT_ADMIN, ADMIN and CEO can manage metadata. IT_ADMIN receives Windows/password reveal capabilities by default; ADMIN/CEO require the respective explicit grants. Employee, team leader, expense admin and division head receive neither vault metadata access nor secret reveal through those roles. Roles remain additive.

Ciphertext has no authenticated SELECT grant or policy. A separate checked RPC records a REVEAL audit row and returns ciphertext to the server action, which decrypts only after its own capability check. Initial HTML/RSC lists and forms contain no full secret or ciphertext. Audit records contain actor/action/entity/id/time only. Blank edit inputs preserve existing ciphertext. Browser reveal values are hidden again after 30 seconds, blur, page hide or visibility change. Already disclosed values cannot be revoked from a person who saw them.

## Encryption and existing key migration

Configure server-only `VAULT_ENCRYPTION_KEYS` (JSON mapping key IDs to base64 random 32-byte keys) and `VAULT_ENCRYPTION_ACTIVE_KEY`. Use a separate keyring from HR. AES-256-GCM uses fresh nonces and binds ciphertext to key ID, record UUID and vault kind as authenticated associated data. Missing/invalid configuration fails closed with a generic error; never fall back to plaintext. Retain old decryption keys during rotation; replacement saves use the active key.

Existing Windows keys can be migrated through **라이선스 등록**: enter the existing edition, optional device/employee and the existing 25-character product key. The same encrypted and audited registration path is used; no plaintext intermediate application table or import file is created. No real legacy key inventory was supplied to this implementation, so production data migration is not claimed. Reconcile source count and edition/device/last-five-character metadata, then deliberately reveal a sample as IT_ADMIN. Handle the original source inventory under the company's existing secret-handling process; do not commit it or attach it to a PR.

## Validation and operational follow-up

`npm run lint`, `npm test`, `npm run build`, `npm run typecheck`, and `npm run test:e2e` cover this slice. Tests execute migrations and RLS in PGlite; browser tests use the production Next server with a test Auth/PostgREST adapter backed by that database. Coverage includes cross-user URL/RSC isolation, specialist-role metadata/reveal denial, direct RPC attempts, action replay after session switch, assignment history/return, stale writes, ciphertext binding, explicit grant revocation and metadata-only audit output.

Screenshots under `docs/screenshots/phase6-*` cover all four major views, assignment history and the employee mobile view. The existing shared shell is reused; the Figma header's overlapping absolute positioning is adapted to the established accessible document-flow shell.

Before production deployment: apply the migration on a staging Supabase instance, set the vault keyring, verify the real Auth/PostgREST RPC grants and RLS with separate employee/IT/admin sessions, and verify backup/key recovery. Live Supabase staging verification and migration of actual existing keys require deployment access and source inventory; neither is claimed by local tests. No cost, renewal, subscription, approval or automatic account-disable workflows are added.
