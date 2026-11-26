\set ON_ERROR_STOP on
-- ONLY a fresh local disposable database explicitly marked by its operator.
do $$begin
 if current_database() !~ '^dxt_leave_race_[a-z0-9_]{1,40}$'
 or inet_server_addr() is distinct from '127.0.0.1'::inet
 or shobj_description((select oid from pg_database where datname=current_database()),'pg_database') is distinct from 'DXT_DISPOSABLE_LEAVE_RACE_DATABASE'
 or to_regnamespace('auth') is not null or to_regclass('public.employee') is not null
 then raise exception 'REFUSED: fresh marked loopback-only disposable database required';end if;
end $$;
-- Minimal local provider adapters, matching existing PGlite fixtures, not hosted Auth/Storage.
do $$begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role;end if;
end $$;
create schema auth;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select,insert,update,delete on storage.objects to authenticated;
\ir ../../supabase/migrations/202609300001_foundation.sql
\ir ../../supabase/migrations/202609300002_employees.sql
\ir ../../supabase/migrations/202609300003_employee_roles.sql
\ir ../../supabase/migrations/202609300004_projects.sql
\ir ../../supabase/migrations/202609300005_team_career_read.sql
\ir ../../supabase/migrations/202610010006_expenses.sql
\ir ../../supabase/migrations/202610010007_assets.sql
\ir ../../supabase/migrations/202610010008_operations.sql
\ir ../../supabase/migrations/202610040009_verified_ceo_mail.sql
\ir ../../supabase/migrations/202610040010_verified_mail_recipients.sql
\ir ../../supabase/migrations/202610060011_defer_automatic_mail.sql
\ir ../../supabase/migrations/202610060012_basic_leave.sql
\ir ../../supabase/migrations/20261124221310_leave_holiday_calendar.sql
\ir ../../supabase/migrations/20261125132957_leave_sources_and_birthday.sql
\ir ../../supabase/migrations/20261125133312_carryover_review.sql
\ir ../../supabase/migrations/20261125133519_weekend_work_evidence.sql
\ir ../../supabase/migrations/20261125235641_leave_validity_review.sql
-- Intentionally no #54 migration: separate exact-SHA opt-in, see README.
