begin;
create schema if not exists private;
-- Candidate evidence/review only. Never grants, expires or transfers leave balances.
create table public.leave_carryover_case (
 id uuid primary key default gen_random_uuid(),employee_id uuid not null references public.employee(id),
 year int not null check(year between 1900 and 9998),state text not null default 'NEEDS_REVIEW' check(state in('NEEDS_REVIEW','CONFIRMED','NOT_ELIGIBLE')),
 project_end date not null,version int not null default 1 check(version>0),
 captured_at timestamptz not null default now(),reviewed_at timestamptz,
 unique(employee_id,year),check(project_end>=make_date(year,11,30))
);
create table public.leave_carryover_evidence (
 id uuid primary key default gen_random_uuid(),case_id uuid not null references public.leave_carryover_case(id),version int not null,
 mode text not null check(mode in('NOV30_SNAPSHOT','MANUAL_RECONCILIATION')),snapshot jsonb not null,
 actor_id uuid not null references auth.users(id),captured_at timestamptz not null default now(),unique(case_id,version)
);
create table public.leave_carryover_review_event (
 id uuid primary key default gen_random_uuid(),case_id uuid not null references public.leave_carryover_case(id),version int not null,
 state text not null check(state in('CONFIRMED','NOT_ELIGIBLE','NEEDS_REVIEW')),note text not null check(length(btrim(note)) between 1 and 1000),
 actor_id uuid not null references auth.users(id),occurred_at timestamptz not null default now(),unique(case_id,version)
);
alter table public.leave_carryover_case enable row level security;
alter table public.leave_carryover_evidence enable row level security;
alter table public.leave_carryover_review_event enable row level security;
create policy carryover_case_read on public.leave_carryover_case for select to authenticated using(public.has_app_capability('EMPLOYEE_ACCESS') and (employee_id=public.current_employee_id() or public.has_app_capability('LEAVE_MANAGE')));
create policy carryover_evidence_read on public.leave_carryover_evidence for select to authenticated using(public.has_app_capability('LEAVE_MANAGE'));
create policy carryover_review_read on public.leave_carryover_review_event for select to authenticated using(public.has_app_capability('LEAVE_MANAGE'));
revoke all on public.leave_carryover_case,public.leave_carryover_evidence,public.leave_carryover_review_event from anon,authenticated;
grant select on public.leave_carryover_case,public.leave_carryover_evidence,public.leave_carryover_review_event to authenticated;
create function private.carryover_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'IMMUTABLE_CARRYOVER_EVIDENCE';end $$;
create trigger carryover_evidence_immutable before update or delete on public.leave_carryover_evidence for each row execute function private.carryover_immutable();
create trigger carryover_review_immutable before update or delete on public.leave_carryover_review_event for each row execute function private.carryover_immutable();
create function public.capture_carryover_evidence(p_employee uuid,p_year int,p_mode text,p_source text,p_end date,p_version int,p_verified boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare cutoff date;today date:=public.leave_today();c public.leave_carryover_case;data jsonb;end_date date;employee_snapshot public.employee;
begin
 if not public.has_app_capability('LEAVE_MANAGE') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p_year is null or p_year not between 1900 and 9998 or p_version is null or p_version<0 then raise exception 'INVALID_INPUT';end if;
 cutoff:=make_date(p_year,11,30);
 if today<cutoff then raise exception 'NOV30_NOT_REACHED';end if;
 if not exists(select 1 from public.employee where id=p_employee) then raise exception 'INVALID_EMPLOYEE';end if;
 perform pg_advisory_xact_lock(hashtextextended('carryover:'||p_employee::text||':'||p_year::text,0));
 select * into c from public.leave_carryover_case where employee_id=p_employee and year=p_year for update;
 if coalesce(c.version,0)<>p_version then raise exception 'STALE_CARRYOVER';end if;
 if p_mode='NOV30_SNAPSHOT' then
  if today<>cutoff then raise exception 'HISTORICAL_SOURCE_REQUIRED';end if;
  select * into employee_snapshot from public.employee where id=p_employee for share;
  if employee_snapshot.employment_status is distinct from 'ACTIVE' then raise exception 'INACTIVE_EMPLOYEE';end if;
  if employee_snapshot.hire_date is null or employee_snapshot.hire_date>cutoff then raise exception 'EMPLOYEE_NOT_HIRED_AT_CUTOFF';end if;
  select jsonb_agg(jsonb_build_object('assignment_id',a.id,'project_id',p.id,'project_name',p.name,'customer_name',p.customer_name,'assignment_start',a.start_date,'assignment_end',a.end_date,'project_end',p.current_end_date,'assignment_version',a.version,'project_version',p.version) order by a.id),max(p.current_end_date)
   into data,end_date from public.project_assignment a join public.project p on p.id=a.project_id
   where a.employee_id=p_employee and a.status='ACTIVE' and p.status='ACTIVE' and a.start_date<=cutoff and a.end_date>=cutoff and p.start_date<=cutoff and p.current_end_date>=cutoff;
  if data is null then raise exception 'NO_QUALIFYING_ASSIGNMENT';end if;
  data:=jsonb_build_object('as_of',cutoff,'employee',jsonb_build_object('id',employee_snapshot.id,'hire_date',employee_snapshot.hire_date,'employment_status',employee_snapshot.employment_status,'version',employee_snapshot.version),'assignments',data,'basis','Observed on November 30; project domain is paid external customer work');
 elsif p_mode='MANUAL_RECONCILIATION' then
  if p_verified is distinct from true or p_source is null or length(btrim(p_source)) not between 5 and 1000 or p_end is null or not isfinite(p_end) or p_end<cutoff then raise exception 'DATED_SOURCE_REQUIRED';end if;
  end_date:=p_end;data:=jsonb_build_object('as_of',cutoff,'source_reference',btrim(p_source),'verified_project_end',p_end,'basis','Manager verified dated source; current ACTIVE state is not historical evidence');
 else raise exception 'INVALID_MODE';end if;
 if c.id is null then
  insert into public.leave_carryover_case(employee_id,year,project_end) values(p_employee,p_year,end_date) returning * into c;
 else
  update public.leave_carryover_case set state='NEEDS_REVIEW',project_end=end_date,version=version+1,captured_at=now(),reviewed_at=null where id=c.id returning * into c;
 end if;
 insert into public.leave_carryover_evidence(case_id,version,mode,snapshot,actor_id) values(c.id,c.version,p_mode,data,auth.uid());
 return c.id;
end $$;
create function public.review_carryover_candidate(p_id uuid,p_version int,p_state text,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare c public.leave_carryover_case;
begin
 if not public.has_app_capability('LEAVE_MANAGE') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into c from public.leave_carryover_case where id=p_id for update;
 if not found or c.version is distinct from p_version then raise exception 'STALE_CARRYOVER';end if;
 if p_state is null or p_state not in('CONFIRMED','NOT_ELIGIBLE','NEEDS_REVIEW') or p_note is null or length(btrim(p_note)) not between 1 and 1000 then raise exception 'INVALID_REVIEW';end if;
 update public.leave_carryover_case set state=p_state,version=version+1,reviewed_at=now() where id=p_id;
 insert into public.leave_carryover_review_event(case_id,version,state,note,actor_id) values(p_id,c.version+1,p_state,btrim(p_note),auth.uid());
end $$;
revoke all on function private.carryover_immutable(),public.capture_carryover_evidence(uuid,int,text,text,date,int,boolean),public.review_carryover_candidate(uuid,int,text,text) from public,anon,authenticated;
grant execute on function public.capture_carryover_evidence(uuid,int,text,text,date,int,boolean),public.review_carryover_candidate(uuid,int,text,text) to authenticated;
commit;
