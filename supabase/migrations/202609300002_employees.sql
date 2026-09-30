begin;
create table public.organization (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  parent_id uuid references public.organization(id),
  type text check (type is null or length(type) <= 50),
  version integer not null default 1 check (version > 0),
  check (parent_id is distinct from id)
);
create unique index organization_name_parent on public.organization (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create table public.employee (
  id uuid primary key default gen_random_uuid(),
  -- Linked only through trusted provisioning; employee forms cannot assign auth identities.
  auth_user_id uuid unique references auth.users(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 100),
  english_name text check (english_name is null or length(english_name) <= 100),
  company_email text not null check (company_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and length(company_email) <= 254),
  phone text check (phone is null or length(phone) <= 30),
  department_id uuid references public.organization(id),
  title text not null check (length(trim(title)) between 1 and 100),
  hire_date date not null,
  employment_status text not null default 'ACTIVE' check (employment_status in ('ACTIVE','INACTIVE')),
  work_location text check (work_location is null or length(work_location) <= 200),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index employee_company_email_unique on public.employee (lower(company_email));
create index employee_directory_filter on public.employee (employment_status, department_id, name, id);

-- Full DOB is encrypted and separate: ordinary ADMIN/CEO may access it per birthday policy.
create table public.employee_birth_detail (
  employee_id uuid primary key references public.employee(id),
  birth_date_encrypted text not null check (birth_date_encrypted ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$')
);
-- All private fields (including bank name) live inside one authenticated encrypted envelope.
create table public.employee_private_hr (
  employee_id uuid primary key references public.employee(id),
  encrypted_payload text not null check (encrypted_payload ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$'),
  version integer not null default 1 check (version > 0)
);
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  occurred_at timestamptz not null default now()
);

-- No caller-supplied user/role. Definer avoids recursive RLS while reading current membership.
create function public.has_app_capability(requested text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.app_memberships m where m.user_id = (select auth.uid()) and m.status = 'ACTIVE'
    and not exists (select 1 from public.employee e where e.auth_user_id = m.user_id and e.employment_status = 'INACTIVE')
    and case requested
      when 'EMPLOYEE_ACCESS' then cardinality(m.roles) > 0
      when 'EMPLOYEE_MANAGE' then m.roles && array['ADMIN','CEO']::text[]
      when 'PRIVATE_HR_ACCESS' then m.roles @> array['CEO']::text[] or
        (m.roles @> array['ADMIN']::text[] and m.capabilities @> array['PRIVATE_HR_ACCESS']::text[])
      else false end
  );
$$;
revoke all on function public.has_app_capability(text) from public;
grant execute on function public.has_app_capability(text) to authenticated;

alter table public.organization enable row level security;
alter table public.employee enable row level security;
alter table public.employee_birth_detail enable row level security;
alter table public.employee_private_hr enable row level security;
alter table public.audit_log enable row level security;
revoke all on public.organization, public.employee, public.employee_birth_detail, public.employee_private_hr, public.audit_log from anon, authenticated;
grant select on public.organization, public.employee to authenticated;
grant insert(id,name,parent_id,type,version), update(name,parent_id,type,version) on public.organization to authenticated;
grant insert(id,name,english_name,company_email,phone,department_id,title,hire_date,employment_status,work_location,version),
  update(name,english_name,company_email,phone,department_id,title,hire_date,employment_status,work_location,version) on public.employee to authenticated;
grant select, insert, update, delete on public.employee_birth_detail to authenticated;
grant select, insert, update on public.employee_private_hr to authenticated;
grant select on public.audit_log to authenticated;
grant all on public.organization, public.employee, public.employee_birth_detail, public.employee_private_hr, public.audit_log to service_role;
create policy organization_read on public.organization for select to authenticated using ((select public.has_app_capability('EMPLOYEE_ACCESS')));
create policy organization_insert on public.organization for insert to authenticated with check ((select public.has_app_capability('EMPLOYEE_MANAGE')));
create policy organization_update on public.organization for update to authenticated using ((select public.has_app_capability('EMPLOYEE_MANAGE'))) with check ((select public.has_app_capability('EMPLOYEE_MANAGE')));
create policy employee_read on public.employee for select to authenticated using ((select public.has_app_capability('EMPLOYEE_ACCESS')));
create policy employee_insert on public.employee for insert to authenticated with check ((select public.has_app_capability('EMPLOYEE_MANAGE')));
create policy employee_update on public.employee for update to authenticated using ((select public.has_app_capability('EMPLOYEE_MANAGE'))) with check ((select public.has_app_capability('EMPLOYEE_MANAGE')));
create policy birth_access on public.employee_birth_detail for all to authenticated using ((select public.has_app_capability('EMPLOYEE_MANAGE'))) with check ((select public.has_app_capability('EMPLOYEE_MANAGE')));
create policy private_read on public.employee_private_hr for select to authenticated using ((select public.has_app_capability('PRIVATE_HR_ACCESS')));
create policy private_insert on public.employee_private_hr for insert to authenticated with check ((select public.has_app_capability('PRIVATE_HR_ACCESS')));
create policy private_update on public.employee_private_hr for update to authenticated using ((select public.has_app_capability('PRIVATE_HR_ACCESS'))) with check ((select public.has_app_capability('PRIVATE_HR_ACCESS')));
create policy audit_read on public.audit_log for select to authenticated using ((select public.has_app_capability('EMPLOYEE_MANAGE')));

create function public.audit_employee_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log(actor_id,action,entity_type,entity_id)
  values (auth.uid(), TG_OP, TG_TABLE_NAME, case when TG_TABLE_NAME in ('employee','organization') then coalesce(to_jsonb(NEW)->>'id',to_jsonb(OLD)->>'id')::uuid else coalesce(to_jsonb(NEW)->>'employee_id',to_jsonb(OLD)->>'employee_id')::uuid end);
  return coalesce(NEW,OLD);
end;
$$;
revoke all on function public.audit_employee_change() from public;
create trigger employee_audit after insert or update on public.employee for each row execute function public.audit_employee_change();
create trigger organization_audit after insert or update on public.organization for each row execute function public.audit_employee_change();
create trigger birth_audit after insert or update or delete on public.employee_birth_detail for each row execute function public.audit_employee_change();
create trigger private_audit after insert or update on public.employee_private_hr for each row execute function public.audit_employee_change();

create function public.validate_organization_parent() returns trigger language plpgsql set search_path = '' as $$
begin
  -- Serialize hierarchy mutations so concurrent moves cannot create a cycle.
  perform pg_advisory_xact_lock(23092026);
  if NEW.parent_id is not null and exists (
    with recursive ancestors as (
      select id,parent_id from public.organization where id = NEW.parent_id
      union select o.id,o.parent_id from public.organization o join ancestors a on o.id = a.parent_id
    ) select 1 from ancestors where id = NEW.id
  ) then raise exception 'Organization hierarchy cycle' using errcode = '23514'; end if;
  return NEW;
end;
$$;
revoke all on function public.validate_organization_parent() from public;
create trigger organization_parent_check before insert or update on public.organization for each row execute function public.validate_organization_parent();

create function public.touch_employee_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin NEW.updated_at = now(); return NEW; end;
$$;
revoke all on function public.touch_employee_updated_at() from public;
create trigger employee_updated before update on public.employee for each row execute function public.touch_employee_updated_at();

-- Atomic basic/birth/private creation. Invoker security keeps RLS and column grants in effect.
create function public.save_employee_profile(p_id uuid, p_profile jsonb, p_expected_version integer, p_birth_ciphertext text default null, p_clear_birth boolean default false, p_private_ciphertext text default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
begin
  if not public.has_app_capability('EMPLOYEE_MANAGE') then raise insufficient_privilege; end if;
  if p_private_ciphertext is not null and not public.has_app_capability('PRIVATE_HR_ACCESS') then raise insufficient_privilege; end if;
  if p_expected_version = 0 then
    insert into public.employee(id,name,english_name,company_email,phone,department_id,title,hire_date,employment_status,work_location)
    values (p_id,p_profile->>'name',nullif(p_profile->>'english_name',''),p_profile->>'company_email',nullif(p_profile->>'phone',''),nullif(p_profile->>'department_id','')::uuid,p_profile->>'title',(p_profile->>'hire_date')::date,p_profile->>'employment_status',nullif(p_profile->>'work_location',''));
  else
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

create function public.save_private_hr(p_employee_id uuid,p_ciphertext text,p_expected_version integer) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not public.has_app_capability('PRIVATE_HR_ACCESS') then raise insufficient_privilege; end if;
  if p_expected_version=0 then
    insert into public.employee_private_hr(employee_id,encrypted_payload) values(p_employee_id,p_ciphertext);
  else
    update public.employee_private_hr set encrypted_payload=p_ciphertext,version=version+1 where employee_id=p_employee_id and version=p_expected_version;
    if not found then raise exception 'Stale private HR version' using errcode='40001'; end if;
  end if;
end;
$$;
revoke all on function public.save_private_hr(uuid,text,integer) from public;
grant execute on function public.save_private_hr(uuid,text,integer) to authenticated;

create function public.record_private_hr_view(p_employee_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_app_capability('PRIVATE_HR_ACCESS') then raise insufficient_privilege; end if;
  if not exists(select 1 from public.employee where id=p_employee_id) then raise no_data_found; end if;
  insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),'REVEAL','employee_private_hr',p_employee_id);
end;
$$;
revoke all on function public.record_private_hr_view(uuid) from public;
grant execute on function public.record_private_hr_view(uuid) to authenticated;
create function public.record_birth_view(p_employee_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_app_capability('EMPLOYEE_MANAGE') then raise insufficient_privilege; end if;
  if not exists(select 1 from public.employee where id=p_employee_id) then raise no_data_found; end if;
  insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),'REVEAL','employee_birth_detail',p_employee_id);
end;
$$;
revoke all on function public.record_birth_view(uuid) from public;
grant execute on function public.record_birth_view(uuid) to authenticated;
commit;
