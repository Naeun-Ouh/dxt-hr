begin;
-- Issue #23: optional evidence while drafting, still mandatory on submission.
alter table public.expense_item alter column attachment_id drop not null;
create table public.expense_account_category(name text primary key, position int not null);
insert into public.expense_account_category values
 ('복리후생비',1),('차량유지비',2),('여비교통비',3),('지급수수료',4),('운반비',5),('소모품비',6),('통신비',7),('카드접대비',8),('교육훈련비',9),('도서인쇄비',10),('보험료',11),('세금과공과',12),('수도광열비',13),('임차료',14),('비품',15),('기타',16);
-- 기타 is the existing OTHER mapping, not a new accounting classification.
alter table public.expense_account_category enable row level security;
revoke all on public.expense_account_category from public,anon,authenticated;
grant select on public.expense_account_category to authenticated;
create policy expense_account_read on public.expense_account_category for select to authenticated using(public.current_employee_id() is not null);
create or replace function public.expense_editable(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select employee_id=public.current_employee_id() and status='DRAFT' and locked_at is null
 and (payment_date is null or public.expense_today()<=payment_date) from public.expense_claim where id=p_id),false);
$$;
create or replace function public.save_expense_items(p_claim uuid,p_items jsonb,p_reason text) returns void language plpgsql security definer set search_path='' as $$
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
  if target is null or expected is null or expected<0 or exists(select 1 from jsonb_object_keys(v) k where k not in ('id','version','usage_date','expense_type','merchant','description','account_category','amount','evidence_type','payment_method','project_id','trip_context','notes','attachment_id','attendees','vehicle','legacy_summary','import_filename','import_origin')) then raise check_violation; end if;
  if jsonb_typeof(v->'amount') is distinct from 'number' or jsonb_typeof(v->'version') is distinct from 'number' or jsonb_typeof(v->'attendees') is distinct from 'array' then raise check_violation; end if;
  if exists(select 1 from jsonb_array_elements(v->'attendees') entry where jsonb_typeof(entry) is distinct from 'object' or jsonb_typeof(entry->'allocated_amount') is distinct from 'number' or exists(select 1 from jsonb_object_keys(entry) k where k not in ('employee_id','allocated_amount'))) then raise check_violation; end if;
  if v->'vehicle' is not null and v->'vehicle'<>'null'::jsonb then
   if jsonb_typeof(v->'vehicle') is distinct from 'object' or exists(select 1 from jsonb_object_keys(v->'vehicle') k where k not in ('project_or_trip_name','origin','destination','one_way_amount','trip_count')) or jsonb_typeof(v->'vehicle'->'one_way_amount') is distinct from 'number' or jsonb_typeof(v->'vehicle'->'trip_count') is distinct from 'number' then raise check_violation; end if;
  end if;
  if not exists(select 1 from public.expense_account_category where name=v->>'account_category') then raise check_violation using message='ACCOUNT_CATEGORY'; end if;
  if (v->>'usage_date')::date<c.usage_month or (v->>'usage_date')::date>=(c.usage_month+interval '1 month')::date or (v->>'usage_date')::date>public.expense_today() then raise check_violation; end if;
  if nullif(v->>'attachment_id','') is not null and not exists(select 1 from public.expense_attachment where id=nullif(v->>'attachment_id','')::uuid and claim_id=p_claim and ready) then raise insufficient_privilege; end if;
  if nullif(v->>'project_id','') is not null and not exists(select 1 from public.project_assignment where project_id=(v->>'project_id')::uuid and employee_id=c.employee_id) then raise insufficient_privilege; end if;
  amount_value:=(v->>'amount')::bigint;
  if type_value in ('FUEL','TOLL') and not coalesce((v->>'legacy_summary')::boolean,false) then amount_value:=(v->'vehicle'->>'one_way_amount')::bigint*(v->'vehicle'->>'trip_count')::int; end if;
  if coalesce((v->>'legacy_summary')::boolean,false) and (coalesce(v->>'import_origin','') not like '지출결의서!%' or nullif(v->>'import_filename','') is null) then raise check_violation; end if;
  if expected=0 then
   insert into public.expense_item(id,claim_id,usage_date,expense_type,merchant,description,account_category,amount,evidence_type,payment_method,project_id,trip_context,notes,attachment_id,legacy_summary,import_filename,import_origin,imported_at)
   values(target,p_claim,(v->>'usage_date')::date,type_value,v->>'merchant',v->>'description',v->>'account_category',amount_value,v->>'evidence_type',v->>'payment_method',nullif(v->>'project_id','')::uuid,coalesce(v->>'trip_context',''),coalesce(v->>'notes',''),nullif(v->>'attachment_id','')::uuid,coalesce((v->>'legacy_summary')::boolean,false),v->>'import_filename',v->>'import_origin',case when v->>'import_filename' is not null then now() end);
  else
   update public.expense_item set usage_date=(v->>'usage_date')::date,expense_type=type_value,merchant=v->>'merchant',description=v->>'description',account_category=v->>'account_category',amount=amount_value,evidence_type=v->>'evidence_type',payment_method=v->>'payment_method',project_id=nullif(v->>'project_id','')::uuid,trip_context=coalesce(v->>'trip_context',''),notes=coalesce(v->>'notes',''),attachment_id=nullif(v->>'attachment_id','')::uuid,legacy_summary=coalesce((v->>'legacy_summary')::boolean,false),version=version+1,updated_at=now() where id=target and claim_id=p_claim and version=expected;
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
create or replace function public.submit_expense_claim(p_claim uuid,p_version int,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare c public.expense_claim; pay date;
begin
 select * into c from public.expense_claim where id=p_claim for update;
 if not public.expense_editable(p_claim) then raise insufficient_privilege; end if;
 if p_version is null or c.version<>p_version then raise serialization_failure; end if;
 if not exists(select 1 from public.expense_item where claim_id=p_claim) or p_reason is null then raise check_violation; end if;
 if c.usage_month<=date_trunc('month',public.expense_today()-interval '2 months')::date and length(trim(p_reason))=0 then raise check_violation using message='RETRO_REASON'; end if;
 if exists(select 1 from public.expense_item i left join public.expense_attachment a on a.id=i.attachment_id and a.claim_id=p_claim and a.ready where i.claim_id=p_claim and a.id is null) then raise check_violation using message='EVIDENCE_REQUIRED'; end if;
 -- Retroactive submissions enter the next available payment cycle, not an already closed period.
 pay:=greatest((c.usage_month+interval '1 month 14 days')::date,(date_trunc('month',public.expense_today())+interval '14 days')::date);
 if pay<public.expense_today() then pay:=(pay+interval '1 month')::date; end if;
 update public.expense_claim set status='SUBMITTED',submitted_at=coalesce(submitted_at,now()),payment_date=coalesce(payment_date,pay),late_reason=p_reason,version=version+1,updated_at=now() where id=p_claim;
 insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),'SUBMIT','expense_claim',p_claim);
end; $$;

-- Full working-copy replacement guarded by the claim version and each item version.
-- The shared dining lock is acquired before the claim lock, as in legacy writers.
create function public.save_expense_grid(p_claim uuid,p_month date,p_version int,p_items jsonb,p_deleted jsonb,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid; c public.expense_claim; v jsonb; existing public.expense_item;
begin
 if public.current_employee_id() is null then raise insufficient_privilege; end if;
 if p_version is null or p_version<0 or p_reason is null or length(p_reason)>2000 or jsonb_typeof(p_items) is distinct from 'array' or jsonb_typeof(p_deleted) is distinct from 'array' then raise check_violation; end if;
 if jsonb_array_length(p_items)>500 or jsonb_array_length(p_deleted)>500 then raise check_violation; end if;
 perform pg_advisory_xact_lock(510005);
 if p_claim is null then
  if p_version<>0 then raise serialization_failure; end if;
  -- An existing month is a conflict, never an implicit overwrite after a lost response.
  if exists(select 1 from public.expense_claim where employee_id=public.current_employee_id() and usage_month=p_month) then raise serialization_failure; end if;
  target:=public.ensure_expense_claim(p_month);
 else target:=p_claim; end if;
 select * into c from public.expense_claim where id=target for update;
 if not public.expense_editable(target) then raise insufficient_privilege; end if;
 if c.usage_month<=date_trunc('month',public.expense_today()-interval '2 months')::date and length(trim(p_reason))=0 then raise check_violation using message='RETRO_REASON'; end if;
 if p_month is null or c.usage_month<>p_month or (p_claim is not null and c.version<>p_version) then raise serialization_failure; end if;
 if (select count(*) from (select value->>'id' id from jsonb_array_elements(p_items) union all select value->>'id' from jsonb_array_elements(p_deleted)) t) <>
    (select count(distinct id) from (select value->>'id' id from jsonb_array_elements(p_items) union all select value->>'id' from jsonb_array_elements(p_deleted)) t) then raise check_violation; end if;
 for v in select value from jsonb_array_elements(p_items) union all select value from jsonb_array_elements(p_deleted) loop
  if jsonb_typeof(v) is distinct from 'object' or v->>'id' is null or v->>'version' is null then raise check_violation; end if;
  select * into existing from public.expense_item where id=(v->>'id')::uuid;
  if coalesce((v->>'legacy_summary')::boolean,false) and (existing.id is null or not existing.legacy_summary or existing.amount is distinct from (v->>'amount')::int or existing.expense_type is distinct from v->>'expense_type') then raise check_violation using message='VEHICLE_DETAIL_REQUIRED'; end if;
  if existing.id is not null then
   if existing.claim_id<>target then raise insufficient_privilege; end if;
   if existing.version<>(v->>'version')::int then raise serialization_failure; end if;
  elsif (v->>'version')::int<>0 then raise serialization_failure; end if;
 end loop;
 -- No silent deletion by omission or partial snapshot saves.
 if exists(select 1 from public.expense_item i where claim_id=target and not exists(select 1 from jsonb_array_elements(p_items) elem where (elem->>'id')::uuid=i.id) and not exists(select 1 from jsonb_array_elements(p_deleted) elem where (elem->>'id')::uuid=i.id)) then raise serialization_failure; end if;
 for v in select value from jsonb_array_elements(p_deleted) loop
  if (v->>'version')::int<1 or exists(select 1 from jsonb_object_keys(v) k where k not in ('id','version')) then raise check_violation; end if;
  delete from public.expense_item where id=(v->>'id')::uuid and claim_id=target;
  if not found then raise serialization_failure; end if;
 end loop;
 -- Release all this snapshot's old allocations first: redistribution is order independent.
 delete from public.expense_attendee where item_id in (select id from public.expense_item where claim_id=target);
 if jsonb_array_length(p_items)>0 then
  perform public.save_expense_items(target,p_items,p_reason);
 else
  update public.expense_claim set late_reason=p_reason,version=version+1,updated_at=now() where id=target;
 end if;
 insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),'SAVE_GRID','expense_claim',target);
 return target;
end; $$;
revoke all on function public.save_expense_grid(uuid,date,int,jsonb,jsonb,text) from public,anon;
grant execute on function public.save_expense_grid(uuid,date,int,jsonb,jsonb,text) to authenticated;
commit;
