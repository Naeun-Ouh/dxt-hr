begin;
-- Employee-domain roles describe HR assignments; they NEVER provision auth membership.
create table public.employee_role (
  employee_id uuid not null references public.employee(id) on delete cascade,
  role text not null check (role in ('EMPLOYEE','TEAM_LEADER','DIVISION_HEAD','EXPENSE_ADMIN','IT_ADMIN','ADMIN','CEO')),
  primary key (employee_id,role)
);
alter table public.employee_role enable row level security;
revoke all on public.employee_role from anon, authenticated;
grant select, insert, update, delete on public.employee_role to authenticated;
grant all on public.employee_role to service_role;
create policy employee_role_read on public.employee_role for select to authenticated using ((select public.has_app_capability('EMPLOYEE_ACCESS')));
create policy employee_role_insert on public.employee_role for insert to authenticated with check ((select public.has_app_capability('EMPLOYEE_MANAGE')));
create policy employee_role_update on public.employee_role for update to authenticated using ((select public.has_app_capability('EMPLOYEE_MANAGE'))) with check ((select public.has_app_capability('EMPLOYEE_MANAGE')));
create policy employee_role_delete on public.employee_role for delete to authenticated using ((select public.has_app_capability('EMPLOYEE_MANAGE')));
create trigger employee_role_audit after insert or update or delete on public.employee_role for each row execute function public.audit_employee_change();

-- Existing Phase 2 profiles get the ordinary domain role, not inferred auth privileges.
insert into public.employee_role(employee_id,role) select id,'EMPLOYEE' from public.employee;

-- Deferred so an atomic replacement may temporarily remove the last role.
create function public.require_employee_roles() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target_id uuid;
begin
  target_id := case when TG_TABLE_NAME='employee' then (to_jsonb(NEW)->>'id')::uuid else (to_jsonb(OLD)->>'employee_id')::uuid end;
  perform 1 from public.employee where id=target_id for update;
  if found and not exists(select 1 from public.employee_role where employee_id=target_id) then
    raise exception 'At least one employee role is required' using errcode='23514';
  end if;
  return null;
end;
$$;
revoke all on function public.require_employee_roles() from public;
create constraint trigger employee_requires_roles after insert on public.employee deferrable initially deferred for each row execute function public.require_employee_roles();
create constraint trigger employee_role_required after delete or update on public.employee_role deferrable initially deferred for each row execute function public.require_employee_roles();

create or replace function public.save_employee_profile(p_id uuid, p_profile jsonb, p_expected_version integer, p_birth_ciphertext text default null, p_clear_birth boolean default false, p_private_ciphertext text default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare selected_roles text[];
begin
  if not public.has_app_capability('EMPLOYEE_MANAGE') then raise insufficient_privilege; end if;
  if p_private_ciphertext is not null and not public.has_app_capability('PRIVATE_HR_ACCESS') then raise insufficient_privilege; end if;
  if jsonb_typeof(p_profile->'roles') is distinct from 'array' then
    raise exception 'Employee roles are required' using errcode='23514';
  end if;
  select array_agg(value) into selected_roles from jsonb_array_elements_text(p_profile->'roles');
  if coalesce(cardinality(selected_roles),0) = 0 or array_position(selected_roles,null) is not null
     or not selected_roles <@ array['EMPLOYEE','TEAM_LEADER','DIVISION_HEAD','EXPENSE_ADMIN','IT_ADMIN','ADMIN','CEO']::text[] then
    raise exception 'Invalid employee roles' using errcode='23514';
  end if;
  if p_expected_version = 0 then
    insert into public.employee(id,name,english_name,company_email,phone,department_id,title,hire_date,employment_status,work_location)
    values (p_id,p_profile->>'name',nullif(p_profile->>'english_name',''),p_profile->>'company_email',nullif(p_profile->>'phone',''),nullif(p_profile->>'department_id','')::uuid,p_profile->>'title',(p_profile->>'hire_date')::date,p_profile->>'employment_status',nullif(p_profile->>'work_location',''));
    insert into public.employee_role(employee_id,role) select p_id,role from unnest(selected_roles) as role group by role;
  else
    -- Lock/check before changing roles; concurrent forms cannot replace a newer set.
    perform 1 from public.employee where id=p_id and version=p_expected_version for update;
    if not found then raise exception 'Stale employee version' using errcode='40001'; end if;
    delete from public.employee_role where employee_id=p_id;
    insert into public.employee_role(employee_id,role) select p_id,role from unnest(selected_roles) as role group by role;
    update public.employee set name=p_profile->>'name',english_name=nullif(p_profile->>'english_name',''),company_email=p_profile->>'company_email',phone=nullif(p_profile->>'phone',''),department_id=nullif(p_profile->>'department_id','')::uuid,title=p_profile->>'title',hire_date=(p_profile->>'hire_date')::date,employment_status=p_profile->>'employment_status',work_location=nullif(p_profile->>'work_location',''),version=version+1 where id=p_id and version=p_expected_version;
    if not found then raise exception 'Stale employee version' using errcode='40001'; end if;
  end if;
  if p_birth_ciphertext is not null then
    insert into public.employee_birth_detail values(p_id,p_birth_ciphertext) on conflict(employee_id) do update set birth_date_encrypted=excluded.birth_date_encrypted;
  elsif p_clear_birth then delete from public.employee_birth_detail where employee_id=p_id; end if;
  if p_private_ciphertext is not null then
    -- Private edit has its own version-checked RPC; this parameter is for creation only.
    if p_expected_version <> 0 then raise exception 'Use private HR update' using errcode='23514'; end if;
    insert into public.employee_private_hr(employee_id,encrypted_payload) values(p_id,p_private_ciphertext);
  end if;
  return p_id;
end;
$$;
revoke all on function public.save_employee_profile(uuid,jsonb,integer,text,boolean,text) from public;
grant execute on function public.save_employee_profile(uuid,jsonb,integer,text,boolean,text) to authenticated;

commit;
