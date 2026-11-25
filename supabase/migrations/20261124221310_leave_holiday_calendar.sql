begin;
-- Extend the installed switch, preserving independent preceding domain capabilities.
do $$
declare definition text:=pg_get_functiondef('public.has_app_capability(text)'::regprocedure);
begin
 if position('when ''HOLIDAY_MANAGE''' in definition)=0 then
  if position('when ''LEAVE_MANAGE''' in definition)=0 then raise exception 'Capability switch requires review';end if;
  execute replace(definition,'when ''LEAVE_MANAGE''','when ''HOLIDAY_MANAGE'' then m.roles && array[''ADMIN'',''CEO'']::text[] when ''LEAVE_MANAGE''');
 end if;
end $$;
create table public.holiday_year (
 year int primary key check(year between 1900 and 9999), version int not null default 1 check(version>0),
 source text not null, source_version text not null, verified_at date not null
);
create table public.holiday_calendar (
 id uuid primary key default gen_random_uuid(), day date not null, name text not null check(length(trim(name)) between 1 and 100),
 kind text not null check(kind in ('STATUTORY','SUBSTITUTE','COMPANY')), active boolean not null default true,
 version int not null default 1, year int generated always as (extract(year from day)::int) stored references public.holiday_year(year),
 updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
create unique index holiday_active_date_kind on public.holiday_calendar(day,kind) where active;
create table public.holiday_event (
 id uuid primary key default gen_random_uuid(), holiday_id uuid not null references public.holiday_calendar(id),
 actor_id uuid not null references auth.users(id), action text not null, occurred_at timestamptz not null default now(),
 before_value jsonb, after_value jsonb
);
alter table public.holiday_year enable row level security;
alter table public.holiday_calendar enable row level security;
alter table public.holiday_event enable row level security;
revoke all on public.holiday_year,public.holiday_calendar,public.holiday_event from public,anon,authenticated;
grant select on public.holiday_year,public.holiday_calendar,public.holiday_event to authenticated;
create policy holiday_year_read on public.holiday_year for select to authenticated using(public.has_app_capability('EMPLOYEE_ACCESS'));
create policy holiday_read on public.holiday_calendar for select to authenticated using(public.has_app_capability('EMPLOYEE_ACCESS') and (active or public.has_app_capability('HOLIDAY_MANAGE')));
create policy holiday_event_read on public.holiday_event for select to authenticated using(public.has_app_capability('HOLIDAY_MANAGE'));
insert into public.holiday_year(year,source,source_version,verified_at) values
(2026,'https://www.kasa.go.kr/prog/bbsArticle/BBSMSTR_000000000010/view.do?bbsId=B000000000010&nttId=B000000001860Pe2zT3','KASA 2025-06-30 + Decree 36290 (2026-05-01/11)','2026-11-25');
-- Published lunar dates + statutory fixed dates/substitute rules, including 2026 amendment.
insert into public.holiday_calendar(day,name,kind) values
('2026-01-01','신정','STATUTORY'),('2026-02-16','설날 연휴','STATUTORY'),('2026-02-17','설날','STATUTORY'),('2026-02-18','설날 연휴','STATUTORY'),
('2026-03-01','삼일절','STATUTORY'),('2026-03-02','삼일절 대체공휴일','SUBSTITUTE'),
('2026-05-01','노동절','STATUTORY'),('2026-05-05','어린이날','STATUTORY'),('2026-05-24','부처님오신날','STATUTORY'),('2026-05-25','부처님오신날 대체공휴일','SUBSTITUTE'),
('2026-06-03','전국동시지방선거','STATUTORY'),('2026-06-06','현충일','STATUTORY'),('2026-07-17','제헌절','STATUTORY'),
('2026-08-15','광복절','STATUTORY'),('2026-08-17','광복절 대체공휴일','SUBSTITUTE'),
('2026-09-24','추석 연휴','STATUTORY'),('2026-09-25','추석','STATUTORY'),('2026-09-26','추석 연휴','STATUTORY'),
('2026-10-03','개천절','STATUTORY'),('2026-10-05','개천절 대체공휴일','SUBSTITUTE'),('2026-10-09','한글날','STATUTORY'),('2026-12-25','기독탄신일','STATUTORY');
insert into public.holiday_year(year,source,source_version,verified_at) values
(2027,'https://www.kasa.go.kr/prog/plcyBrf/brief/kor/sub01_01_04/view.do?plcyBrfNo=431','KASA 2026-06-29; Decree 36290','2026-11-25');
insert into public.holiday_calendar(day,name,kind) values
('2027-01-01','신정','STATUTORY'),('2027-02-06','설날 연휴','STATUTORY'),('2027-02-07','설날','STATUTORY'),('2027-02-08','설날 연휴','STATUTORY'),('2027-02-09','설날 대체공휴일','SUBSTITUTE'),
('2027-03-01','삼일절','STATUTORY'),('2027-05-01','노동절','STATUTORY'),('2027-05-03','노동절 대체공휴일','SUBSTITUTE'),('2027-05-05','어린이날','STATUTORY'),('2027-05-13','부처님오신날','STATUTORY'),('2027-06-06','현충일','STATUTORY'),
('2027-07-17','제헌절','STATUTORY'),('2027-07-19','제헌절 대체공휴일','SUBSTITUTE'),('2027-08-15','광복절','STATUTORY'),('2027-08-16','광복절 대체공휴일','SUBSTITUTE'),
('2027-09-14','추석 연휴','STATUTORY'),('2027-09-15','추석','STATUTORY'),('2027-09-16','추석 연휴','STATUTORY'),('2027-10-03','개천절','STATUTORY'),('2027-10-04','개천절 대체공휴일','SUBSTITUTE'),('2027-10-09','한글날','STATUTORY'),('2027-10-11','한글날 대체공휴일','SUBSTITUTE'),('2027-12-25','기독탄신일','STATUTORY'),('2027-12-27','기독탄신일 대체공휴일','SUBSTITUTE');
create function public.save_company_holiday(p_id uuid,p_day date,p_name text,p_version int,p_active boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare old public.holiday_calendar; fresh public.holiday_calendar; y int:=extract(year from p_day);
begin
 if not public.has_app_capability('HOLIDAY_MANAGE') then raise exception 'Denied' using errcode='42501';end if;
 -- Shared year lock serializes calendar edits against preview submission and approvals.
 perform 1 from public.holiday_year where year=y for update;
 if not found then raise exception 'HOLIDAY_YEAR_UNVERIFIED' using errcode='23514';end if;
 select * into old from public.holiday_calendar where id=p_id for update;
 if old.id is null then
  if p_version is distinct from 0 or p_active is distinct from true then raise exception 'STALE_CALENDAR' using errcode='40001';end if;
  insert into public.holiday_calendar(id,day,name,kind,updated_by) values(p_id,p_day,trim(p_name),'COMPANY',auth.uid()) returning * into fresh;
 else
  if old.kind<>'COMPANY' then raise exception 'Denied' using errcode='42501';end if;
  if old.version is distinct from p_version then raise exception 'STALE_CALENDAR' using errcode='40001';end if;
  if old.year<>y then raise exception 'INVALID_HOLIDAY_YEAR' using errcode='23514';end if;
  update public.holiday_calendar set day=p_day,name=trim(p_name),active=p_active,version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id returning * into fresh;
 end if;
 update public.holiday_year set version=version+1 where year=y;
 insert into public.holiday_event(holiday_id,actor_id,action,before_value,after_value) values(p_id,auth.uid(),case when old.id is null then 'CREATED' when p_active then 'UPDATED' else 'REMOVED' end,to_jsonb(old),to_jsonb(fresh));
 return p_id;
end $$;
create function public.leave_work_dates(p_start date,p_end date) returns date[] language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(p_start+i order by i),'{}'::date[]) from generate_series(0,p_end-p_start) i
 where extract(isodow from p_start+i)<=5 and not exists(select 1 from public.holiday_calendar h where h.active and h.day=p_start+i);
$$;
create or replace function public.leave_days(p_start date,p_end date,p_unit text) returns numeric language plpgsql stable security definer set search_path='' as $$
declare n int;
begin
 if not public.has_app_capability('EMPLOYEE_ACCESS') then raise exception 'Denied' using errcode='42501';end if;
 if p_start is null or p_end is null or p_unit is null or p_start<date '1900-01-01' or p_end>date '9999-12-31' or p_end<p_start or extract(year from p_start)<>extract(year from p_end) or p_unit not in ('FULL_DAY','AM_HALF','PM_HALF') or (p_unit<>'FULL_DAY' and p_start<>p_end) then raise exception 'INVALID_LEAVE_DATES' using errcode='23514';end if;
 if not exists(select 1 from public.holiday_year where year=extract(year from p_start)) then raise exception 'HOLIDAY_YEAR_UNVERIFIED' using errcode='23514';end if;
 n:=cardinality(public.leave_work_dates(p_start,p_end));
 if n=0 then raise exception 'NO_WORKDAY' using errcode='23514';end if;
 return case when p_unit='FULL_DAY' then n else 0.5 end;
end $$;
alter table public.leave_request add column calendar_version int, add column work_dates date[];
create function public.freeze_leave_calendar() returns trigger language plpgsql security definer set search_path='' as $$
begin
 select version into NEW.calendar_version from public.holiday_year where year=extract(year from NEW.start_date) for share;
 NEW.work_dates:=public.leave_work_dates(NEW.start_date,NEW.end_date);
 return NEW;
end $$;
create trigger freeze_leave_calendar before insert on public.leave_request for each row execute function public.freeze_leave_calendar();
create function public.submit_leave_checked(p_id uuid,p_start date,p_end date,p_unit text,p_reason text,p_past_reason text,p_calendar_version int) returns uuid language plpgsql security definer set search_path='' as $$
declare v int;
begin
 if not public.has_app_capability('EMPLOYEE_ACCESS') then raise exception 'Denied' using errcode='42501';end if;
 select version into v from public.holiday_year where year=extract(year from p_start) for share;
 if v is null then raise exception 'HOLIDAY_YEAR_UNVERIFIED' using errcode='23514';end if;
 if v is distinct from p_calendar_version then raise exception 'STALE_CALENDAR' using errcode='40001';end if;
 return public.submit_leave(p_id,p_start,p_end,p_unit,p_reason,p_past_reason);
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
   select coalesce(sum(amount_delta),0) into bal from public.leave_ledger where employee_id=r.employee_id and year=y;
   if bal<r.days then raise exception 'INSUFFICIENT_BALANCE' using errcode='23514';end if;
   insert into public.leave_ledger(employee_id,year,amount_delta,event_type,request_id,actor_id) values(r.employee_id,y,-r.days,'DEDUCTION',r.id,auth.uid());
  elsif p_action='CANCELLED' then
   insert into public.leave_ledger(employee_id,year,amount_delta,event_type,request_id,actor_id)
    select employee_id,year,-amount_delta,'REVERSAL',request_id,auth.uid() from public.leave_ledger where request_id=r.id and event_type='DEDUCTION';
   if not found then raise exception 'MISSING_DEDUCTION';end if;
  end if;
  if p_action<>'REJECTED' then update public.leave_account set version=version+1 where employee_id=r.employee_id and year=y;end if;
  update public.leave_request set status=p_action,version=version+1,decided_by=auth.uid(),decided_at=now() where id=r.id;
  insert into public.leave_history(request_id,action,actor_id,note) values(r.id,p_action,auth.uid(),coalesce(p_note,''));
 end loop;
end $$;
revoke all on function public.save_company_holiday(uuid,date,text,int,boolean),public.leave_work_dates(date,date),public.freeze_leave_calendar(),public.submit_leave_checked(uuid,date,date,text,text,text,int) from public,anon,authenticated;
grant execute on function public.save_company_holiday(uuid,date,text,int,boolean),public.submit_leave_checked(uuid,date,date,text,text,text,int) to authenticated;
-- Old direct submit cannot bypass the preview-version boundary; checked wrapper retains reuse.
revoke execute on function public.submit_leave(uuid,date,date,text,text,text) from authenticated;
create or replace function public.leave_calendar(p_month date) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_app_capability('EMPLOYEE_ACCESS') then raise exception 'Denied' using errcode='42501';end if;
 if p_month is null or extract(day from p_month)<>1 then raise exception 'INVALID_MONTH';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('name',e.name,'start_date',r.start_date,'end_date',r.end_date,'unit',r.unit,'work_dates',r.work_dates) order by r.start_date,e.name)
 from public.leave_request r join public.employee e on e.id=r.employee_id
 where r.status='APPROVED' and r.start_date<(p_month+interval '1 month')::date and r.end_date>=p_month
 and (r.employee_id=public.current_employee_id() or public.leave_team_scope(r.employee_id))),'[]'::jsonb);
end $$;
commit;
