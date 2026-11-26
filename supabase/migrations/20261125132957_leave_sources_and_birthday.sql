begin;
alter table public.leave_account drop constraint leave_account_bucket_check;
alter table public.leave_account add check(bucket in ('ANNUAL','SUBSTITUTE','CARRYOVER','BIRTHDAY'));
create table public.leave_source(
 id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.employee(id),
 year int not null check(year between 1900 and 9999),bucket text not null check(bucket in ('ANNUAL','SUBSTITUTE','CARRYOVER','BIRTHDAY')),
 valid_from date not null,valid_until date,legacy boolean not null default false,
 note text not null check(length(trim(note)) between 1 and 2000),created_by uuid references auth.users(id),created_at timestamptz not null default now(),
 check(valid_until is null or valid_until>=valid_from),unique(id,employee_id,year,bucket)
);
create unique index leave_source_legacy on public.leave_source(employee_id,year,bucket) where legacy;
create unique index leave_source_birthday on public.leave_source(employee_id,year) where bucket='BIRTHDAY';
alter table public.leave_source enable row level security;
revoke all on public.leave_source from public,anon,authenticated;
grant select on public.leave_source to authenticated;
create policy leave_source_read on public.leave_source for select to authenticated using(public.has_app_capability('LEAVE_MANAGE') or employee_id=public.current_employee_id());
-- Historical amounts, IDs, actors and timestamps are preserved; only source metadata is linked.
insert into public.leave_source(employee_id,year,bucket,valid_from,valid_until,legacy,note)
 select employee_id,year,bucket,make_date(year,1,1),make_date(year,12,31),true,'기존 연차 원장 이관' from public.leave_account;
alter table public.leave_ledger add column source_id uuid,add column reversal_of uuid references public.leave_ledger(id);
update public.leave_ledger l set source_id=s.id from public.leave_source s where s.employee_id=l.employee_id and s.year=l.year and s.bucket=l.bucket and s.legacy;
update public.leave_ledger r set reversal_of=d.id from public.leave_ledger d where r.request_id=d.request_id and r.event_type='REVERSAL' and d.event_type='DEDUCTION';
alter table public.leave_ledger alter column source_id set not null;
alter table public.leave_ledger add foreign key(source_id,employee_id,year,bucket) references public.leave_source(id,employee_id,year,bucket);
alter table public.leave_ledger drop constraint leave_ledger_request_id_event_type_key;
alter table public.leave_ledger add unique(request_id,event_type,source_id),add unique(reversal_of);
alter table public.leave_ledger add check((event_type='REVERSAL')=(reversal_of is not null));
alter table public.leave_request add column kind text not null default 'ANNUAL' check(kind in ('ANNUAL','BIRTHDAY')),
 add column benefit_year int,add column exception_reason text not null default '' check(length(exception_reason)<=2000);
alter table public.leave_request add check((kind='ANNUAL' and benefit_year is null) or (kind='BIRTHDAY' and benefit_year=extract(year from start_date) and days=0.5 and unit<>'FULL_DAY'));
create unique index leave_birthday_once on public.leave_request(employee_id,benefit_year) where kind='BIRTHDAY' and status in ('PENDING','APPROVED');

create function public.leave_source_balance(p_source uuid) returns numeric language sql stable security definer set search_path='' as $$
 select coalesce(sum(amount_delta),0) from public.leave_ledger where source_id=p_source;
$$;
create function public.leave_available(p_employee uuid,p_start date,p_end date,p_kind text) returns numeric language sql stable security definer set search_path='' as $$
 select coalesce(sum(public.leave_source_balance(s.id)),0) from public.leave_source s where s.employee_id=p_employee
 and s.valid_from<=p_start and (s.valid_until is null or s.valid_until>=p_end)
 and case when p_kind='BIRTHDAY' then s.bucket='BIRTHDAY' and s.year=extract(year from p_start) else s.bucket<>'BIRTHDAY' end;
$$;
-- Internal allocator is called only while the employee row is locked by a checked writer.
create function public.allocate_leave(p_request uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.leave_request; s public.leave_source; remaining numeric; taken numeric;
begin
 select * into strict r from public.leave_request where id=p_request;
 remaining:=r.days;
 for s in select * from public.leave_source where employee_id=r.employee_id and valid_from<=r.start_date and (valid_until is null or valid_until>=r.end_date)
 and case when r.kind='BIRTHDAY' then bucket='BIRTHDAY' and year=r.benefit_year else bucket<>'BIRTHDAY' end
 order by case bucket when 'SUBSTITUTE' then 1 when 'CARRYOVER' then 2 when 'ANNUAL' then 3 else 4 end,valid_until nulls last,year,created_at,id loop
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

create or replace function public.leave_summary(p_employee uuid,p_year int) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.has_app_capability('EMPLOYEE_ACCESS') or not coalesce(p_employee=public.current_employee_id() or public.has_app_capability('LEAVE_MANAGE'),false) then raise exception 'Denied' using errcode='42501';end if;
 select jsonb_build_object('employee_id',p_employee,'year',p_year,'version',coalesce((select version from public.leave_account where employee_id=p_employee and year=p_year and bucket='ANNUAL'),0),
 'balance',coalesce(sum(public.leave_source_balance(s.id)) filter(where bucket<>'BIRTHDAY'),0),
 'buckets',jsonb_build_object('SUBSTITUTE',coalesce(sum(public.leave_source_balance(s.id)) filter(where bucket='SUBSTITUTE'),0),'CARRYOVER',coalesce(sum(public.leave_source_balance(s.id)) filter(where bucket='CARRYOVER'),0),'ANNUAL',coalesce(sum(public.leave_source_balance(s.id)) filter(where bucket='ANNUAL'),0),'BIRTHDAY',coalesce(sum(public.leave_source_balance(s.id)) filter(where bucket='BIRTHDAY'),0)),
 'adjusted',coalesce((select sum(l.amount_delta) from public.leave_ledger l where l.employee_id=p_employee and l.year=p_year and l.bucket<>'BIRTHDAY' and l.event_type='ADJUSTMENT'),0),
 'used',-coalesce((select sum(l.amount_delta) from public.leave_ledger l join public.leave_request r on r.id=l.request_id where l.employee_id=p_employee and extract(year from r.start_date)=p_year and l.bucket<>'BIRTHDAY' and l.event_type in ('DEDUCTION','REVERSAL')),0)) into result
 from public.leave_source s where s.employee_id=p_employee and s.valid_from<=make_date(p_year,12,31) and (s.valid_until is null or s.valid_until>=make_date(p_year,1,1));
 return result;
end $$;

create function public.grant_leave_source(p_id uuid,p_employee uuid,p_year int,p_bucket text,p_days numeric,p_reason text,p_version int) returns uuid language plpgsql security definer set search_path='' as $$
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
 values(p_id,p_employee,p_year,p_bucket,make_date(p_year,1,1),case when p_bucket<>'CARRYOVER' then make_date(p_year,12,31) end,trim(p_reason),auth.uid());
 insert into public.leave_ledger(employee_id,year,bucket,source_id,amount_delta,event_type,actor_id,note) values(p_employee,p_year,p_bucket,p_id,p_days,'ADJUSTMENT',auth.uid(),trim(p_reason));
 update public.leave_account set version=version+1 where employee_id=p_employee and year=p_year;
 return p_id;
end $$;

create or replace function public.adjust_leave(p_employee uuid,p_year int,p_delta numeric,p_reason text,p_version int) returns void language plpgsql security definer set search_path='' as $$
declare v int; remaining numeric; taken numeric; s public.leave_source;
begin
 if not public.has_app_capability('LEAVE_MANAGE') then raise exception 'Denied' using errcode='42501';end if;
 if p_delta is null or p_delta=0 or abs(p_delta)>366 or p_delta*2<>trunc(p_delta*2) or nullif(trim(p_reason),'') is null or length(p_reason)>2000 or p_year is null or p_year not between 1900 and 9999 then raise exception 'INVALID_ADJUSTMENT' using errcode='23514';end if;
 if p_delta>0 then perform public.grant_leave_source(gen_random_uuid(),p_employee,p_year,'ANNUAL',p_delta,p_reason,p_version);return;end if;
 perform 1 from public.employee where id=p_employee for update;if not found then raise exception 'Denied' using errcode='42501';end if;
 select version into v from public.leave_account where employee_id=p_employee and year=p_year and bucket='ANNUAL';
 if coalesce(v,0) is distinct from p_version then raise exception 'STALE_LEAVE' using errcode='40001';end if;
 remaining:=-p_delta;
 for s in select * from public.leave_source where employee_id=p_employee and year=p_year and bucket='ANNUAL' order by created_at,id loop
  taken:=least(remaining,public.leave_source_balance(s.id));
  if taken>0 then insert into public.leave_ledger(employee_id,year,bucket,source_id,amount_delta,event_type,actor_id,note) values(p_employee,p_year,'ANNUAL',s.id,-taken,'ADJUSTMENT',auth.uid(),trim(p_reason));remaining:=remaining-taken;end if;
  exit when remaining=0;
 end loop;
 if remaining<>0 then raise exception 'INSUFFICIENT_BALANCE' using errcode='23514';end if;
 update public.leave_account set version=version+1 where employee_id=p_employee and year=p_year;
end $$;

create function public.prepare_birthday_source(p_employee uuid,p_day date,p_unit text,p_exception text) returns void language plpgsql security definer set search_path='' as $$
declare b public.birthday_calendar; anniversary date; y int:=extract(year from p_day); sid uuid;
begin
 if p_unit not in ('AM_HALF','PM_HALF') then raise exception 'BIRTHDAY_HALF_REQUIRED' using errcode='23514';end if;
 select * into b from public.birthday_calendar where employee_id=p_employee;
 if b.employee_id is null then raise exception 'BIRTHDAY_UNVERIFIED' using errcode='23514';end if;
 if b.month=2 and b.day=29 and extract(day from (make_date(y,3,1)-1))<>29 then raise exception 'BIRTHDAY_POLICY_REVIEW' using errcode='23514';end if;
 anniversary:=make_date(y,b.month,b.day);
 -- No invented benefit-year ownership for a window crossing a calendar boundary.
 if (b.month=1 and abs(p_day-make_date(y+1,b.month,b.day))<=7) or (b.month=12 and abs(p_day-make_date(y-1,b.month,b.day))<=7) then raise exception 'BIRTHDAY_POLICY_REVIEW' using errcode='23514';end if;
 if abs(p_day-anniversary)>7 and nullif(trim(p_exception),'') is null then raise exception 'BIRTHDAY_EXCEPTION_REQUIRED' using errcode='23514';end if;
 if exists(select 1 from public.leave_request where employee_id=p_employee and kind='BIRTHDAY' and benefit_year=y and status in ('PENDING','APPROVED')) then raise exception 'BIRTHDAY_ALREADY_USED' using errcode='23514';end if;
 select id into sid from public.leave_source where employee_id=p_employee and year=y and bucket='BIRTHDAY';
 if sid is null then
  insert into public.leave_account(employee_id,year,bucket) values(p_employee,y,'BIRTHDAY') on conflict do nothing;
  insert into public.leave_source(employee_id,year,bucket,valid_from,valid_until,note,created_by) values(p_employee,y,'BIRTHDAY',make_date(y,1,1),make_date(y,12,31),'확인된 생일 · 연 1회 반차',auth.uid()) returning id into sid;
  insert into public.leave_ledger(employee_id,year,bucket,source_id,amount_delta,event_type,actor_id,note) values(p_employee,y,'BIRTHDAY',sid,0.5,'ADJUSTMENT',auth.uid(),'회사 생일 반차 정책 · 연 0.5일');
 end if;
end $$;
create function public.submit_leave_kind(p_id uuid,p_start date,p_end date,p_unit text,p_reason text,p_past_reason text,p_kind text,p_exception text) returns uuid language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=public.current_employee_id(); n numeric; y int; bal numeric; auto_approve boolean;
begin
 if not public.has_app_capability('EMPLOYEE_ACCESS') or owner_id is null then raise exception 'Denied' using errcode='42501';end if;
 perform 1 from public.employee where id=owner_id and employment_status='ACTIVE' and hire_date<=p_start for update;
 if not found then raise exception 'INVALID_EMPLOYEE_DATE' using errcode='23514';end if;
 if p_kind is null or p_kind not in ('ANNUAL','BIRTHDAY') or length(coalesce(p_exception,''))>2000 then raise exception 'INVALID_KIND' using errcode='23514';end if;
 n:=public.leave_days(p_start,p_end,p_unit);y:=extract(year from p_start);
 if p_start<public.leave_today() and nullif(trim(p_past_reason),'') is null then raise exception 'PAST_REASON_REQUIRED' using errcode='23514';end if;
 if exists(select 1 from public.leave_request where employee_id=owner_id and status in ('PENDING','APPROVED') and start_date<=p_end and end_date>=p_start and (unit='FULL_DAY' or p_unit='FULL_DAY' or unit=p_unit)) then raise exception 'OVERLAPPING_LEAVE' using errcode='23514';end if;
 insert into public.leave_account(employee_id,year) values(owner_id,y) on conflict do nothing;
 if p_kind='BIRTHDAY' then perform public.prepare_birthday_source(owner_id,p_start,p_unit,p_exception);end if;
 bal:=public.leave_available(owner_id,p_start,p_end,p_kind);
 if bal<n then raise exception 'INSUFFICIENT_BALANCE' using errcode='23514';end if;
 select exists(select 1 from public.app_memberships where user_id=auth.uid() and status='ACTIVE' and roles @> array['TEAM_LEADER']::text[]) into auto_approve;
 insert into public.leave_request(id,employee_id,start_date,end_date,unit,days,reason,past_reason,status,decided_by,decided_at,kind,benefit_year,exception_reason)
 values(p_id,owner_id,p_start,p_end,p_unit,n,coalesce(p_reason,''),coalesce(p_past_reason,''),case when auto_approve then 'APPROVED' else 'PENDING' end,case when auto_approve then auth.uid() end,case when auto_approve then now() end,p_kind,case when p_kind='BIRTHDAY' then y end,coalesce(trim(p_exception),''));
 insert into public.leave_history(request_id,action,actor_id) values(p_id,'SUBMITTED',auth.uid());
 if auto_approve then
  perform public.allocate_leave(p_id);
  update public.leave_account set version=version+1 where employee_id=owner_id and year=y;
  insert into public.leave_history(request_id,action,actor_id) values(p_id,'AUTO_APPROVED',auth.uid());
 end if;
 return p_id;
end $$;

create or replace function public.submit_leave(p_id uuid,p_start date,p_end date,p_unit text,p_reason text,p_past_reason text) returns uuid language sql security definer set search_path='' as $$
 select public.submit_leave_kind(p_id,p_start,p_end,p_unit,p_reason,p_past_reason,'ANNUAL','');
$$;
create function public.submit_leave_benefit(p_id uuid,p_start date,p_end date,p_unit text,p_reason text,p_past_reason text,p_calendar_version int,p_kind text,p_exception text) returns uuid language plpgsql security definer set search_path='' as $$
declare v int;
begin
 if not public.has_app_capability('EMPLOYEE_ACCESS') then raise exception 'Denied' using errcode='42501';end if;
 select version into v from public.holiday_year where year=extract(year from p_start) for share;
 if v is null then raise exception 'HOLIDAY_YEAR_UNVERIFIED' using errcode='23514';end if;
 if v is distinct from p_calendar_version then raise exception 'STALE_CALENDAR' using errcode='40001';end if;
 return public.submit_leave_kind(p_id,p_start,p_end,p_unit,p_reason,p_past_reason,p_kind,p_exception);
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
create function public.correct_leave_source(p_source uuid,p_days numeric,p_reason text,p_version int) returns void language plpgsql security definer set search_path='' as $$
declare s public.leave_source; v int;
begin
 if not public.has_app_capability('LEAVE_MANAGE') then raise exception 'Denied' using errcode='42501';end if;
 select * into s from public.leave_source where id=p_source;
 if s.id is null or s.bucket='BIRTHDAY' then raise exception 'Denied' using errcode='42501';end if;
 perform 1 from public.employee where id=s.employee_id for update;
 select version into v from public.leave_account where employee_id=s.employee_id and year=s.year and bucket='ANNUAL';
 if v is distinct from p_version then raise exception 'STALE_LEAVE' using errcode='40001';end if;
 if p_days is null or p_days<=0 or p_days>366 or p_days*2<>trunc(p_days*2) or nullif(trim(p_reason),'') is null or length(p_reason)>2000 then raise exception 'INVALID_ADJUSTMENT' using errcode='23514';end if;
 if public.leave_source_balance(s.id)<p_days then raise exception 'INSUFFICIENT_BALANCE' using errcode='23514';end if;
 insert into public.leave_ledger(employee_id,year,bucket,source_id,amount_delta,event_type,actor_id,note) values(s.employee_id,s.year,s.bucket,s.id,-p_days,'ADJUSTMENT',auth.uid(),trim(p_reason));
 update public.leave_account set version=version+1 where employee_id=s.employee_id and year=s.year;
end $$;
create function public.leave_sources(p_employee uuid,p_year int) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_app_capability('EMPLOYEE_ACCESS') or not coalesce(p_employee=public.current_employee_id() or public.has_app_capability('LEAVE_MANAGE'),false) then raise exception 'Denied' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'year',s.year,'bucket',s.bucket,'valid_from',s.valid_from,'valid_until',s.valid_until,'note',s.note,'balance',public.leave_source_balance(s.id),'version',coalesce(a.version,0)) order by s.year,s.created_at,s.id)
 from public.leave_source s left join public.leave_account a on a.employee_id=s.employee_id and a.year=s.year and a.bucket='ANNUAL'
 where s.employee_id=p_employee and s.valid_from<=make_date(p_year,12,31) and (s.valid_until is null or s.valid_until>=make_date(p_year,1,1))),'[]'::jsonb);
end $$;
revoke all on function public.correct_leave_source(uuid,numeric,text,int),public.leave_sources(uuid,int) from public,anon,authenticated;
grant execute on function public.correct_leave_source(uuid,numeric,text,int),public.leave_sources(uuid,int) to authenticated;
create function public.leave_immutable_row() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'IMMUTABLE_LEAVE_HISTORY' using errcode='23514';end $$;
create trigger leave_source_immutable before update or delete on public.leave_source for each row execute function public.leave_immutable_row();
create trigger leave_ledger_immutable before update or delete on public.leave_ledger for each row execute function public.leave_immutable_row();
revoke all on function public.leave_source_balance(uuid),public.leave_available(uuid,date,date,text),public.allocate_leave(uuid),public.prepare_birthday_source(uuid,date,text,text),public.submit_leave_kind(uuid,date,date,text,text,text,text,text),public.leave_immutable_row(),public.grant_leave_source(uuid,uuid,int,text,numeric,text,int),public.submit_leave_benefit(uuid,date,date,text,text,text,int,text,text) from public,anon,authenticated;
grant execute on function public.grant_leave_source(uuid,uuid,int,text,numeric,text,int),public.submit_leave_benefit(uuid,date,date,text,text,text,int,text,text) to authenticated;
commit;
