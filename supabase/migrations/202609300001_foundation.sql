-- Phase 1 identity/authorization only. Domain employee records arrive in Phase 2.
begin;
create table public.app_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 100),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  roles text[] not null check (
    cardinality(roles) > 0 and array_position(roles, null) is null and
    roles <@ array['EMPLOYEE','TEAM_LEADER','DIVISION_HEAD','EXPENSE_ADMIN','IT_ADMIN','ADMIN','CEO']::text[]
  ),
  capabilities text[] not null default '{}' check (
    array_position(capabilities, null) is null and
    capabilities <@ array['PRIVATE_HR_ACCESS','WINDOWS_KEY_REVEAL','ACCOUNT_PASSWORD_REVEAL']::text[]
  ),
  constraint explicit_grant_eligibility check (
    cardinality(capabilities) = 0 or roles && array['ADMIN','CEO']::text[]
  )
);
-- CEO receives private HR access by role; a second explicitly designated ADMIN is rejected.
create unique index one_designated_private_hr_admin on public.app_memberships ((true))
  where capabilities @> array['PRIVATE_HR_ACCESS']::text[] and not (roles @> array['CEO']::text[]);
alter table public.app_memberships enable row level security;
revoke all on public.app_memberships from anon, authenticated;
grant select on public.app_memberships to authenticated;
grant all on public.app_memberships to service_role;
create policy read_own_membership on public.app_memberships for select to authenticated
  using ((select auth.uid()) = user_id);
comment on table public.app_memberships is 'Trusted provisioning only; no client role assignment or automatic sign-up provisioning.';
commit;
