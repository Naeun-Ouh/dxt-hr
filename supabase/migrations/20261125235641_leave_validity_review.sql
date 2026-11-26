begin;
-- Fail closed against unexpected deployed ledger shape; no monetary reconciliation is invented.
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.leave_ledger'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (request_id, event_type, source_id)')
 or not exists(select 1 from pg_constraint where conrelid='public.leave_ledger'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (reversal_of)')
 or not exists(select 1 from pg_constraint where conrelid='public.leave_ledger'::regclass and contype='f' and confrelid='public.leave_source'::regclass)
 or exists(select 1 from public.leave_ledger l left join public.leave_source s on s.id=l.source_id where s.id is null or (l.employee_id,l.year,l.bucket) is distinct from (s.employee_id,s.year,s.bucket))
 or exists(select 1 from public.leave_ledger r left join public.leave_ledger d on d.id=r.reversal_of where r.event_type='REVERSAL' and (d.id is null or d.event_type<>'DEDUCTION' or (r.source_id,r.request_id,r.amount_delta) is distinct from (d.source_id,d.request_id,-d.amount_delta)))
 then raise exception 'LEAVE_MIGRATION_PREFLIGHT_FAILED';end if;
end $$;
-- Absence means unverified historical validity, including old indefinite carryover.
-- Confirmation adds evidence; original source and every monetary row remain immutable.
create table public.leave_source_validity(
 source_id uuid primary key references public.leave_source(id), receiving_year int not null check(receiving_year between 1900 and 9999),
 valid_from date not null,valid_until date not null,reason text not null check(length(trim(reason)) between 1 and 2000),
 confirmed_by uuid references auth.users(id),confirmed_at timestamptz not null default now(),
 check(valid_from<=valid_until and valid_from>=make_date(receiving_year,1,1) and valid_until<=make_date(receiving_year,12,31))
);
alter table public.leave_source_validity enable row level security;
revoke all on public.leave_source_validity from public,anon,authenticated;
grant select on public.leave_source_validity to authenticated;
create policy leave_validity_read on public.leave_source_validity for select to authenticated using(exists(select 1 from public.leave_source s where s.id=source_id and (s.employee_id=public.current_employee_id() or public.has_app_capability('LEAVE_MANAGE'))));
create trigger leave_validity_immutable before update or delete on public.leave_source_validity for each row execute function public.leave_immutable_row();
create function public.record_new_leave_validity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if NEW.valid_until is distinct from make_date(NEW.year,12,31) or NEW.valid_from<>make_date(NEW.year,1,1) or NEW.legacy then raise exception 'BOUNDED_LEAVE_VALIDITY_REQUIRED' using errcode='23514';end if;
 insert into public.leave_source_validity(source_id,receiving_year,valid_from,valid_until,reason,confirmed_by) values(NEW.id,NEW.year,NEW.valid_from,NEW.valid_until,NEW.note,NEW.created_by);
 return NEW;
end $$;
create trigger record_new_leave_validity after insert on public.leave_source for each row execute function public.record_new_leave_validity();
create function public.confirm_leave_validity(p_source uuid,p_year int,p_from date,p_until date,p_reason text,p_version int) returns void language plpgsql security definer set search_path='' as $$
declare s public.leave_source; v int;
begin
 if not public.has_app_capability('LEAVE_MANAGE') then raise exception 'Denied' using errcode='42501';end if;
 select * into s from public.leave_source where id=p_source;if s.id is null then raise exception 'Denied' using errcode='42501';end if;
 perform 1 from public.employee where id=s.employee_id for update;
 select version into v from public.leave_account where employee_id=s.employee_id and year=s.year and bucket='ANNUAL';
 if coalesce(v,0) is distinct from p_version then raise exception 'STALE_LEAVE' using errcode='40001';end if;
 if p_year is null or p_year not between 1900 and 9999 or p_from is null or p_until is null or p_from>p_until or p_from<make_date(p_year,1,1) or p_until>make_date(p_year,12,31)
 or (s.bucket<>'CARRYOVER' and p_year<>s.year) or (s.bucket='CARRYOVER' and (p_year not in(s.year,s.year+1) or p_until<>make_date(p_year,12,31)))
 or nullif(trim(p_reason),'') is null then raise exception 'INVALID_VALIDITY' using errcode='23514';end if;
 if exists(select 1 from public.leave_source_validity where source_id=p_source) then raise exception 'VALIDITY_ALREADY_CONFIRMED' using errcode='23514';end if;
 insert into public.leave_source_validity(source_id,receiving_year,valid_from,valid_until,reason,confirmed_by) values(p_source,p_year,p_from,p_until,trim(p_reason),auth.uid());
 update public.leave_account set version=version+1 where employee_id=s.employee_id and year=s.year;
end $$;
create function public.leave_check_period(p_employee uuid,p_start date,p_end date,p_kind text) returns void language plpgsql stable security definer set search_path='' as $$
begin
 if exists(select 1 from public.leave_source s join public.leave_source_validity v on v.source_id=s.id
 where s.employee_id=p_employee and public.leave_source_balance(s.id)>0
 and case when p_kind='BIRTHDAY' then s.bucket='BIRTHDAY' else s.bucket<>'BIRTHDAY' end
 and exists(select 1 from unnest(public.leave_work_dates(p_start,p_end)) d where d between v.valid_from and v.valid_until)
 and exists(select 1 from unnest(public.leave_work_dates(p_start,p_end)) d where d not between v.valid_from and v.valid_until))
 then raise exception 'LEAVE_PERIOD_SPLIT_REQUIRED' using errcode='23514';end if;
end $$;
create or replace function public.leave_available(p_employee uuid,p_start date,p_end date,p_kind text) returns numeric language plpgsql stable security definer set search_path='' as $$
begin
 perform public.leave_check_period(p_employee,p_start,p_end,p_kind);
 return (select coalesce(sum(public.leave_source_balance(s.id)),0) from public.leave_source s join public.leave_source_validity v on v.source_id=s.id where s.employee_id=p_employee
 and v.valid_from<=(select min(d) from unnest(public.leave_work_dates(p_start,p_end)) d) and v.valid_until>=(select max(d) from unnest(public.leave_work_dates(p_start,p_end)) d)
 and case when p_kind='BIRTHDAY' then s.bucket='BIRTHDAY' and s.year=extract(year from p_start) else s.bucket<>'BIRTHDAY' end);
end $$;
create or replace function public.allocate_leave(p_request uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.leave_request; s public.leave_source; remaining numeric; taken numeric;
begin
 select * into strict r from public.leave_request where id=p_request;
 perform public.leave_check_period(r.employee_id,r.start_date,r.end_date,r.kind);
 remaining:=r.days;
 for s in select src.* from public.leave_source src join public.leave_source_validity v on v.source_id=src.id where src.employee_id=r.employee_id and v.valid_from<=(select min(d) from unnest(public.leave_work_dates(r.start_date,r.end_date)) d) and v.valid_until>=(select max(d) from unnest(public.leave_work_dates(r.start_date,r.end_date)) d)
 and case when r.kind='BIRTHDAY' then bucket='BIRTHDAY' and year=r.benefit_year else bucket<>'BIRTHDAY' end
 order by case src.bucket when 'SUBSTITUTE' then 1 when 'CARRYOVER' then 2 when 'ANNUAL' then 3 else 4 end,v.valid_until,src.year,src.created_at,src.id loop
  taken:=least(remaining,public.leave_source_balance(s.id));
  if taken>0 then
   insert into public.leave_ledger(employee_id,year,bucket,source_id,amount_delta,event_type,request_id,actor_id)
   values(r.employee_id,s.year,s.bucket,s.id,-taken,'DEDUCTION',r.id,auth.uid());
   remaining:=remaining-taken;
  end if;
  exit when remaining=0;
 end loop;
 if remaining<>0 then raise exception 'INSUFFICIENT_BALANCE' using errcode='23514';end if;
end $$;
create or replace function public.grant_leave_source(p_id uuid,p_employee uuid,p_year int,p_bucket text,p_days numeric,p_reason text,p_version int) returns uuid language plpgsql security definer set search_path='' as $$
declare v int; old public.leave_source;
begin
 if not public.has_app_capability('LEAVE_MANAGE') then raise exception 'Denied' using errcode='42501';end if;
 if p_bucket is null or p_bucket not in ('ANNUAL','SUBSTITUTE','CARRYOVER') or p_year is null or p_year not between 1900 and 9999 or p_days is null or p_days<=0 or p_days>366 or p_days*2<>trunc(p_days*2) or nullif(trim(p_reason),'') is null or length(p_reason)>2000 then raise exception 'INVALID_ADJUSTMENT' using errcode='23514';end if;
 perform 1 from public.employee where id=p_employee for update;if not found then raise exception 'Denied' using errcode='42501';end if;
 select * into old from public.leave_source where id=p_id;
 if old.id is not null then
  if old.employee_id=p_employee and old.year=p_year and old.bucket=p_bucket and old.note=trim(p_reason) and exists(select 1 from public.leave_ledger where source_id=p_id and event_type='ADJUSTMENT' and amount_delta=p_days) then return p_id;end if;
  raise exception 'SOURCE_REPLAY_MISMATCH' using errcode='23514';
 end if;
 insert into public.leave_account(employee_id,year,bucket) values(p_employee,p_year,'ANNUAL'),(p_employee,p_year,p_bucket) on conflict do nothing;
 select version into v from public.leave_account where employee_id=p_employee and year=p_year and bucket='ANNUAL';
 if v is distinct from p_version then raise exception 'STALE_LEAVE' using errcode='40001';end if;
 insert into public.leave_source(id,employee_id,year,bucket,valid_from,valid_until,note,created_by)
 values(p_id,p_employee,p_year,p_bucket,make_date(p_year,1,1),make_date(p_year,12,31),trim(p_reason),auth.uid());
 insert into public.leave_ledger(employee_id,year,bucket,source_id,amount_delta,event_type,actor_id,note) values(p_employee,p_year,p_bucket,p_id,p_days,'ADJUSTMENT',auth.uid(),trim(p_reason));
 update public.leave_account set version=version+1 where employee_id=p_employee and year=p_year;
 return p_id;
end $$;

create or replace function public.leave_sources(p_employee uuid,p_year int) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_app_capability('EMPLOYEE_ACCESS') or not coalesce(p_employee=public.current_employee_id() or public.has_app_capability('LEAVE_MANAGE'),false) then raise exception 'Denied' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'year',s.year,'bucket',s.bucket,'valid_from',v.valid_from,'valid_until',v.valid_until,'validity_confirmed',v.source_id is not null,'receiving_year',v.receiving_year,'note',s.note,'balance',public.leave_source_balance(s.id),'usable_balance',case when public.leave_today() between v.valid_from and v.valid_until then public.leave_source_balance(s.id) else 0 end,'version',coalesce(a.version,0)) order by s.year,s.created_at,s.id)
 from public.leave_source s left join public.leave_source_validity v on v.source_id=s.id left join public.leave_account a on a.employee_id=s.employee_id and a.year=s.year and a.bucket='ANNUAL'
 where s.employee_id=p_employee and (s.year=p_year or v.receiving_year=p_year)),'[]'::jsonb);
end $$;
create or replace function public.leave_summary(p_employee uuid,p_year int) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb; result jsonb;
begin
 rows:=public.leave_sources(p_employee,p_year);
 select jsonb_build_object('employee_id',p_employee,'year',p_year,'as_of',public.leave_today(),'version',coalesce((select version from public.leave_account where employee_id=p_employee and year=p_year and bucket='ANNUAL'),0),
 'balance',coalesce(sum((s->>'usable_balance')::numeric) filter(where s->>'bucket'<>'BIRTHDAY'),0),
 'historical_balance',coalesce(sum((s->>'balance')::numeric) filter(where s->>'bucket'<>'BIRTHDAY'),0),
 'buckets',jsonb_build_object('SUBSTITUTE',coalesce(sum((s->>'usable_balance')::numeric) filter(where s->>'bucket'='SUBSTITUTE'),0),'CARRYOVER',coalesce(sum((s->>'usable_balance')::numeric) filter(where s->>'bucket'='CARRYOVER'),0),'ANNUAL',coalesce(sum((s->>'usable_balance')::numeric) filter(where s->>'bucket'='ANNUAL'),0),'BIRTHDAY',coalesce(sum((s->>'usable_balance')::numeric) filter(where s->>'bucket'='BIRTHDAY'),0)),
 'adjusted',coalesce((select sum(l.amount_delta) from public.leave_ledger l where l.employee_id=p_employee and l.year=p_year and l.bucket<>'BIRTHDAY' and l.event_type='ADJUSTMENT'),0),
 'used',-coalesce((select sum(l.amount_delta) from public.leave_ledger l join public.leave_request r on r.id=l.request_id where l.employee_id=p_employee and extract(year from r.start_date)=p_year and l.bucket<>'BIRTHDAY' and l.event_type in ('DEDUCTION','REVERSAL')),0)) into result from jsonb_array_elements(rows) s;
 return result;
end $$;
alter table public.leave_request add column birthday_project_id uuid references public.project(id),add column birthday_exception boolean not null default false;
create function public.birthday_outside_window(p_employee uuid,p_day date) returns boolean language sql stable security definer set search_path='' as $$
 select abs(p_day-make_date(extract(year from p_day)::int,b.month,b.day))>7 from public.birthday_calendar b where b.employee_id=p_employee;
$$;
create function public.submit_leave_kind_v2(p_id uuid,p_start date,p_end date,p_unit text,p_reason text,p_past_reason text,p_kind text,p_exception text,p_project uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=public.current_employee_id(); n numeric; y int; bal numeric; auto_approve boolean; exception_needed boolean:=false;
begin
 if not public.has_app_capability('EMPLOYEE_ACCESS') or owner_id is null then raise exception 'Denied' using errcode='42501';end if;
 perform 1 from public.employee where id=owner_id and employment_status='ACTIVE' and hire_date<=p_start for update;
 if not found then raise exception 'INVALID_EMPLOYEE_DATE' using errcode='23514';end if;
 if p_kind is null or p_kind not in ('ANNUAL','BIRTHDAY') or length(coalesce(p_exception,''))>2000 then raise exception 'INVALID_KIND' using errcode='23514';end if;
 n:=public.leave_days(p_start,p_end,p_unit);y:=extract(year from p_start);
 if p_start<public.leave_today() and nullif(trim(p_past_reason),'') is null then raise exception 'PAST_REASON_REQUIRED' using errcode='23514';end if;
 if exists(select 1 from public.leave_request where employee_id=owner_id and status in ('PENDING','APPROVED') and start_date<=p_end and end_date>=p_start and (unit='FULL_DAY' or p_unit='FULL_DAY' or unit=p_unit)) then raise exception 'OVERLAPPING_LEAVE' using errcode='23514';end if;
 insert into public.leave_account(employee_id,year) values(owner_id,y) on conflict do nothing;
 if p_kind='BIRTHDAY' then
  perform public.prepare_birthday_source(owner_id,p_start,p_unit,p_exception);
  exception_needed:=public.birthday_outside_window(owner_id,p_start);
  if exception_needed and (p_project is null or not exists(select 1 from public.project_assignment a join public.birthday_calendar b on b.employee_id=a.employee_id
   where a.employee_id=owner_id and a.project_id=p_project and a.start_date<=make_date(y,b.month,b.day)+7 and a.end_date>=make_date(y,b.month,b.day)-7)) then raise exception 'BIRTHDAY_PROJECT_REQUIRED' using errcode='23514';end if;
 end if;
 bal:=public.leave_available(owner_id,p_start,p_end,p_kind);
 if bal<n then raise exception 'INSUFFICIENT_BALANCE' using errcode='23514';end if;
 select exists(select 1 from public.app_memberships where user_id=auth.uid() and status='ACTIVE' and roles @> array['TEAM_LEADER']::text[]) into auto_approve;
 auto_approve:=auto_approve and not exception_needed;
 insert into public.leave_request(id,employee_id,start_date,end_date,unit,days,reason,past_reason,status,decided_by,decided_at,kind,benefit_year,exception_reason,birthday_project_id,birthday_exception)
 values(p_id,owner_id,p_start,p_end,p_unit,n,coalesce(p_reason,''),coalesce(p_past_reason,''),case when auto_approve then 'APPROVED' else 'PENDING' end,case when auto_approve then auth.uid() end,case when auto_approve then now() end,p_kind,case when p_kind='BIRTHDAY' then y end,coalesce(trim(p_exception),''),case when exception_needed then p_project end,exception_needed);
 insert into public.leave_history(request_id,action,actor_id) values(p_id,'SUBMITTED',auth.uid());
 if auto_approve then
  perform public.allocate_leave(p_id);
  update public.leave_account set version=version+1 where employee_id=owner_id and (year=y or year in(select year from public.leave_ledger where request_id=p_id));
  insert into public.leave_history(request_id,action,actor_id) values(p_id,'AUTO_APPROVED',auth.uid());
 end if;
 return p_id;
end $$;

create or replace function public.submit_leave_kind(p_id uuid,p_start date,p_end date,p_unit text,p_reason text,p_past_reason text,p_kind text,p_exception text) returns uuid language sql security definer set search_path='' as $$
 select public.submit_leave_kind_v2(p_id,p_start,p_end,p_unit,p_reason,p_past_reason,p_kind,p_exception,null);
$$;
create function public.submit_leave_benefit_v2(p_id uuid,p_start date,p_end date,p_unit text,p_reason text,p_past_reason text,p_calendar_version int,p_kind text,p_exception text,p_project uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v int;
begin
 if not public.has_app_capability('EMPLOYEE_ACCESS') then raise exception 'Denied' using errcode='42501';end if;
 select version into v from public.holiday_year where year=extract(year from p_start) for share;
 if v is null then raise exception 'HOLIDAY_YEAR_UNVERIFIED' using errcode='23514';end if;
 if v is distinct from p_calendar_version then raise exception 'STALE_CALENDAR' using errcode='40001';end if;
 return public.submit_leave_kind_v2(p_id,p_start,p_end,p_unit,p_reason,p_past_reason,p_kind,p_exception,p_project);
end $$;
create or replace function public.review_leave(p_items jsonb,p_action text,p_note text default '') returns void language plpgsql security definer set search_path='' as $$
declare item jsonb; r public.leave_request; bal numeric; y int;
begin
 if not public.has_app_capability('TEAM_LEAVE_APPROVE') then raise exception 'Denied' using errcode='42501';end if;
 if p_action is null or p_action not in ('APPROVED','REJECTED','CANCELLED') or p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'INVALID_ACTION' using errcode='23514';end if;
 if jsonb_array_length(p_items) not between 1 and 100 or length(coalesce(p_note,''))>2000 or
 (select count(distinct (i->>'id')::uuid) from jsonb_array_elements(p_items) i)<>jsonb_array_length(p_items) then raise exception 'INVALID_SELECTION' using errcode='23514';end if;
 perform 1 from public.holiday_year order by year for share;
 -- All balance writers lock employee rows first, in the same order, then requests.
 perform 1 from public.employee e where e.id in (select employee_id from public.leave_request where id in (select (i->>'id')::uuid from jsonb_array_elements(p_items) i)) order by e.id for update;
 for item in select value from jsonb_array_elements(p_items) order by value->>'id' loop
  select * into r from public.leave_request where id=(item->>'id')::uuid for update;
  if r.id is null or not public.leave_reviewer(r.employee_id) then raise exception 'Denied' using errcode='42501';end if;
  if (item->>'version')::int is distinct from r.version then raise exception 'STALE_LEAVE' using errcode='40001';end if;
  if (p_action='CANCELLED' and r.status<>'APPROVED') or (p_action<>'CANCELLED' and r.status<>'PENDING') then raise exception 'INVALID_STATE' using errcode='23514';end if;
  y:=extract(year from r.start_date);
  if p_action='APPROVED' then
   if r.kind='BIRTHDAY' and public.birthday_outside_window(r.employee_id,r.start_date) and (not r.birthday_exception or r.birthday_project_id is null) then raise exception 'BIRTHDAY_PROJECT_REQUIRED' using errcode='23514';end if;
   if r.birthday_exception and r.employee_id=public.current_employee_id() then raise exception 'BIRTHDAY_EXCEPTION_SELF_REVIEW_DENIED' using errcode='42501';end if;
   if r.work_dates is not null and r.work_dates is distinct from public.leave_work_dates(r.start_date,r.end_date) then raise exception 'LEAVE_CALENDAR_CHANGED' using errcode='23514';end if;
   if r.work_dates is null and public.leave_days(r.start_date,r.end_date,r.unit)<>r.days then raise exception 'LEAVE_CALENDAR_CHANGED' using errcode='23514';end if;
   if not exists(select 1 from public.employee where id=r.employee_id and employment_status='ACTIVE') then raise exception 'INACTIVE_EMPLOYEE' using errcode='23514';end if;
   perform public.allocate_leave(r.id);
  elsif p_action='CANCELLED' then
   insert into public.leave_ledger(employee_id,year,bucket,source_id,amount_delta,event_type,request_id,actor_id,reversal_of)
    select employee_id,year,bucket,source_id,-amount_delta,'REVERSAL',request_id,auth.uid(),id from public.leave_ledger where request_id=r.id and event_type='DEDUCTION';
   if not found then raise exception 'MISSING_DEDUCTION';end if;
  end if;
  if p_action<>'REJECTED' then update public.leave_account set version=version+1 where employee_id=r.employee_id;end if;
  update public.leave_request set status=p_action,version=version+1,decided_by=auth.uid(),decided_at=now() where id=r.id;
  insert into public.leave_history(request_id,action,actor_id,note) values(r.id,p_action,auth.uid(),coalesce(p_note,''));
 end loop;
end $$;
revoke all on function public.record_new_leave_validity(),public.confirm_leave_validity(uuid,int,date,date,text,int),public.leave_check_period(uuid,date,date,text),public.birthday_outside_window(uuid,date),public.submit_leave_kind_v2(uuid,date,date,text,text,text,text,text,uuid),public.submit_leave_benefit_v2(uuid,date,date,text,text,text,int,text,text,uuid) from public,anon,authenticated;
grant execute on function public.confirm_leave_validity(uuid,int,date,date,text,int),public.submit_leave_benefit_v2(uuid,date,date,text,text,text,int,text,text,uuid) to authenticated;
commit;
