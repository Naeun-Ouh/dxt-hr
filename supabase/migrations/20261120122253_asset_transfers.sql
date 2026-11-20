begin;
-- Keep operational status on asset. A pending transfer does not change its holder.
-- Snapshots let former holders read their own period without reading the next holder.
alter table public.asset_assignment
 add column asset_type text,
 add column asset_model text,
 add column serial_number text,
 add column end_reason text,
 add column state text generated always as (case when returned_at is null then 'ACTIVE' else 'RETURNED' end) stored;
update public.asset_assignment h set asset_type=a.type,asset_model=a.model,serial_number=a.serial_number,
 end_reason=case when h.returned_at is not null then 'LEGACY_RETURNED' end
 from public.asset a where a.id=h.asset_id;
alter table public.asset_assignment alter column asset_type set not null,
 alter column asset_model set not null,alter column serial_number set not null;
-- Existing IDs, start/end dates and actor references are preserved verbatim.
drop policy assignment_read on public.asset_assignment;
create policy assignment_read on public.asset_assignment for select to authenticated
 using(public.has_app_capability('ASSET_MANAGE') or employee_id=public.current_employee_id());

create table public.asset_transfer (
 id uuid primary key,
 asset_id uuid not null references public.asset(id),
 assignment_id uuid not null references public.asset_assignment(id),
 sender_id uuid not null references public.employee(id),
 recipient_id uuid not null references public.employee(id),
 sender_name text not null,recipient_name text not null,
 asset_type text not null,asset_model text not null,serial_number text not null,
 handoff_date date not null,memo text not null default '' check(length(memo)<=2000),
 state text not null default 'PENDING' check(state in ('PENDING','CONFIRMED','CANCELLED')),
 requested_at timestamptz not null default clock_timestamp(),requested_by uuid not null references auth.users(id),
 confirmed_at timestamptz,cancelled_at timestamptz,resolved_by uuid references auth.users(id),
 forced boolean not null default false,
 check(sender_id<>recipient_id),
 check((state='PENDING' and confirmed_at is null and cancelled_at is null and resolved_by is null and not forced)
 or (state='CONFIRMED' and confirmed_at is not null and cancelled_at is null and resolved_by is not null)
 or (state='CANCELLED' and confirmed_at is null and cancelled_at is not null and resolved_by is not null and not forced))
);
create unique index asset_one_pending_transfer on public.asset_transfer(asset_id) where state='PENDING';
create index asset_transfer_sender on public.asset_transfer(sender_id);
create index asset_transfer_recipient on public.asset_transfer(recipient_id);
create index asset_assignment_employee on public.asset_assignment(employee_id);
alter table public.asset_transfer enable row level security;
revoke all on public.asset_transfer from public,anon,authenticated;
grant select on public.asset_transfer to authenticated;
grant all on public.asset_transfer to service_role;
create policy transfer_read on public.asset_transfer for select to authenticated using(
 public.has_app_capability('ASSET_MANAGE') or public.current_employee_id() in (sender_id,recipient_id));

alter table public.asset_event add column event_type text not null default 'LEGACY_CHANGE',
 add column transfer_id uuid references public.asset_transfer(id);
alter table public.asset_event add constraint asset_event_type_check check(event_type in
 ('LEGACY_CHANGE','REGISTERED','ASSIGNED','RETURNED','STATUS_CHANGED','TRANSFER_REQUESTED','TRANSFER_CONFIRMED','TRANSFER_CANCELLED','ADMIN_CORRECTED'));

-- Once closed, periods are immutable. Corrections close/open periods, never rewrite them.
create function public.guard_asset_assignment() returns trigger language plpgsql set search_path='' as $$
declare a public.asset;
begin
 if tg_op='DELETE' then raise exception 'Assignment history is immutable'; end if;
 if tg_op='INSERT' then
  select * into strict a from public.asset where id=new.asset_id;
  new.asset_type:=a.type;new.asset_model:=a.model;new.serial_number:=a.serial_number;
 else
  if old.returned_at is not null or new.returned_at is null or new.returned_at<old.assigned_at
   or (to_jsonb(new)-array['returned_at','end_reason','state']) is distinct from (to_jsonb(old)-array['returned_at','end_reason','state']) then
   raise exception 'Assignment history is immutable';
  end if;
 end if;
 return new;
end $$;
create trigger guard_asset_assignment before insert or update or delete on public.asset_assignment for each row execute function public.guard_asset_assignment();
revoke all on function public.guard_asset_assignment() from public,anon,authenticated;

create or replace function public.save_asset(p_id uuid,p_values jsonb,p_expected_version int) returns uuid
language plpgsql security definer set search_path='' as $$
declare old public.asset;holder uuid;stamp timestamptz:=clock_timestamp();new_status text;
begin
 if auth.uid() is null or not public.has_app_capability('ASSET_MANAGE') then raise exception 'Denied' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,7));
 select * into old from public.asset where id=p_id for update;
 if (old.id is null and p_expected_version<>0) or (old.id is not null and old.version is distinct from p_expected_version) or p_expected_version is null then raise exception 'Stale record'; end if;
 -- Explicitly resolve a pending handoff before administrative correction or editing metadata.
 if exists(select 1 from public.asset_transfer where asset_id=p_id and state='PENDING') then raise exception 'Resolve pending transfer first'; end if;
 holder:=nullif(p_values->>'current_holder_id','')::uuid;new_status:=p_values->>'status';
 if holder is not null and holder is distinct from old.current_holder_id then
  perform 1 from public.employee where id=holder and employment_status='ACTIVE' for share;
  if not found then raise exception 'Inactive holder'; end if;
 end if;
 insert into public.asset(id,type,manufacturer,model,serial_number,status,current_holder_id,assigned_at)
 values(p_id,p_values->>'type',coalesce(p_values->>'manufacturer',''),coalesce(p_values->>'model',''),trim(p_values->>'serial_number'),new_status,holder,
 case when holder is null then null when holder is not distinct from old.current_holder_id then old.assigned_at else stamp end)
 on conflict(id) do update set type=excluded.type,manufacturer=excluded.manufacturer,model=excluded.model,serial_number=excluded.serial_number,status=excluded.status,current_holder_id=excluded.current_holder_id,assigned_at=excluded.assigned_at,version=public.asset.version+1;
 if holder is distinct from old.current_holder_id then
  update public.asset_assignment set returned_at=stamp,end_reason=case when holder is null then 'RETURNED' else 'ADMIN_CORRECTED' end where asset_id=p_id and returned_at is null;
  if holder is not null then insert into public.asset_assignment(asset_id,employee_id,assigned_at,changed_by) values(p_id,holder,stamp,auth.uid());end if;
 end if;
 if old.id is null or holder is distinct from old.current_holder_id or new_status is distinct from old.status then
  insert into public.asset_event(asset_id,previous_status,status,previous_holder_id,holder_id,actor_id,event_type)
  values(p_id,old.status,new_status,old.current_holder_id,holder,auth.uid(),case
   when old.current_holder_id is not null and holder is null then 'RETURNED'
   when old.current_holder_id is not null and holder is distinct from old.current_holder_id then 'ADMIN_CORRECTED'
   when holder is distinct from old.current_holder_id then 'ASSIGNED'
   when old.id is null then 'REGISTERED' else 'STATUS_CHANGED' end);
 end if;
 insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),'SAVE','asset',p_id);
 return p_id;
end $$;

create function public.request_asset_transfer(p_id uuid,p_asset uuid,p_assignment uuid,p_recipient uuid,p_date date,p_memo text) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=public.current_employee_id();a public.asset;h public.asset_assignment;t public.asset_transfer;recipient_name text;
begin
 if auth.uid() is null or me is null then raise exception 'Unavailable' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_asset::text,7));
 select * into a from public.asset where id=p_asset for update;
 select * into t from public.asset_transfer where id=p_id;
 -- Request retries must match the original authenticated sender and all payload fields.
 if t.id is not null then
  if t.sender_id=me and t.requested_by=auth.uid() and t.asset_id=p_asset and t.assignment_id=p_assignment and t.recipient_id=p_recipient and t.handoff_date=p_date and t.memo is not distinct from p_memo then return t.id;end if;
  raise exception 'Unavailable' using errcode='42501';
 end if;
 select * into h from public.asset_assignment where id=p_assignment and asset_id=p_asset and employee_id=me and returned_at is null for update;
 if a.id is null or a.current_holder_id is distinct from me or h.id is null then raise exception 'Unavailable' using errcode='42501';end if;
 if p_date is null or not isfinite(p_date) or p_date<(h.assigned_at at time zone 'Asia/Seoul')::date or p_date>(clock_timestamp() at time zone 'Asia/Seoul')::date
 or p_memo is null or length(p_memo)>2000 or p_recipient=me then raise exception 'Invalid transfer';end if;
 select name into recipient_name from public.employee where id=p_recipient and employment_status='ACTIVE' for share;
 if not found then raise exception 'Invalid recipient';end if;
 insert into public.asset_transfer(id,asset_id,assignment_id,sender_id,recipient_id,sender_name,recipient_name,asset_type,asset_model,serial_number,handoff_date,memo,requested_by)
 values(p_id,p_asset,h.id,me,p_recipient,(select name from public.employee where id=me),recipient_name,a.type,a.model,a.serial_number,p_date,p_memo,auth.uid());
 update public.asset set version=version+1 where id=p_asset;
 insert into public.asset_event(asset_id,previous_status,status,previous_holder_id,holder_id,actor_id,event_type,transfer_id)
 values(p_asset,a.status,a.status,me,me,auth.uid(),'TRANSFER_REQUESTED',p_id);
 insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),'TRANSFER_REQUESTED','asset_transfer',p_id);
 return p_id;
end $$;

create function public.resolve_asset_transfer(p_id uuid,p_action text,p_force boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=public.current_employee_id();manager boolean:=public.has_app_capability('ASSET_MANAGE');t public.asset_transfer;a public.asset;h public.asset_assignment;effective_at timestamptz;stamp timestamptz:=clock_timestamp();
begin
 if auth.uid() is null or not public.has_app_capability('EMPLOYEE_ACCESS') or p_action is null or p_action not in ('CONFIRMED','CANCELLED') or p_force is null then raise exception 'Unavailable' using errcode='42501';end if;
 select * into t from public.asset_transfer where id=p_id;
 if t.id is null or (p_action='CANCELLED' and (not manager or p_force)) or (p_action='CONFIRMED' and ((p_force and not manager) or (not p_force and (me is null or t.recipient_id<>me)))) then raise exception 'Unavailable' using errcode='42501';end if;
 -- Every asset mutation takes the same advisory/row locks; re-read state after waiting.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(t.asset_id::text,7));
 select * into a from public.asset where id=t.asset_id for update;
 select * into t from public.asset_transfer where id=p_id for update;
 if t.state=p_action then return t.id;end if;
 if t.state<>'PENDING' then raise exception 'Transfer already resolved';end if;
 select * into h from public.asset_assignment where id=t.assignment_id and returned_at is null for update;
 if h.id is null or a.current_holder_id is distinct from t.sender_id or h.employee_id<>t.sender_id or h.asset_id<>a.id then raise exception 'Stale assignment';end if;
 if p_action='CONFIRMED' then
  perform 1 from public.employee where id=t.recipient_id and employment_status='ACTIVE' for share;
  if not found then raise exception 'Inactive recipient';end if;
  -- Date-level handoff; never end before the exact initial assignment timestamp on that day.
  effective_at:=greatest(h.assigned_at,t.handoff_date::timestamp at time zone 'Asia/Seoul');
  update public.asset_assignment set returned_at=effective_at,end_reason='TRANSFER_CONFIRMED' where id=h.id;
  insert into public.asset_assignment(asset_id,employee_id,assigned_at,changed_by) values(a.id,t.recipient_id,effective_at,auth.uid());
  update public.asset set current_holder_id=t.recipient_id,assigned_at=effective_at,version=version+1 where id=a.id;
  update public.asset_transfer set state='CONFIRMED',confirmed_at=stamp,resolved_by=auth.uid(),forced=p_force where id=t.id;
 else
  update public.asset_transfer set state='CANCELLED',cancelled_at=stamp,resolved_by=auth.uid() where id=t.id;
  update public.asset set version=version+1 where id=a.id;
 end if;
 insert into public.asset_event(asset_id,previous_status,status,previous_holder_id,holder_id,actor_id,event_type,transfer_id)
 values(a.id,a.status,a.status,t.sender_id,case when p_action='CONFIRMED' then t.recipient_id else t.sender_id end,auth.uid(),'TRANSFER_'||p_action,t.id);
 insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),case when p_force then 'TRANSFER_FORCE_CONFIRMED' else 'TRANSFER_'||p_action end,'asset_transfer',t.id);
 return t.id;
end $$;
revoke all on function public.request_asset_transfer(uuid,uuid,uuid,uuid,date,text),public.resolve_asset_transfer(uuid,text,boolean) from public,anon;
grant execute on function public.request_asset_transfer(uuid,uuid,uuid,uuid,date,text),public.resolve_asset_transfer(uuid,text,boolean) to authenticated;
commit;
