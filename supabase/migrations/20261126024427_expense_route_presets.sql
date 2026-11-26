begin;
-- Personal reusable inputs only. Applying a preset copies values to the existing
-- vehicle detail; no FK or cascading rewrite of historical expenses is introduced.
create table public.expense_route_preset (
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null references public.employee(id),
 origin text not null check(length(trim(origin)) between 1 and 200),
 destination text not null check(length(trim(destination)) between 1 and 200),
 alias text not null default '' check(length(alias)<=100),
 fuel_amount bigint check(fuel_amount between 1 and 100000000),
 toll_amount bigint check(toll_amount between 1 and 100000000),
 active boolean not null default true,
 version int not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index expense_route_preset_owner on public.expense_route_preset(employee_id);
alter table public.expense_route_preset enable row level security;
revoke all on public.expense_route_preset from public,anon,authenticated;
grant select on public.expense_route_preset to authenticated;
create policy expense_route_preset_own on public.expense_route_preset for select to authenticated
 using(employee_id=(select public.current_employee_id()));
create function public.save_expense_route_preset(p_id uuid,p_version int,p_values jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare self uuid:=public.current_employee_id();target uuid;old public.expense_route_preset;key text;
begin
 if self is null then raise insufficient_privilege;end if;
 if p_version is null or p_version<0 or jsonb_typeof(p_values) is distinct from 'object'
 or exists(select 1 from jsonb_object_keys(p_values) k where k not in ('origin','destination','alias','fuel_amount','toll_amount','active'))
 or jsonb_typeof(p_values->'origin') is distinct from 'string' or jsonb_typeof(p_values->'destination') is distinct from 'string'
 or jsonb_typeof(p_values->'alias') is distinct from 'string' or jsonb_typeof(p_values->'active') is distinct from 'boolean' then raise check_violation;end if;
 foreach key in array array['fuel_amount','toll_amount'] loop
  if not(p_values ? key) or (p_values->key<>'null'::jsonb and (jsonb_typeof(p_values->key) is distinct from 'number' or (p_values->>key)!~'^[0-9]+$')) then raise check_violation;end if;
 end loop;
 if p_id is null then
  if p_version<>0 then raise serialization_failure;end if;
  insert into public.expense_route_preset(employee_id,origin,destination,alias,fuel_amount,toll_amount,active)
  values(self,trim(p_values->>'origin'),trim(p_values->>'destination'),trim(p_values->>'alias'),(p_values->>'fuel_amount')::bigint,(p_values->>'toll_amount')::bigint,(p_values->>'active')::boolean) returning id into target;
 else
  select * into old from public.expense_route_preset where id=p_id for update;
  if old.id is null or old.employee_id<>self then raise insufficient_privilege;end if;
  if old.version<>p_version then raise serialization_failure;end if;
  update public.expense_route_preset set origin=trim(p_values->>'origin'),destination=trim(p_values->>'destination'),alias=trim(p_values->>'alias'),fuel_amount=(p_values->>'fuel_amount')::bigint,toll_amount=(p_values->>'toll_amount')::bigint,active=(p_values->>'active')::boolean,version=version+1,updated_at=now() where id=p_id;
  target:=p_id;
 end if;
 insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),case when p_id is null then 'REGISTER' when not(p_values->>'active')::boolean then 'DEACTIVATE' else 'UPDATE' end,'expense_route_preset',target);
 return target;
end;$$;
revoke all on function public.save_expense_route_preset(uuid,int,jsonb) from public,anon;
grant execute on function public.save_expense_route_preset(uuid,int,jsonb) to authenticated;

-- Parent-row lock serializes removal with submit, other removals, finish and pay.
-- A replacement must finish first. Pending uploads do not count as evidence.
create or replace function public.remove_expense_attachment(p_claim uuid,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.expense_claim;a public.expense_attachment;
begin
 select * into c from public.expense_claim where id=p_claim for update;
 if not public.expense_editable(p_claim) then raise insufficient_privilege;end if;
 select * into a from public.expense_attachment where id=p_id and claim_id=p_claim;
 if a.id is null then raise insufficient_privilege;end if;
 if a.deleted_at is not null then return;end if;
 if c.status='SUBMITTED' and a.ready and not exists(select 1 from public.expense_attachment where claim_id=p_claim and id<>p_id and ready and deleted_at is null) then raise check_violation using message='LAST_READY_EVIDENCE';end if;
 update public.expense_attachment set deleted_at=now() where id=p_id;
 insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),'REMOVE','expense_attachment',p_id);
end;$$;
-- New reservations match the portable browser transport cap. Existing 10 MiB
-- evidence and bucket metadata remain readable; no historical size backfill.
create or replace function public.reserve_expense_attachment(p_claim uuid,p_filename text,p_mime text,p_size int) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid:=gen_random_uuid();n bigint;total bigint;
begin
 perform 1 from public.expense_claim where id=p_claim for update;
 if not public.expense_editable(p_claim) then raise insufficient_privilege;end if;
 if p_size is null or p_size not between 1 and 4194304 then raise check_violation using message='ATTACHMENT_TRANSPORT_LIMIT';end if;
 select count(*),coalesce(sum(byte_size),0) into n,total from public.expense_attachment where claim_id=p_claim and deleted_at is null;
 if n>=20 or total+p_size>104857600 then raise check_violation using message='ATTACHMENT_LIMIT';end if;
 insert into public.expense_attachment(id,claim_id,storage_path,filename,mime_type,byte_size) values(target,p_claim,p_claim::text||'/'||target::text,p_filename,p_mime,p_size);
 return target;
end;$$;
commit;
