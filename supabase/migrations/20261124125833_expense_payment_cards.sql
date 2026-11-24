begin;
-- Only identification metadata; no payment credentials. Deactivation preserves history.
create table public.expense_payment_card (
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null references public.employee(id),
 issuer text not null check(length(trim(issuer)) between 1 and 50 and issuer !~ '[0-9][0-9 -]{11,}[0-9]'),
 nickname text not null check(length(trim(nickname)) between 1 and 50 and nickname !~ '[0-9][0-9 -]{11,}[0-9]'),
 last4 text not null check(last4 ~ '^[0-9]{4}$'),
 active boolean not null default true,
 version int not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index expense_payment_card_employee on public.expense_payment_card(employee_id);
alter table public.expense_payment_card enable row level security;
revoke all on public.expense_payment_card from public,anon,authenticated;
grant select on public.expense_payment_card to authenticated;
create policy expense_payment_card_own on public.expense_payment_card for select to authenticated
 using(employee_id=(select public.current_employee_id()));
alter table public.expense_item add column payment_card_id uuid references public.expense_payment_card(id);
alter table public.expense_item add column payment_card_label text;
alter table public.expense_item add constraint expense_cash_no_card check(payment_method<>'CASH' or (payment_card_id is null and payment_card_label is null));
create index expense_item_payment_card on public.expense_item(payment_card_id) where payment_card_id is not null;

create function public.save_expense_payment_card(p_id uuid,p_version int,p_values jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare self uuid:=public.current_employee_id(); target uuid; old public.expense_payment_card;
begin
 if self is null then raise insufficient_privilege; end if;
 if p_version is null or p_version<0 or jsonb_typeof(p_values) is distinct from 'object'
 or exists(select 1 from jsonb_object_keys(p_values) k where k not in ('issuer','nickname','last4','active'))
 or jsonb_typeof(p_values->'issuer') is distinct from 'string' or jsonb_typeof(p_values->'nickname') is distinct from 'string'
 or jsonb_typeof(p_values->'last4') is distinct from 'string' or jsonb_typeof(p_values->'active') is distinct from 'boolean' then raise check_violation; end if;
 if p_id is null then
  if p_version<>0 then raise serialization_failure; end if;
  insert into public.expense_payment_card(employee_id,issuer,nickname,last4,active)
  values(self,trim(p_values->>'issuer'),trim(p_values->>'nickname'),p_values->>'last4',(p_values->>'active')::boolean) returning id into target;
 else
  select * into old from public.expense_payment_card where id=p_id for update;
  if old.id is null or old.employee_id<>self then raise insufficient_privilege; end if;
  if old.version<>p_version then raise serialization_failure; end if;
  update public.expense_payment_card set issuer=trim(p_values->>'issuer'),nickname=trim(p_values->>'nickname'),last4=p_values->>'last4',active=(p_values->>'active')::boolean,version=version+1,updated_at=now() where id=p_id;
  target:=p_id;
 end if;
 insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),case when p_id is null then 'REGISTER' when not (p_values->>'active')::boolean then 'DEACTIVATE' else 'UPDATE' end,'expense_payment_card',target);
 return target;
end; $$;
revoke all on function public.save_expense_payment_card(uuid,int,jsonb) from public,anon;
grant execute on function public.save_expense_payment_card(uuid,int,jsonb) to authenticated;

create or replace function public.save_expense_items(p_claim uuid,p_items jsonb,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare c public.expense_claim; v jsonb; a jsonb; target uuid; expected int; amount_value bigint; type_value text; allocation bigint; month_age int; card public.expense_payment_card; card_id uuid; card_label text;
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
  if target is null or expected is null or expected<0 or exists(select 1 from jsonb_object_keys(v) k where k not in ('id','version','usage_date','expense_type','merchant','description','account_category','amount','evidence_type','payment_method','payment_card_id','project_id','trip_context','notes','attachment_id','attendees','vehicle','legacy_summary','import_filename','import_origin')) then raise check_violation; end if;
  if jsonb_typeof(v->'amount') is distinct from 'number' or jsonb_typeof(v->'version') is distinct from 'number' or jsonb_typeof(v->'attendees') is distinct from 'array' then raise check_violation; end if;
  if exists(select 1 from jsonb_array_elements(v->'attendees') entry where jsonb_typeof(entry) is distinct from 'object' or jsonb_typeof(entry->'allocated_amount') is distinct from 'number' or exists(select 1 from jsonb_object_keys(entry) k where k not in ('employee_id','allocated_amount'))) then raise check_violation; end if;
  if v->'vehicle' is not null and v->'vehicle'<>'null'::jsonb then
   if jsonb_typeof(v->'vehicle') is distinct from 'object' or exists(select 1 from jsonb_object_keys(v->'vehicle') k where k not in ('project_or_trip_name','origin','destination','one_way_amount','trip_count')) or jsonb_typeof(v->'vehicle'->'one_way_amount') is distinct from 'number' or jsonb_typeof(v->'vehicle'->'trip_count') is distinct from 'number' then raise check_violation; end if;
  end if;
  if not exists(select 1 from public.expense_account_category where name=v->>'account_category') then raise check_violation using message='ACCOUNT_CATEGORY'; end if;
  if (v->>'usage_date')::date<c.usage_month or (v->>'usage_date')::date>=(c.usage_month+interval '1 month')::date or (v->>'usage_date')::date>public.expense_today() then raise check_violation; end if;
  if nullif(v->>'attachment_id','') is not null and not exists(select 1 from public.expense_attachment where id=nullif(v->>'attachment_id','')::uuid and claim_id=p_claim and ready) then raise insufficient_privilege; end if;
  if nullif(v->>'project_id','') is not null and not exists(select 1 from public.project_assignment where project_id=(v->>'project_id')::uuid and employee_id=c.employee_id) then raise insufficient_privilege; end if;
  card_id:=nullif(v->>'payment_card_id','')::uuid; card_label:=null;
  -- Compatibility writer omits the new field: retain its existing card, unless cash is selected.
  if not (v ? 'payment_card_id') and v->>'payment_method'='PERSONAL_CARD' then
   select payment_card_id into card_id from public.expense_item where id=target and claim_id=p_claim;
  end if;
  if card_id is not null then
   -- Row lock serializes deactivation/edit with expense saves; never trust a client label.
   select * into card from public.expense_payment_card where id=card_id for share;
   if card.id is null or card.employee_id<>c.employee_id or not card.active or v->>'payment_method' is distinct from 'PERSONAL_CARD' then
    raise insufficient_privilege using message='PAYMENT_CARD_UNAVAILABLE';
   end if;
   select payment_card_label into card_label from public.expense_item where id=target and claim_id=p_claim and payment_card_id=card_id;
   card_label:=coalesce(card_label,card.issuer||' · '||card.nickname||' · '||card.last4);
  end if;
  amount_value:=(v->>'amount')::bigint;
  if type_value in ('FUEL','TOLL') and not coalesce((v->>'legacy_summary')::boolean,false) then amount_value:=(v->'vehicle'->>'one_way_amount')::bigint*(v->'vehicle'->>'trip_count')::int; end if;
  if coalesce((v->>'legacy_summary')::boolean,false) and (coalesce(v->>'import_origin','') not like '지출결의서!%' or nullif(v->>'import_filename','') is null) then raise check_violation; end if;
  if expected=0 then
   insert into public.expense_item(id,claim_id,usage_date,expense_type,merchant,description,account_category,amount,evidence_type,payment_method,payment_card_id,payment_card_label,project_id,trip_context,notes,attachment_id,legacy_summary,import_filename,import_origin,imported_at)
   values(target,p_claim,(v->>'usage_date')::date,type_value,v->>'merchant',v->>'description',v->>'account_category',amount_value,v->>'evidence_type',v->>'payment_method',card_id,card_label,nullif(v->>'project_id','')::uuid,coalesce(v->>'trip_context',''),coalesce(v->>'notes',''),nullif(v->>'attachment_id','')::uuid,coalesce((v->>'legacy_summary')::boolean,false),v->>'import_filename',v->>'import_origin',case when v->>'import_filename' is not null then now() end);
  else
   update public.expense_item set usage_date=(v->>'usage_date')::date,expense_type=type_value,merchant=v->>'merchant',description=v->>'description',account_category=v->>'account_category',amount=amount_value,evidence_type=v->>'evidence_type',payment_method=v->>'payment_method',payment_card_id=card_id,payment_card_label=card_label,project_id=nullif(v->>'project_id','')::uuid,trip_context=coalesce(v->>'trip_context',''),notes=coalesce(v->>'notes',''),attachment_id=nullif(v->>'attachment_id','')::uuid,legacy_summary=coalesce((v->>'legacy_summary')::boolean,false),version=version+1,updated_at=now() where id=target and claim_id=p_claim and version=expected;
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
commit;
