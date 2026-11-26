begin;
-- Evidence/review only. No statutory compensation, payroll offset or leave grant.
create table public.weekend_work (
 id uuid primary key,employee_id uuid not null references public.employee(id),work_date date not null,
 start_minute int not null check(start_minute between 0 and 1439),end_minute int not null check(end_minute between 1 and 1440),
 break_minutes int not null check(break_minutes>=0),net_minutes int generated always as (end_minute-start_minute-break_minutes) stored,
 indicative_days numeric(2,1) generated always as (case when end_minute-start_minute-break_minutes>=480 then 1 when end_minute-start_minute-break_minutes>=240 then 0.5 else 0 end) stored,
 project_id uuid references public.project(id),reason text not null check(length(trim(reason)) between 1 and 2000),
 status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED','CANCELLED')),
 version int not null default 1,created_at timestamptz not null default now(),decided_at timestamptz,decided_by uuid references auth.users(id),
 check(end_minute>start_minute and break_minutes<end_minute-start_minute),check(extract(isodow from work_date) in (6,7)),check(work_date>=date '1900-01-01')
);
-- One workday evidence record: capture the full interval and total breaks; never double-count daily benefits.
create unique index weekend_work_open_day on public.weekend_work(employee_id,work_date) where status in ('PENDING','APPROVED');
create table public.weekend_work_event (
 id uuid primary key default gen_random_uuid(),work_id uuid not null references public.weekend_work(id),
 action text not null check(action in ('SUBMITTED','APPROVED','REJECTED','CANCELLED')),
 actor_id uuid not null references auth.users(id),occurred_at timestamptz not null default now(),unique(work_id,action)
);
create function public.weekend_work_reviewer(p_employee uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(public.has_app_capability('TEAM_LEAVE_APPROVE') and public.leave_reviewer(p_employee)
 and p_employee is distinct from public.current_employee_id()
 and not exists(select 1 from public.employee e join public.app_memberships m on m.user_id=e.auth_user_id where e.id=p_employee and m.roles @> array['TEAM_LEADER']::text[]),false)
$$;
alter table public.weekend_work enable row level security;
alter table public.weekend_work_event enable row level security;
create policy weekend_work_read on public.weekend_work for select to authenticated using(public.leave_private_scope(employee_id));
create policy weekend_event_read on public.weekend_work_event for select to authenticated using(exists(select 1 from public.weekend_work w where w.id=work_id and public.leave_private_scope(w.employee_id)));
revoke all on public.weekend_work,public.weekend_work_event from anon,authenticated;
grant select on public.weekend_work,public.weekend_work_event to authenticated;
create function public.weekend_work_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='weekend_work_event' or tg_op='DELETE' or old.status<>'PENDING' then raise exception 'IMMUTABLE_WEEKEND_EVIDENCE' using errcode='23514';end if;
 if (to_jsonb(new)-array['status','version','decided_at','decided_by','net_minutes','indicative_days']) is distinct from (to_jsonb(old)-array['status','version','decided_at','decided_by','net_minutes','indicative_days']) then raise exception 'IMMUTABLE_WEEKEND_EVIDENCE' using errcode='23514';end if;
 return new;
end $$;
create trigger weekend_immutable before update or delete on public.weekend_work for each row execute function public.weekend_work_immutable();
create trigger weekend_event_immutable before update or delete on public.weekend_work_event for each row execute function public.weekend_work_immutable();
create function public.submit_weekend_work(p_id uuid,p_day date,p_start int,p_end int,p_break int,p_project uuid,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=public.current_employee_id(); r public.weekend_work;
begin
 if not public.has_app_capability('EMPLOYEE_ACCESS') or owner_id is null then raise exception 'Denied' using errcode='42501';end if;
 perform 1 from public.employee where id=owner_id and employment_status='ACTIVE' and hire_date<=p_day for update;
 if not found then raise exception 'INVALID_EMPLOYEE_DATE' using errcode='23514';end if;
 if p_day is null or p_day>public.leave_today() or extract(isodow from p_day) not in (6,7) then raise exception 'INVALID_WEEKEND_DATE' using errcode='23514';end if;
 select * into r from public.weekend_work where id=p_id;
 if found then
  if r.employee_id=owner_id and r.work_date=p_day and r.start_minute=p_start and r.end_minute=p_end and r.break_minutes=p_break and r.project_id is not distinct from p_project and r.reason=p_reason then return p_id;end if;
  raise exception 'Denied' using errcode='42501';
 end if;
 if p_project is not null and not exists(select 1 from public.project_assignment a where a.employee_id=owner_id and a.project_id=p_project and a.start_date<=p_day and (a.end_date is null or a.end_date>=p_day)) then raise exception 'INVALID_OWN_PROJECT' using errcode='42501';end if;
 if exists(select 1 from public.weekend_work where employee_id=owner_id and work_date=p_day and status in ('PENDING','APPROVED')) then raise exception 'DUPLICATE_WEEKEND_DAY' using errcode='23514';end if;
 insert into public.weekend_work(id,employee_id,work_date,start_minute,end_minute,break_minutes,project_id,reason) values(p_id,owner_id,p_day,p_start,p_end,p_break,p_project,p_reason);
 insert into public.weekend_work_event(work_id,action,actor_id) values(p_id,'SUBMITTED',auth.uid());return p_id;
end $$;
create function public.decide_weekend_work(p_id uuid,p_version int,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare r public.weekend_work;
begin
 if not public.has_app_capability('EMPLOYEE_ACCESS') then raise exception 'Denied' using errcode='42501';end if;
 select * into r from public.weekend_work where id=p_id for update;
 if not found then raise exception 'Denied' using errcode='42501';end if;
 if p_action='CANCELLED' then
  if r.employee_id is distinct from public.current_employee_id() then raise exception 'Denied' using errcode='42501';end if;
 elsif p_action in ('APPROVED','REJECTED') then
  if not public.weekend_work_reviewer(r.employee_id) then raise exception 'Denied' using errcode='42501';end if;
 else raise exception 'INVALID_ACTION' using errcode='23514';end if;
 if r.status=p_action and r.version=p_version+1 and r.decided_by=auth.uid() then return;end if;
 if r.version is distinct from p_version then raise exception 'STALE_WEEKEND_WORK' using errcode='40001';end if;
 if r.status<>'PENDING' then raise exception 'INVALID_STATE' using errcode='23514';end if;
 if p_action='APPROVED' and not exists(select 1 from public.employee where id=r.employee_id and employment_status='ACTIVE') then raise exception 'INACTIVE_EMPLOYEE' using errcode='23514';end if;
 update public.weekend_work set status=p_action,version=version+1,decided_by=auth.uid(),decided_at=now() where id=p_id;
 insert into public.weekend_work_event(work_id,action,actor_id) values(p_id,p_action,auth.uid());
 -- Deliberately no leave_ledger/leave_account mutation. Policy gate documented in Issue #35.
end $$;
revoke all on function public.weekend_work_reviewer(uuid),public.weekend_work_immutable(),public.submit_weekend_work(uuid,date,int,int,int,uuid,text),public.decide_weekend_work(uuid,int,text) from public,anon,authenticated;
grant execute on function public.weekend_work_reviewer(uuid),public.submit_weekend_work(uuid,date,int,int,int,uuid,text),public.decide_weekend_work(uuid,int,text) to authenticated;
commit;
