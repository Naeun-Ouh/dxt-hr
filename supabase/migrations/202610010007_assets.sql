begin;
create or replace function public.has_app_capability(requested text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.app_memberships m where m.user_id=auth.uid() and m.status='ACTIVE'
 and not exists(select 1 from public.employee e where e.auth_user_id=m.user_id and e.employment_status='INACTIVE')
 and case requested when 'EMPLOYEE_ACCESS' then cardinality(m.roles)>0
 when 'EMPLOYEE_MANAGE' then m.roles && array['ADMIN','CEO']::text[]
 when 'EXPENSE_MANAGE' then m.roles && array['ADMIN','CEO','EXPENSE_ADMIN']::text[]
 when 'PROJECT_MANAGE' then m.roles && array['ADMIN','CEO']::text[]
 when 'TEAM_PROJECT_READ' then m.roles && array['ADMIN','CEO','TEAM_LEADER']::text[]
 when 'ASSET_MANAGE' then m.roles && array['ADMIN','CEO','IT_ADMIN']::text[]
 when 'WINDOWS_MANAGE' then m.roles && array['ADMIN','CEO','IT_ADMIN']::text[]
 when 'ACCOUNT_MANAGE' then m.roles && array['ADMIN','CEO','IT_ADMIN']::text[]
 when 'WINDOWS_KEY_REVEAL' then m.roles @> array['IT_ADMIN']::text[] or (m.roles && array['ADMIN','CEO']::text[] and m.capabilities @> array['WINDOWS_KEY_REVEAL']::text[])
 when 'ACCOUNT_PASSWORD_REVEAL' then m.roles @> array['IT_ADMIN']::text[] or (m.roles && array['ADMIN','CEO']::text[] and m.capabilities @> array['ACCOUNT_PASSWORD_REVEAL']::text[])
 when 'PRIVATE_HR_ACCESS' then m.roles @> array['CEO']::text[] or (m.roles @> array['ADMIN']::text[] and m.capabilities @> array['PRIVATE_HR_ACCESS']::text[]) else false end);
$$;
create table public.asset (
 id uuid primary key, type text not null check(type in ('NOTEBOOK','DESKTOP','MONITOR','EXTERNAL_DRIVE')),
 manufacturer text not null default '' check(length(manufacturer)<=100), model text not null default '' check(length(model)<=200),
 serial_number text not null check(length(trim(serial_number)) between 1 and 100),
 status text not null check(status in ('IN_USE','AVAILABLE','REPAIR','LOST','DISPOSED')),
 current_holder_id uuid references public.employee(id), assigned_at timestamptz,
 version int not null default 1, created_at timestamptz not null default now(),
 check((current_holder_id is null)=(assigned_at is null)),
 check(status<>'IN_USE' or current_holder_id is not null),
 check(status not in ('AVAILABLE','DISPOSED') or current_holder_id is null)
);
create unique index asset_serial_unique on public.asset(lower(trim(serial_number)));
create table public.asset_assignment (
 id uuid primary key default gen_random_uuid(), asset_id uuid not null references public.asset(id),
 employee_id uuid not null references public.employee(id), assigned_at timestamptz not null, returned_at timestamptz,
 changed_by uuid not null references auth.users(id)
);
create unique index asset_one_holder on public.asset_assignment(asset_id) where returned_at is null;
create table public.asset_event (
 id uuid primary key default gen_random_uuid(), asset_id uuid not null references public.asset(id),
 previous_status text, status text not null, previous_holder_id uuid references public.employee(id), holder_id uuid references public.employee(id),
 actor_id uuid not null references auth.users(id), occurred_at timestamptz not null default now()
);
-- Metadata has no plaintext or ciphertext. Ciphertext is reachable only through an audited reveal RPC.
create table public.vault_entry (
 id uuid primary key, kind text not null check(kind in ('windows','account')),
 name text not null check(length(trim(name)) between 1 and 200), login_id text not null default '' check(length(login_id)<=200),
 url text not null default '' check(url='' or (url ~ '^https?://' and length(url)<=2000)),
 memo text not null default '' check(length(memo)<=2000),
 device_asset_id uuid references public.asset(id), assigned_employee_id uuid references public.employee(id),
 key_suffix text not null default '' check(key_suffix='' or key_suffix ~ '^[A-Z0-9]{5}$'), version int not null default 1,
 check(kind='windows' or (device_asset_id is null and assigned_employee_id is null and key_suffix=''))
);
create table public.vault_secret (
 entry_id uuid primary key references public.vault_entry(id) on delete cascade,
 ciphertext text not null check(length(ciphertext)<=12000 and ciphertext ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$')
);
alter table public.asset enable row level security;
alter table public.asset_assignment enable row level security;
alter table public.asset_event enable row level security;
alter table public.vault_entry enable row level security;
alter table public.vault_secret enable row level security;
revoke all on public.asset,public.asset_assignment,public.asset_event,public.vault_entry,public.vault_secret from public,anon,authenticated;
grant select on public.asset,public.asset_assignment,public.asset_event,public.vault_entry to authenticated;
grant all on public.asset,public.asset_assignment,public.asset_event,public.vault_entry,public.vault_secret to service_role;
create policy asset_read on public.asset for select to authenticated using(public.has_app_capability('ASSET_MANAGE') or current_holder_id=public.current_employee_id());
-- Employees see their current assignment only, never a previous/next holder's history.
create policy assignment_read on public.asset_assignment for select to authenticated using(public.has_app_capability('ASSET_MANAGE') or (employee_id=public.current_employee_id() and returned_at is null));
create policy event_read on public.asset_event for select to authenticated using(public.has_app_capability('ASSET_MANAGE'));
create policy vault_read on public.vault_entry for select to authenticated using(public.has_app_capability(case kind when 'windows' then 'WINDOWS_MANAGE' else 'ACCOUNT_MANAGE' end));
create function public.save_asset(p_id uuid,p_values jsonb,p_expected_version int) returns uuid
language plpgsql security definer set search_path='' as $$
declare old public.asset; holder uuid; stamp timestamptz:=clock_timestamp(); new_status text;
begin
 if not public.has_app_capability('ASSET_MANAGE') then raise exception 'Denied' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,7));
 select * into old from public.asset where id=p_id for update;
 if (old.id is null and p_expected_version<>0) or (old.id is not null and old.version is distinct from p_expected_version) or p_expected_version is null then raise exception 'Stale record'; end if;
 holder:=nullif(p_values->>'current_holder_id','')::uuid; new_status:=p_values->>'status';
 if holder is not null and holder is distinct from old.current_holder_id and not exists(select 1 from public.employee where id=holder and employment_status='ACTIVE') then raise exception 'Inactive holder'; end if;
 insert into public.asset(id,type,manufacturer,model,serial_number,status,current_holder_id,assigned_at)
 values(p_id,p_values->>'type',coalesce(p_values->>'manufacturer',''),coalesce(p_values->>'model',''),trim(p_values->>'serial_number'),new_status,holder,case when holder is null then null when holder is not distinct from old.current_holder_id then old.assigned_at else stamp end)
 on conflict(id) do update set type=excluded.type,manufacturer=excluded.manufacturer,model=excluded.model,serial_number=excluded.serial_number,status=excluded.status,current_holder_id=excluded.current_holder_id,assigned_at=excluded.assigned_at,version=public.asset.version+1;
 if holder is distinct from old.current_holder_id then
  update public.asset_assignment set returned_at=stamp where asset_id=p_id and returned_at is null;
  if holder is not null then insert into public.asset_assignment(asset_id,employee_id,assigned_at,changed_by) values(p_id,holder,stamp,auth.uid()); end if;
 end if;
 if old.id is null or holder is distinct from old.current_holder_id or new_status is distinct from old.status then
  insert into public.asset_event(asset_id,previous_status,status,previous_holder_id,holder_id,actor_id) values(p_id,old.status,new_status,old.current_holder_id,holder,auth.uid());
 end if;
 insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),'SAVE','asset',p_id);
 return p_id;
end $$;
create function public.delete_asset(p_id uuid,p_expected_version int) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.has_app_capability('ASSET_MANAGE') then raise exception 'Denied' using errcode='42501'; end if;
 perform 1 from public.asset where id=p_id and version=p_expected_version for update;
 if not found then raise exception 'Stale record'; end if;
 -- Preserve all assignment history: used equipment is retired via DISPOSED, never deleted.
 if exists(select 1 from public.asset_assignment where asset_id=p_id) or exists(select 1 from public.asset_event where asset_id=p_id and previous_status is not null) then raise exception 'History exists'; end if;
 delete from public.asset_event where asset_id=p_id;
 delete from public.asset where id=p_id;
 insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),'DELETE','asset',p_id);
end $$;
create function public.save_vault_entry(p_id uuid,p_kind text,p_values jsonb,p_ciphertext text,p_expected_version int) returns uuid language plpgsql security definer set search_path='' as $$
declare old public.vault_entry;
begin
 if p_kind not in ('windows','account') or p_kind is null or not public.has_app_capability(case p_kind when 'windows' then 'WINDOWS_MANAGE' else 'ACCOUNT_MANAGE' end) then raise exception 'Denied' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,7));
 select * into old from public.vault_entry where id=p_id for update;
 if p_expected_version is null or (old.id is null and (p_expected_version<>0 or p_ciphertext is null)) or (old.id is not null and (old.version is distinct from p_expected_version or old.kind<>p_kind)) then raise exception 'Stale record'; end if;
 insert into public.vault_entry(id,kind,name,login_id,url,memo,device_asset_id,assigned_employee_id,key_suffix)
 values(p_id,p_kind,p_values->>'name',coalesce(p_values->>'login_id',''),coalesce(p_values->>'url',''),coalesce(p_values->>'memo',''),nullif(p_values->>'device_asset_id','')::uuid,nullif(p_values->>'assigned_employee_id','')::uuid,case when p_ciphertext is null then old.key_suffix else coalesce(p_values->>'key_suffix','') end)
 on conflict(id) do update set name=excluded.name,login_id=excluded.login_id,url=excluded.url,memo=excluded.memo,device_asset_id=excluded.device_asset_id,assigned_employee_id=excluded.assigned_employee_id,key_suffix=excluded.key_suffix,version=public.vault_entry.version+1;
 if p_ciphertext is not null then insert into public.vault_secret values(p_id,p_ciphertext) on conflict(entry_id) do update set ciphertext=excluded.ciphertext; end if;
 insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),case when p_ciphertext is null then 'SAVE_METADATA' else 'EDIT_SECRET' end,'vault_'||p_kind,p_id);
 return p_id;
end $$;
create function public.reveal_vault_entry(p_id uuid,p_kind text) returns text language plpgsql security definer set search_path='' as $$
declare value text;
begin
 if p_kind not in ('windows','account') or p_kind is null or not public.has_app_capability(case p_kind when 'windows' then 'WINDOWS_KEY_REVEAL' else 'ACCOUNT_PASSWORD_REVEAL' end) then raise exception 'Denied' using errcode='42501'; end if;
 select s.ciphertext into value from public.vault_entry e join public.vault_secret s on s.entry_id=e.id where e.id=p_id and e.kind=p_kind;
 if value is null then raise exception 'Unavailable'; end if;
 insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),'REVEAL','vault_'||p_kind,p_id);
 return value;
end $$;
create function public.delete_vault_entry(p_id uuid,p_kind text,p_expected_version int) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_kind not in ('windows','account') or p_kind is null or not public.has_app_capability(case p_kind when 'windows' then 'WINDOWS_MANAGE' else 'ACCOUNT_MANAGE' end) then raise exception 'Denied' using errcode='42501'; end if;
 delete from public.vault_entry where id=p_id and kind=p_kind and version=p_expected_version;
 if not found then raise exception 'Stale record'; end if;
 insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),'DELETE','vault_'||p_kind,p_id);
end $$;
revoke all on function public.save_asset(uuid,jsonb,int),public.delete_asset(uuid,int),public.save_vault_entry(uuid,text,jsonb,text,int),public.reveal_vault_entry(uuid,text),public.delete_vault_entry(uuid,text,int) from public,anon;
grant execute on function public.save_asset(uuid,jsonb,int),public.delete_asset(uuid,int),public.save_vault_entry(uuid,text,jsonb,text,int),public.reveal_vault_entry(uuid,text),public.delete_vault_entry(uuid,text,int) to authenticated;
commit;
