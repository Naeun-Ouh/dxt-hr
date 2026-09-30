begin;
create or replace function public.has_app_capability(requested text) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.app_memberships m where m.user_id=auth.uid() and m.status='ACTIVE'
 and not exists(select 1 from public.employee e where e.auth_user_id=m.user_id and e.employment_status='INACTIVE')
 and case requested when 'EMPLOYEE_ACCESS' then cardinality(m.roles)>0
 when 'EMPLOYEE_MANAGE' then m.roles && array['ADMIN','CEO']::text[]
 when 'EXPENSE_MANAGE' then m.roles && array['ADMIN','CEO','EXPENSE_ADMIN']::text[]
 when 'PROJECT_MANAGE' then m.roles && array['ADMIN','CEO']::text[]
 when 'TEAM_PROJECT_READ' then m.roles && array['ADMIN','CEO','TEAM_LEADER']::text[]
 when 'PRIVATE_HR_ACCESS' then m.roles @> array['CEO']::text[] or (m.roles @> array['ADMIN']::text[] and m.capabilities @> array['PRIVATE_HR_ACCESS']::text[]) else false end);
$$;
-- Dates are interpreted in the company's timezone, independent of a client/session timezone.
create function public.expense_today() returns date language sql stable set search_path='' as $$ select (now() at time zone 'Asia/Seoul')::date $$;
create function public.expense_deadline(p_month date) returns date language sql immutable set search_path='' as $$
 select (p_month+interval '1 month')::date + ((7-extract(dow from p_month+interval '1 month')::int)%7);
$$;
create table public.expense_claim (
 id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employee(id), usage_month date not null,
 status text not null default 'DRAFT' check(status in ('DRAFT','SUBMITTED','LOCKED','PAID')),
 submitted_at timestamptz, late_reason text not null default '' check(length(late_reason)<=2000),
 locked_at timestamptz, payment_date date, version int not null default 1 check(version>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(employee_id,usage_month), check(usage_month=date_trunc('month',usage_month)::date and usage_month>='1900-01-01')
);
create table public.expense_attachment (
 id uuid primary key default gen_random_uuid(), claim_id uuid not null references public.expense_claim(id),
 storage_path text unique not null, filename text not null check(length(filename) between 1 and 200),
 mime_type text not null check(mime_type in ('application/pdf','image/png','image/jpeg')),
 byte_size int not null check(byte_size between 1 and 10485760), ready boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.expense_item (
 id uuid primary key, claim_id uuid not null references public.expense_claim(id), usage_date date not null,
 expense_type text not null check(expense_type in ('OVERTIME','DINING','FUEL','TOLL','TAXI','TRAINING','SUPPLIES','OTHER')),
 merchant text not null check(length(trim(merchant)) between 1 and 200), description text not null check(length(trim(description)) between 1 and 500),
 account_category text not null check(length(account_category) between 1 and 100), amount int not null check(amount between 1 and 1000000000),
 evidence_type text not null check(evidence_type in ('개인카드','현금영수증','간이영수증')),
 payment_method text not null check(payment_method in ('PERSONAL_CARD','CASH')), project_id uuid references public.project(id),
 trip_context text not null default '' check(length(trip_context)<=200), notes text not null default '' check(length(notes)<=2000),
 legacy_summary boolean not null default false,
 attachment_id uuid not null references public.expense_attachment(id), version int not null default 1,
 import_filename text check(length(import_filename)<=200), import_origin text check(length(import_origin)<=200), imported_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index expense_item_claim on public.expense_item(claim_id);
create table public.expense_attendee (
 item_id uuid not null references public.expense_item(id) on delete cascade,
 employee_id uuid not null references public.employee(id), allocated_amount int not null check(allocated_amount between 1 and 30000),
 primary key(item_id,employee_id)
);
create table public.vehicle_travel_detail (
 item_id uuid primary key references public.expense_item(id) on delete cascade,
 kind text not null check(kind in ('FUEL','TOLL')), project_or_trip_name text not null check(length(trim(project_or_trip_name)) between 1 and 200),
 origin text not null check(length(trim(origin)) between 1 and 200), destination text not null check(length(trim(destination)) between 1 and 200),
 one_way_amount int not null check(one_way_amount between 1 and 100000000), trip_count int not null check(trip_count between 1 and 1000),
 calculated_total bigint generated always as (one_way_amount::bigint*trip_count) stored
);
create function public.expense_editable(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select employee_id=public.current_employee_id() and status in ('DRAFT','SUBMITTED') and locked_at is null
 and (payment_date is null or public.expense_today()<=payment_date) from public.expense_claim where id=p_id),false);
$$;
create function public.can_read_expense(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.expense_claim where id=p_id and (employee_id=public.current_employee_id() or public.has_app_capability('EXPENSE_MANAGE')));
$$;
alter table public.expense_claim enable row level security;
alter table public.expense_item enable row level security;
alter table public.expense_attachment enable row level security;
alter table public.expense_attendee enable row level security;
alter table public.vehicle_travel_detail enable row level security;
revoke all on public.expense_claim,public.expense_item,public.expense_attachment,public.expense_attendee,public.vehicle_travel_detail from public,anon,authenticated;
grant select on public.expense_claim,public.expense_item,public.expense_attachment,public.expense_attendee,public.vehicle_travel_detail to authenticated;
grant all on public.expense_claim,public.expense_item,public.expense_attachment,public.expense_attendee,public.vehicle_travel_detail to service_role;
create policy expense_claim_read on public.expense_claim for select to authenticated using(employee_id=public.current_employee_id() or public.has_app_capability('EXPENSE_MANAGE'));
create policy expense_item_read on public.expense_item for select to authenticated using(public.can_read_expense(claim_id));
create policy expense_attachment_read on public.expense_attachment for select to authenticated using(public.can_read_expense(claim_id));
create policy expense_attendee_read on public.expense_attendee for select to authenticated using(exists(select 1 from public.expense_item i where i.id=item_id));
create policy vehicle_read on public.vehicle_travel_detail for select to authenticated using(exists(select 1 from public.expense_item i where i.id=item_id));

create function public.ensure_expense_claim(p_month date) returns uuid language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=public.current_employee_id(); target uuid;
begin
 if owner_id is null then raise insufficient_privilege; end if;
 if p_month is null or p_month<>date_trunc('month',p_month)::date or p_month>public.expense_today() then raise check_violation; end if;
 insert into public.expense_claim(employee_id,usage_month) values(owner_id,p_month) on conflict(employee_id,usage_month) do nothing;
 select id into target from public.expense_claim where employee_id=owner_id and usage_month=p_month;
 if not public.expense_editable(target) then raise insufficient_privilege; end if;
 return target;
end; $$;
create function public.reserve_expense_attachment(p_claim uuid,p_filename text,p_mime text,p_size int) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid:=gen_random_uuid();
begin
 perform 1 from public.expense_claim where id=p_claim for update;
 if not public.expense_editable(p_claim) then raise insufficient_privilege; end if;
 insert into public.expense_attachment(id,claim_id,storage_path,filename,mime_type,byte_size) values(target,p_claim,p_claim::text||'/'||target::text,p_filename,p_mime,p_size);
 return target;
end; $$;
-- Private, immutable objects: users cannot replace receipts after submission or payment.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('expense-evidence','expense-evidence',false,10485760,array['application/pdf','image/png','image/jpeg']) on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
create policy expense_object_read on storage.objects for select to authenticated using(bucket_id='expense-evidence' and exists(select 1 from public.expense_attachment a where a.storage_path=name and a.ready and public.can_read_expense(a.claim_id)));
create policy expense_object_insert on storage.objects for insert to authenticated with check(bucket_id='expense-evidence' and exists(select 1 from public.expense_attachment a where a.storage_path=name and not a.ready and public.expense_editable(a.claim_id)));
create function public.finish_expense_attachment(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.expense_attachment;
begin
 select * into a from public.expense_attachment where id=p_id;
 perform 1 from public.expense_claim where id=a.claim_id for update;
 if not public.expense_editable(a.claim_id) then raise insufficient_privilege; end if;
 if not exists(select 1 from storage.objects where bucket_id='expense-evidence' and name=a.storage_path and (metadata->>'size')::bigint=a.byte_size and metadata->>'mimetype'=a.mime_type) then raise check_violation; end if;
 update public.expense_attachment set ready=true where id=p_id;
end; $$;

create function public.save_expense_items(p_claim uuid,p_items jsonb,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare c public.expense_claim; v jsonb; a jsonb; target uuid; expected int; amount_value bigint; type_value text; allocation bigint; month_age int;
begin
 -- Global dining transaction lock prevents two different submitters consuming the same allowance.
 -- All expense writers take it before claim locks, including edits that release allocations.
 perform pg_advisory_xact_lock(510005);
 select * into c from public.expense_claim where id=p_claim for update;
 if not public.expense_editable(p_claim) then raise insufficient_privilege; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 500 or p_reason is null then raise check_violation; end if;
 month_age:=(extract(year from public.expense_today())::int-extract(year from c.usage_month)::int)*12+extract(month from public.expense_today())::int-extract(month from c.usage_month)::int;
 if month_age>=2 and length(trim(p_reason))=0 then raise check_violation using message='RETRO_REASON'; end if;
 for v in select value from jsonb_array_elements(p_items) loop
  target:=(v->>'id')::uuid; expected:=(v->>'version')::int; type_value:=v->>'expense_type';
  if target is null or expected is null or expected<0 or v ? 'employee_id' then raise check_violation; end if;
  if (v->>'usage_date')::date<c.usage_month or (v->>'usage_date')::date>=(c.usage_month+interval '1 month')::date or (v->>'usage_date')::date>public.expense_today() then raise check_violation; end if;
  if not exists(select 1 from public.expense_attachment where id=(v->>'attachment_id')::uuid and claim_id=p_claim and ready) then raise insufficient_privilege; end if;
  if nullif(v->>'project_id','') is not null and not exists(select 1 from public.project_assignment where project_id=(v->>'project_id')::uuid and employee_id=c.employee_id) then raise insufficient_privilege; end if;
  amount_value:=(v->>'amount')::bigint;
  if type_value in ('FUEL','TOLL') and not coalesce((v->>'legacy_summary')::boolean,false) then amount_value:=(v->'vehicle'->>'one_way_amount')::bigint*(v->'vehicle'->>'trip_count')::int; end if;
  if coalesce((v->>'legacy_summary')::boolean,false) and (coalesce(v->>'import_origin','') not like '지출결의서!%' or nullif(v->>'import_filename','') is null) then raise check_violation; end if;
  if expected=0 then
   insert into public.expense_item(id,claim_id,usage_date,expense_type,merchant,description,account_category,amount,evidence_type,payment_method,project_id,trip_context,notes,attachment_id,legacy_summary,import_filename,import_origin,imported_at)
   values(target,p_claim,(v->>'usage_date')::date,type_value,v->>'merchant',v->>'description',v->>'account_category',amount_value,v->>'evidence_type',v->>'payment_method',nullif(v->>'project_id','')::uuid,coalesce(v->>'trip_context',''),coalesce(v->>'notes',''),(v->>'attachment_id')::uuid,coalesce((v->>'legacy_summary')::boolean,false),v->>'import_filename',v->>'import_origin',case when v->>'import_filename' is not null then now() end);
  else
   update public.expense_item set usage_date=(v->>'usage_date')::date,expense_type=type_value,merchant=v->>'merchant',description=v->>'description',account_category=v->>'account_category',amount=amount_value,evidence_type=v->>'evidence_type',payment_method=v->>'payment_method',project_id=nullif(v->>'project_id','')::uuid,trip_context=coalesce(v->>'trip_context',''),notes=coalesce(v->>'notes',''),attachment_id=(v->>'attachment_id')::uuid,legacy_summary=coalesce((v->>'legacy_summary')::boolean,false),version=version+1,updated_at=now() where id=target and claim_id=p_claim and version=expected;
   if not found then raise serialization_failure; end if;
   delete from public.expense_attendee where item_id=target;
   delete from public.vehicle_travel_detail where item_id=target;
  end if;
  if type_value in ('FUEL','TOLL') and not coalesce((v->>'legacy_summary')::boolean,false) then
   insert into public.vehicle_travel_detail(item_id,kind,project_or_trip_name,origin,destination,one_way_amount,trip_count) values(target,type_value,v->'vehicle'->>'project_or_trip_name',v->'vehicle'->>'origin',v->'vehicle'->>'destination',(v->'vehicle'->>'one_way_amount')::int,(v->'vehicle'->>'trip_count')::int);
  end if;
  if type_value='DINING' then
   if jsonb_typeof(v->'attendees') is distinct from 'array' or jsonb_array_length(v->'attendees')=0 then raise check_violation; end if;
   allocation:=0;
   for a in select value from jsonb_array_elements(v->'attendees') loop
    if not exists(select 1 from public.employee where id=(a->>'employee_id')::uuid and employment_status='ACTIVE') then raise check_violation; end if;
    if coalesce((select sum(ea.allocated_amount) from public.expense_attendee ea join public.expense_item i on i.id=ea.item_id join public.expense_claim ec on ec.id=i.claim_id where ea.employee_id=(a->>'employee_id')::uuid and ec.usage_month=c.usage_month),0)+(a->>'allocated_amount')::int>30000 then raise check_violation using message='DINING_ALLOWANCE'; end if;
    insert into public.expense_attendee values(target,(a->>'employee_id')::uuid,(a->>'allocated_amount')::int);
    allocation:=allocation+(a->>'allocated_amount')::int;
   end loop;
   if allocation>amount_value then raise check_violation; end if;
  end if;
 end loop;
 update public.expense_claim set late_reason=p_reason,version=version+1,updated_at=now() where id=p_claim;
 insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),'SAVE_ITEMS','expense_claim',p_claim);
end; $$;
create function public.submit_expense_claim(p_claim uuid,p_version int,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare c public.expense_claim; pay date;
begin
 select * into c from public.expense_claim where id=p_claim for update;
 if not public.expense_editable(p_claim) then raise insufficient_privilege; end if;
 if c.version<>p_version then raise serialization_failure; end if;
 if not exists(select 1 from public.expense_item where claim_id=p_claim) or p_reason is null then raise check_violation; end if;
 if c.usage_month<=date_trunc('month',public.expense_today()-interval '2 months')::date and length(trim(p_reason))=0 then raise check_violation using message='RETRO_REASON'; end if;
 -- Retroactive submissions enter the next available payment cycle, not an already closed period.
 pay:=greatest((c.usage_month+interval '1 month 14 days')::date,(date_trunc('month',public.expense_today())+interval '14 days')::date);
 if pay<public.expense_today() then pay:=(pay+interval '1 month')::date; end if;
 update public.expense_claim set status='SUBMITTED',submitted_at=coalesce(submitted_at,now()),payment_date=coalesce(payment_date,pay),late_reason=p_reason,version=version+1,updated_at=now() where id=p_claim;
 insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),'SUBMIT','expense_claim',p_claim);
end; $$;
create function public.manage_expense_claim(p_claim uuid,p_version int,p_action text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.has_app_capability('EXPENSE_MANAGE') then raise insufficient_privilege; end if;
 if p_action not in ('LOCK','PAY') or p_action is null then raise check_violation; end if;
 update public.expense_claim set status=case when p_action='PAY' then 'PAID' else 'LOCKED' end,locked_at=coalesce(locked_at,now()),version=version+1,updated_at=now()
 where id=p_claim and version=p_version and (status='SUBMITTED' or (status='LOCKED' and p_action='PAY'));
 if not found then raise serialization_failure; end if;
 insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),p_action,'expense_claim',p_claim);
end; $$;
revoke all on function public.expense_today(),public.expense_deadline(date),public.expense_editable(uuid),public.can_read_expense(uuid),public.ensure_expense_claim(date),public.reserve_expense_attachment(uuid,text,text,int),public.finish_expense_attachment(uuid),public.save_expense_items(uuid,jsonb,text),public.submit_expense_claim(uuid,int,text),public.manage_expense_claim(uuid,int,text) from public,anon;
grant execute on function public.expense_today(),public.expense_deadline(date),public.expense_editable(uuid),public.can_read_expense(uuid),public.ensure_expense_claim(date),public.reserve_expense_attachment(uuid,text,text,int),public.finish_expense_attachment(uuid),public.save_expense_items(uuid,jsonb,text),public.submit_expense_claim(uuid,int,text),public.manage_expense_claim(uuid,int,text) to authenticated;

-- Preview exposes only availability, never another submitter's claims or receipts.
create function public.expense_dining_available(p_month date,p_items jsonb) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if public.current_employee_id() is null then raise insufficient_privilege; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>500 then raise check_violation; end if;
 if exists(select 1 from jsonb_array_elements(p_items) v join public.expense_item i on i.id=(v->>'id')::uuid join public.expense_claim c on c.id=i.claim_id where c.employee_id<>public.current_employee_id() or c.usage_month<>p_month) then raise insufficient_privilege; end if;
 return not exists(
  select employee_id from (
   select a.employee_id,a.allocated_amount from public.expense_attendee a join public.expense_item i on i.id=a.item_id join public.expense_claim c on c.id=i.claim_id
   where c.usage_month=p_month and not exists(select 1 from jsonb_array_elements(p_items) v where (v->>'id')::uuid=i.id)
   union all select (a->>'employee_id')::uuid,(a->>'allocated_amount')::int from jsonb_array_elements(p_items) v cross join lateral jsonb_array_elements(v->'attendees') a where v->>'expense_type'='DINING'
  ) allocations group by employee_id having sum(allocated_amount)>30000
 );
end; $$;
revoke all on function public.expense_dining_available(date,jsonb) from public,anon;
grant execute on function public.expense_dining_available(date,jsonb) to authenticated;
commit;
