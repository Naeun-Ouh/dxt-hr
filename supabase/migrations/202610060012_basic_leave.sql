begin;
create or replace function public.has_app_capability(requested text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.app_memberships m where m.user_id=auth.uid() and m.status='ACTIVE'
 and not exists(select 1 from public.employee e where e.auth_user_id=m.user_id and e.employment_status='INACTIVE')
 and case requested when 'EMPLOYEE_ACCESS' then cardinality(m.roles)>0
 when 'EMPLOYEE_MANAGE' then m.roles && array['ADMIN','CEO']::text[]
 when 'EXPENSE_MANAGE' then m.roles && array['ADMIN','CEO','EXPENSE_ADMIN']::text[]
 when 'PROJECT_MANAGE' then m.roles && array['ADMIN','CEO']::text[]
 when 'TEAM_PROJECT_READ' then m.roles && array['ADMIN','CEO','TEAM_LEADER']::text[]
 when 'ONBOARDING_MANAGE' then m.roles && array['ADMIN','CEO']::text[]
 when 'OFFBOARDING_MANAGE' then m.roles && array['ADMIN','CEO']::text[]
 when 'ANNOUNCEMENT_MANAGE' then m.roles && array['ADMIN','CEO']::text[]
 when 'LEAVE_MANAGE' then m.roles && array['ADMIN','CEO']::text[]
 when 'TEAM_LEAVE_APPROVE' then m.roles && array['ADMIN','CEO','TEAM_LEADER']::text[]
 when 'TEAM_LEAVE_REASON_READ' then m.roles && array['ADMIN','CEO','TEAM_LEADER']::text[]
 when 'SETTINGS_MANAGE' then m.roles && array['ADMIN','CEO']::text[]
 when 'FAMILY_EVENT_REVIEW' then m.roles @> array['CEO']::text[]
 when 'RESIGNATION_REASON_ACCESS' then m.roles @> array['CEO']::text[]
 when 'ASSET_MANAGE' then m.roles && array['ADMIN','CEO','IT_ADMIN']::text[]
 when 'WINDOWS_MANAGE' then m.roles && array['ADMIN','CEO','IT_ADMIN']::text[]
 when 'ACCOUNT_MANAGE' then m.roles && array['ADMIN','CEO','IT_ADMIN']::text[]
 when 'WINDOWS_KEY_REVEAL' then m.roles @> array['IT_ADMIN']::text[] or (m.roles && array['ADMIN','CEO']::text[] and m.capabilities @> array['WINDOWS_KEY_REVEAL']::text[])
 when 'ACCOUNT_PASSWORD_REVEAL' then m.roles @> array['IT_ADMIN']::text[] or (m.roles && array['ADMIN','CEO']::text[] and m.capabilities @> array['ACCOUNT_PASSWORD_REVEAL']::text[])
 when 'PRIVATE_HR_ACCESS' then m.roles @> array['CEO']::text[] or (m.roles @> array['ADMIN']::text[] and m.capabilities @> array['PRIVATE_HR_ACCESS']::text[]) else false end);
$$;
create function public.leave_today() returns date language sql stable set search_path='' as $$select (now() at time zone 'Asia/Seoul')::date$$;
create function public.leave_team_scope(p_employee uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(public.has_app_capability('EMPLOYEE_ACCESS') and exists(
 select 1 from public.employee target join public.employee self on self.department_id=target.department_id
 where self.id=public.current_employee_id() and target.id=p_employee),false);
$$;
create function public.leave_reviewer(p_employee uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.has_app_capability('LEAVE_MANAGE') or (public.has_app_capability('TEAM_LEAVE_APPROVE') and public.leave_team_scope(p_employee));
$$;
create function public.leave_private_scope(p_employee uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(public.has_app_capability('EMPLOYEE_ACCESS') and (p_employee=public.current_employee_id() or public.leave_reviewer(p_employee)),false);
$$;
create table public.leave_account(
 employee_id uuid not null references public.employee(id),year int not null check(year between 1900 and 9999),
 bucket text not null default 'ANNUAL' check(bucket='ANNUAL'),version int not null default 0 check(version>=0),
 primary key(employee_id,year,bucket)
);
create table public.leave_request(
 id uuid primary key,employee_id uuid not null references public.employee(id),
 start_date date not null,end_date date not null,unit text not null check(unit in ('FULL_DAY','AM_HALF','PM_HALF')),
 days numeric(6,1) not null check(days>0),reason text not null default '' check(length(reason)<=2000),
 past_reason text not null default '' check(length(past_reason)<=2000),
 status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED','CANCELLED')),
 version int not null default 1 check(version>0),created_at timestamptz not null default now(),
 decided_by uuid references auth.users(id),decided_at timestamptz,
 check(start_date>=date '1900-01-01' and end_date<=date '9999-12-31' and end_date>=start_date),
 check(extract(year from start_date)=extract(year from end_date)),
 check(unit='FULL_DAY' or start_date=end_date)
);
create table public.leave_ledger(
 id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.employee(id),year int not null,
 bucket text not null default 'ANNUAL',amount_delta numeric(6,1) not null check(amount_delta<>0),
 event_type text not null check(event_type in ('ADJUSTMENT','DEDUCTION','REVERSAL')),
 request_id uuid references public.leave_request(id),actor_id uuid references auth.users(id),
 note text not null default '' check(length(note)<=2000),occurred_at timestamptz not null default now(),
 foreign key(employee_id,year,bucket) references public.leave_account(employee_id,year,bucket),
 check((event_type='ADJUSTMENT' and request_id is null and length(trim(note))>0) or
 (event_type='DEDUCTION' and request_id is not null and amount_delta<0) or
 (event_type='REVERSAL' and request_id is not null and amount_delta>0)),
 unique(request_id,event_type)
);
create table public.leave_history(
 id uuid primary key default gen_random_uuid(),request_id uuid not null references public.leave_request(id),
 action text not null check(action in ('SUBMITTED','AUTO_APPROVED','APPROVED','REJECTED','CANCELLED')),
 actor_id uuid references auth.users(id),note text not null default '' check(length(note)<=2000),occurred_at timestamptz not null default now()
);
create index leave_request_employee_dates on public.leave_request(employee_id,start_date,end_date);
create index leave_ledger_account on public.leave_ledger(employee_id,year);
alter table public.leave_account enable row level security;
alter table public.leave_request enable row level security;
alter table public.leave_ledger enable row level security;
alter table public.leave_history enable row level security;
create policy leave_account_read on public.leave_account for select to authenticated using(public.has_app_capability('LEAVE_MANAGE') or employee_id=public.current_employee_id());
create policy leave_ledger_read on public.leave_ledger for select to authenticated using(public.has_app_capability('LEAVE_MANAGE') or employee_id=public.current_employee_id());
create policy leave_request_read on public.leave_request for select to authenticated using(public.leave_private_scope(employee_id));
create policy leave_history_read on public.leave_history for select to authenticated using(exists(select 1 from public.leave_request r where r.id=request_id and public.leave_private_scope(r.employee_id)));
revoke all on public.leave_account,public.leave_request,public.leave_ledger,public.leave_history from anon,authenticated;
grant select on public.leave_account,public.leave_request,public.leave_ledger,public.leave_history to authenticated;

create function public.leave_days(p_start date,p_end date,p_unit text) returns numeric language plpgsql immutable set search_path='' as $$
declare n int;
begin
 if p_start is null or p_end is null or p_unit is null or p_start<date '1900-01-01' or p_end>date '9999-12-31' or p_end<p_start or extract(year from p_start)<>extract(year from p_end) or p_unit not in ('FULL_DAY','AM_HALF','PM_HALF') or (p_unit<>'FULL_DAY' and p_start<>p_end) then raise exception 'INVALID_LEAVE_DATES' using errcode='23514'; end if;
 select count(*) into n from generate_series(0,p_end-p_start) i where extract(isodow from p_start+i)<=5;
 if n=0 or (p_unit<>'FULL_DAY' and n<>1) then raise exception 'NO_WORKDAY' using errcode='23514';end if;
 return case when p_unit='FULL_DAY' then n else 0.5 end;
end $$;
create function public.leave_summary(p_employee uuid,p_year int) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_app_capability('EMPLOYEE_ACCESS') or not coalesce(p_employee=public.current_employee_id() or public.has_app_capability('LEAVE_MANAGE'),false) then raise exception 'Denied' using errcode='42501';end if;
 return jsonb_build_object('employee_id',p_employee,'year',p_year,'version',coalesce((select version from public.leave_account where employee_id=p_employee and year=p_year),0),'balance',coalesce((select sum(amount_delta) from public.leave_ledger where employee_id=p_employee and year=p_year),0),'adjusted',coalesce((select sum(amount_delta) from public.leave_ledger where employee_id=p_employee and year=p_year and event_type='ADJUSTMENT'),0),'used',-coalesce((select sum(amount_delta) from public.leave_ledger where employee_id=p_employee and year=p_year and event_type in ('DEDUCTION','REVERSAL')),0));
end $$;
create function public.submit_leave(p_id uuid,p_start date,p_end date,p_unit text,p_reason text,p_past_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=public.current_employee_id(); n numeric; y int; bal numeric; auto_approve boolean;
begin
 if not public.has_app_capability('EMPLOYEE_ACCESS') or owner_id is null then raise exception 'Denied' using errcode='42501';end if;
 perform 1 from public.employee where id=owner_id and employment_status='ACTIVE' and hire_date<=p_start for update;
 if not found then raise exception 'INVALID_EMPLOYEE_DATE' using errcode='23514';end if;
 n:=public.leave_days(p_start,p_end,p_unit);y:=extract(year from p_start);
 if p_start<public.leave_today() and nullif(trim(p_past_reason),'') is null then raise exception 'PAST_REASON_REQUIRED' using errcode='23514';end if;
 if exists(select 1 from public.leave_request where employee_id=owner_id and status in ('PENDING','APPROVED') and start_date<=p_end and end_date>=p_start and (unit='FULL_DAY' or p_unit='FULL_DAY' or unit=p_unit)) then raise exception 'OVERLAPPING_LEAVE' using errcode='23514';end if;
 insert into public.leave_account(employee_id,year) values(owner_id,y) on conflict do nothing;
 select coalesce(sum(amount_delta),0) into bal from public.leave_ledger where employee_id=owner_id and year=y;
 if bal<n then raise exception 'INSUFFICIENT_BALANCE' using errcode='23514';end if;
 select exists(select 1 from public.app_memberships where user_id=auth.uid() and status='ACTIVE' and roles @> array['TEAM_LEADER']::text[]) into auto_approve;
 insert into public.leave_request(id,employee_id,start_date,end_date,unit,days,reason,past_reason,status,decided_by,decided_at)
 values(p_id,owner_id,p_start,p_end,p_unit,n,coalesce(p_reason,''),coalesce(p_past_reason,''),case when auto_approve then 'APPROVED' else 'PENDING' end,case when auto_approve then auth.uid() end,case when auto_approve then now() end);
 insert into public.leave_history(request_id,action,actor_id) values(p_id,'SUBMITTED',auth.uid());
 if auto_approve then
  insert into public.leave_ledger(employee_id,year,amount_delta,event_type,request_id,actor_id) values(owner_id,y,-n,'DEDUCTION',p_id,auth.uid());
  update public.leave_account set version=version+1 where employee_id=owner_id and year=y;
  insert into public.leave_history(request_id,action,actor_id) values(p_id,'AUTO_APPROVED',auth.uid());
 end if;
 return p_id;
end $$;

create function public.review_leave(p_items jsonb,p_action text,p_note text default '') returns void language plpgsql security definer set search_path='' as $$
declare item jsonb; r public.leave_request; bal numeric; y int;
begin
 if not public.has_app_capability('TEAM_LEAVE_APPROVE') then raise exception 'Denied' using errcode='42501';end if;
 if p_action is null or p_action not in ('APPROVED','REJECTED','CANCELLED') or p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'INVALID_ACTION' using errcode='23514';end if;
 if jsonb_array_length(p_items) not between 1 and 100 or length(coalesce(p_note,''))>2000 or
 (select count(distinct (i->>'id')::uuid) from jsonb_array_elements(p_items) i)<>jsonb_array_length(p_items) then raise exception 'INVALID_SELECTION' using errcode='23514';end if;
 -- All balance writers lock employee rows first, in the same order, then requests.
 perform 1 from public.employee e where e.id in (select employee_id from public.leave_request where id in (select (i->>'id')::uuid from jsonb_array_elements(p_items) i)) order by e.id for update;
 for item in select value from jsonb_array_elements(p_items) order by value->>'id' loop
  select * into r from public.leave_request where id=(item->>'id')::uuid for update;
  if r.id is null or not public.leave_reviewer(r.employee_id) then raise exception 'Denied' using errcode='42501';end if;
  if (item->>'version')::int is distinct from r.version then raise exception 'STALE_LEAVE' using errcode='40001';end if;
  if (p_action='CANCELLED' and r.status<>'APPROVED') or (p_action<>'CANCELLED' and r.status<>'PENDING') then raise exception 'INVALID_STATE' using errcode='23514';end if;
  y:=extract(year from r.start_date);
  if p_action='APPROVED' then
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
create function public.adjust_leave(p_employee uuid,p_year int,p_delta numeric,p_reason text,p_version int) returns void language plpgsql security definer set search_path='' as $$
declare v int; bal numeric;
begin
 if not public.has_app_capability('LEAVE_MANAGE') then raise exception 'Denied' using errcode='42501';end if;
 if p_delta is null or p_delta=0 or abs(p_delta)>366 or p_delta*2<>trunc(p_delta*2) or nullif(trim(p_reason),'') is null or length(p_reason)>2000 or p_year is null or p_year not between 1900 and 9999 then raise exception 'INVALID_ADJUSTMENT' using errcode='23514';end if;
 perform 1 from public.employee where id=p_employee for update;if not found then raise exception 'Denied' using errcode='42501';end if;
 insert into public.leave_account(employee_id,year) values(p_employee,p_year) on conflict do nothing;
 select version into v from public.leave_account where employee_id=p_employee and year=p_year;
 if v is distinct from p_version then raise exception 'STALE_LEAVE' using errcode='40001';end if;
 select coalesce(sum(amount_delta),0) into bal from public.leave_ledger where employee_id=p_employee and year=p_year;
 if bal+p_delta<0 then raise exception 'INSUFFICIENT_BALANCE' using errcode='23514';end if;
 insert into public.leave_ledger(employee_id,year,amount_delta,event_type,actor_id,note) values(p_employee,p_year,p_delta,'ADJUSTMENT',auth.uid(),trim(p_reason));
 update public.leave_account set version=version+1 where employee_id=p_employee and year=p_year;
end $$;
create function public.leave_calendar(p_month date) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_app_capability('EMPLOYEE_ACCESS') then raise exception 'Denied' using errcode='42501';end if;
 if p_month is null or extract(day from p_month)<>1 then raise exception 'INVALID_MONTH';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('name',e.name,'start_date',r.start_date,'end_date',r.end_date,'unit',r.unit) order by r.start_date,e.name)
 from public.leave_request r join public.employee e on e.id=r.employee_id
 where r.status='APPROVED' and r.start_date<(p_month+interval '1 month')::date and r.end_date>=p_month
 and (r.employee_id=public.current_employee_id() or public.leave_team_scope(r.employee_id))),'[]'::jsonb);
end $$;
revoke all on function public.leave_today(),public.leave_team_scope(uuid),public.leave_reviewer(uuid),public.leave_private_scope(uuid),public.leave_days(date,date,text),public.leave_summary(uuid,int),public.submit_leave(uuid,date,date,text,text,text),public.review_leave(jsonb,text,text),public.adjust_leave(uuid,int,numeric,text,int),public.leave_calendar(date) from public,anon;
grant execute on function public.leave_today(),public.leave_team_scope(uuid),public.leave_reviewer(uuid),public.leave_private_scope(uuid),public.leave_days(date,date,text),public.leave_summary(uuid,int),public.submit_leave(uuid,date,date,text,text,text),public.review_leave(jsonb,text,text),public.adjust_leave(uuid,int,numeric,text,int),public.leave_calendar(date) to authenticated;
commit;
