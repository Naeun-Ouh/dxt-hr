begin;
alter table public.employment_contract add column signing_due_date date check(signing_due_date between date '1900-01-01' and date '9999-12-31'),add column due_version int not null default 0 check(due_version>=0);
alter table public.employment_contract_event add column details jsonb not null default '{}'::jsonb;
create table public.employment_contract_reason(
 contract_id uuid primary key references public.employment_contract(id),action text not null check(action in('CANCELLED','DECLINED')),
 encrypted_reason text not null check(encrypted_reason ~ '^v1[.][A-Za-z0-9_-]{1,40}[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{22}[.][A-Za-z0-9_-]+$' and length(encrypted_reason)<=12000),
 actor_id uuid not null references auth.users(id),created_at timestamptz not null default now()
);
alter table public.employment_contract_reason enable row level security;
create policy contract_reason_read on public.employment_contract_reason for select to authenticated using(public.contract_scope(contract_id,true));
revoke all on public.employment_contract_reason from public,anon,authenticated;
grant select on public.employment_contract_reason to authenticated;
create trigger contract_reason_immutable before update or delete on public.employment_contract_reason for each row execute function public.contract_immutable();
create function public.set_contract_due_date(p_id uuid,p_version int,p_due_version int,p_due date) returns void language plpgsql security definer set search_path='' as $$
declare c public.employment_contract;
begin
 if not public.has_app_capability('EMPLOYMENT_CONTRACT_MANAGE') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into c from public.employment_contract where id=p_id for update;
 if not found then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if c.current_version is distinct from p_version or c.due_version is distinct from p_due_version then raise exception 'STALE_CONTRACT';end if;
 if c.status in('COMPLETED','CANCELLED','DECLINED') or c.company_signed_at is not null then raise exception 'IMMUTABLE_CONTRACT';end if;
 if p_due is not null and (not isfinite(p_due) or p_due not between date '1900-01-01' and date '9999-12-31') then raise exception 'INVALID_DUE_DATE';end if;
 if c.signing_due_date is not distinct from p_due then return;end if;
 update public.employment_contract set signing_due_date=p_due,due_version=due_version+1 where id=p_id;
 insert into public.employment_contract_event(contract_id,action,actor_id,details) values(p_id,'DUE_DATE_UPDATED',auth.uid(),jsonb_build_object('previous_due_date',c.signing_due_date,'due_date',p_due,'due_version',c.due_version+1));
end $$;
create function public.transition_contract_with_reason(p_id uuid,p_version int,p_action text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare c public.employment_contract;
begin
 if p_action is null or p_action not in('CANCELLED','DECLINED') then raise exception 'INVALID_ACTION';end if;
 select * into c from public.employment_contract where id=p_id for update;
 -- Existing transition owns authorization, version/state checks and append-only audit.
 perform public.transition_employment_contract(p_id,p_version,p_action);
 if c.status=p_action then return;end if;
 if p_reason is not null then
  if p_reason !~ '^v1[.][A-Za-z0-9_-]{1,40}[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{22}[.][A-Za-z0-9_-]+$' or length(p_reason)>12000 then raise exception 'INVALID_REASON';end if;
  insert into public.employment_contract_reason(contract_id,action,encrypted_reason,actor_id) values(p_id,p_action,p_reason,auth.uid());
 end if;
end $$;
revoke all on function public.set_contract_due_date(uuid,int,int,date),public.transition_contract_with_reason(uuid,int,text,text) from public,anon,authenticated;
grant execute on function public.set_contract_due_date(uuid,int,int,date),public.transition_contract_with_reason(uuid,int,text,text) to authenticated;
commit;
