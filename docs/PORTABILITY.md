# Portability & Vendor Independence

DXT People & Operations must remain portable across infrastructure providers.

## Principle

Use Supabase as an operational platform for PostgreSQL, Auth, and Storage convenience, not as an irreversible application dependency.

The business domain must remain portable.

## Database

Prefer standard PostgreSQL features:
- tables
- indexes
- constraints
- views
- SQL/PLpgSQL functions
- Row Level Security

Avoid provider-specific database extensions unless there is a documented portability reason.

Keep all schema changes as versioned SQL migrations in this repository.

Never make the Supabase dashboard the only source of database configuration.

## Business logic

Core HR rules belong in:
- application domain code
- PostgreSQL functions/RLS where data integrity/security requires it

Do not put essential business logic only inside a proprietary workflow/dashboard feature.

## Authentication

Application code must depend on a small internal authentication/authorization boundary rather than calling provider-specific Auth APIs throughout the product.

Current Google login may use Supabase Auth, but domain authorization must continue to use DXT membership/capability rules.

Employee identity and authorization records must remain separate from the authentication provider.

A future migration to another OIDC/OAuth provider should not require redesigning the HR domain.

## Storage

Do not persist provider-specific public or signed URLs as business data.

Store logical object metadata/path references.

All sensitive-file access must go through DXT authorization.

Expense receipts and resignation documents should be exportable/migratable to another S3-compatible or object-storage provider.

## Secrets / encryption

HR and Vault ciphertext must be encrypted by DXT application-controlled keys.

Do not depend on Supabase-specific encryption for portability.

Encryption keys are managed outside the database and source repository.

## Server runtime

Keep Next.js application code portable.

Avoid Vercel-only APIs for core business workflows unless isolated behind a small adapter.

Scheduled/background jobs should be expressible as normal authenticated HTTP/server jobs so they can later run through Vercel Cron, GitHub Actions, AWS EventBridge, Kubernetes CronJob, or another scheduler.

## Data export

Production readiness must include a documented export path for:
- PostgreSQL schema + data
- Storage objects
- Auth-to-employee identity mapping
- encryption-key recovery/rotation documentation

## Provider adapters

Where provider APIs are needed, isolate them behind internal modules:
- auth provider
- object storage
- email
- scheduled jobs

Domain code must not know which infrastructure vendor is behind those adapters.

## Review rule

Every future PR should ask:

1. Does this feature introduce unnecessary Supabase/Vercel-specific behavior?
2. Could the core data still run on standard PostgreSQL?
3. Could Auth be replaced without rewriting the employee/project/expense/leave model?
4. Could files be moved to another object store?
5. Are provider-specific calls isolated behind an adapter?

If a provider-specific dependency is justified, document it explicitly.

## Current direction

Recommended current deployment:
- PostgreSQL managed by Supabase
- Google OAuth via Supabase Auth
- Supabase Storage for initial operation
- Next.js hosting on a replaceable runtime such as Vercel

This is an operational choice, not a permanent architecture commitment.
