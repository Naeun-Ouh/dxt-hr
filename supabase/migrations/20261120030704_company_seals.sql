begin;
create table public.company_seal (
 id uuid primary key,
 storage_path text not null unique,
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 company_name text not null check(length(btrim(company_name)) between 1 and 100),
 representative_name text not null check(length(btrim(representative_name)) between 1 and 100),
 active boolean not null default false,
 ready boolean not null default false,
 uploaded_at timestamptz not null default now(),
 uploaded_by uuid not null references auth.users(id),
 check(not active or ready), check(storage_path=id::text||'/seal.png')
);
create unique index company_seal_one_active on public.company_seal((true)) where active;
create table public.company_seal_event (
 id uuid primary key default gen_random_uuid(),seal_id uuid not null references public.company_seal(id),
 action text not null check(action in ('UPLOADED','ACTIVATED','DEACTIVATED')),
 actor_id uuid not null references auth.users(id),occurred_at timestamptz not null default now()
);
alter table public.company_seal enable row level security;
alter table public.company_seal_event enable row level security;
create policy seal_manage_read on public.company_seal for select to authenticated using(public.has_app_capability('EMPLOYMENT_CONTRACT_MANAGE'));
create policy seal_event_read on public.company_seal_event for select to authenticated using(public.has_app_capability('EMPLOYMENT_CONTRACT_MANAGE'));
revoke all on public.company_seal,public.company_seal_event from anon,authenticated;
grant select on public.company_seal,public.company_seal_event to authenticated;
grant select on public.company_seal to service_role;
create function private.guard_company_seal() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'IMMUTABLE_SEAL'; end if;
 if (to_jsonb(new)-'active'-'ready') is distinct from (to_jsonb(old)-'active'-'ready') or (old.ready and not new.ready) then raise exception 'IMMUTABLE_SEAL'; end if;
 return new;
end $$;
create trigger seal_guard before update or delete on public.company_seal for each row execute function private.guard_company_seal();
create trigger seal_event_immutable before update or delete on public.company_seal_event for each row execute function public.contract_immutable();
create function public.reserve_company_seal(p_id uuid,p_company text,p_representative text,p_hash text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.has_app_capability('EMPLOYMENT_CONTRACT_MANAGE') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_company ~ '[[:cntrl:]]' or p_representative ~ '[[:cntrl:]]' then raise exception 'INVALID_NAME'; end if;
 insert into public.company_seal(id,storage_path,sha256,company_name,representative_name,uploaded_by)
 values(p_id,p_id::text||'/seal.png',p_hash,btrim(p_company),btrim(p_representative),auth.uid());
end $$;
create function public.activate_company_seal(p_id uuid,p_expected uuid) returns void
language plpgsql security definer set search_path='' as $$
declare current_id uuid; s public.company_seal;
begin
 if not public.has_app_capability('EMPLOYMENT_CONTRACT_MANAGE') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(782431,1);
 select id into current_id from public.company_seal where active;
 if current_id is distinct from p_expected then raise exception 'STALE_SEAL'; end if;
 select * into s from public.company_seal where id=p_id for update;
 if not found or s.uploaded_by<>auth.uid() or s.ready or not exists(select 1 from storage.objects where bucket_id='company-seals' and name=s.storage_path) then raise exception 'INVALID_SEAL'; end if;
 update public.company_seal set active=false where active;
 if current_id is not null then insert into public.company_seal_event(seal_id,action,actor_id) values(current_id,'DEACTIVATED',auth.uid()); end if;
 update public.company_seal set ready=true,active=true where id=p_id;
 insert into public.company_seal_event(seal_id,action,actor_id) values(p_id,'UPLOADED',auth.uid()),(p_id,'ACTIVATED',auth.uid());
end $$;
create function public.deactivate_company_seal(p_expected uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.has_app_capability('EMPLOYMENT_CONTRACT_MANAGE') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(782431,1);
 update public.company_seal set active=false where id=p_expected and active;
 if not found then raise exception 'STALE_SEAL'; end if;
 insert into public.company_seal_event(seal_id,action,actor_id) values(p_expected,'DEACTIVATED',auth.uid());
end $$;
alter table public.employment_contract_signature
 add column company_seal_id uuid references public.company_seal(id),
 add column company_name text,
 add column representative_name text;
-- Freeze exactly once, in the same transaction as the existing checked CEO RPC.
-- No backfill of old signatures, no lookup of the active seal during PDF retries.
create function private.snapshot_company_signature() returns trigger
language plpgsql security definer set search_path='' as $$
declare s public.company_seal;
begin
 if new.party='COMPANY' then
  perform pg_advisory_xact_lock(782431,1);
  select * into s from public.company_seal where active and ready;
  new.company_seal_id:=s.id;
  new.company_name:=coalesce(s.company_name,'DXT');
  new.representative_name:=coalesce(s.representative_name,
   (select name from public.employee where auth_user_id=new.actor_id),
   (select display_name from public.app_memberships where user_id=new.actor_id));
 else new.company_seal_id:=null;new.company_name:=null;new.representative_name:=null;
 end if;
 return new;
end $$;
create trigger company_signature_snapshot before insert on public.employment_contract_signature for each row execute function private.snapshot_company_signature();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('company-seals','company-seals',false,2097152,array['image/png']);
-- No authenticated Storage policies. Even managers use an authorized server proxy.
revoke all on function private.guard_company_seal(),private.snapshot_company_signature(),public.reserve_company_seal(uuid,text,text,text),public.activate_company_seal(uuid,uuid),public.deactivate_company_seal(uuid) from public,anon,authenticated;
grant execute on function public.reserve_company_seal(uuid,text,text,text),public.activate_company_seal(uuid,uuid),public.deactivate_company_seal(uuid) to authenticated;
commit;
