begin;
-- Deliberate company-benefit operations; never statutory wage substitution or a scheduled job.
create table public.leave_benefit_operation (
 id uuid primary key, employee_id uuid not null references public.employee(id),
 kind text not null check(kind in ('WEEKEND','CARRYOVER')),
 work_id uuid unique references public.weekend_work(id), case_id uuid references public.leave_carryover_case(id),
 from_source uuid unique references public.leave_source(id), to_source uuid not null unique references public.leave_source(id),
 days numeric not null check(days>0), plan jsonb not null, reason text not null check(length(trim(reason)) between 5 and 1000),
 actor_id uuid not null references auth.users(id), occurred_at timestamptz not null default now(),
 check((kind='WEEKEND' and work_id is not null and case_id is null and from_source is null) or (kind='CARRYOVER' and work_id is null and case_id is not null and from_source is not null))
);
create table public.leave_benefit_reversal (
 operation_id uuid primary key references public.leave_benefit_operation(id),
 reason text not null check(length(trim(reason)) between 5 and 1000),actor_id uuid not null references auth.users(id),occurred_at timestamptz not null default now()
);
alter table public.leave_benefit_operation enable row level security;
alter table public.leave_benefit_reversal enable row level security;
revoke all on public.leave_benefit_operation,public.leave_benefit_reversal from public,anon,authenticated;
grant select on public.leave_benefit_operation,public.leave_benefit_reversal to authenticated;
-- Operational evidence/notes are manager-only; employees retain own source/ledger access.
create policy benefit_operation_read on public.leave_benefit_operation for select to authenticated using(public.has_app_capability('LEAVE_MANAGE'));
create policy benefit_reversal_read on public.leave_benefit_reversal for select to authenticated using(public.has_app_capability('LEAVE_MANAGE'));
create trigger benefit_operation_immutable before update or delete on public.leave_benefit_operation for each row execute function public.leave_immutable_row();
create trigger benefit_reversal_immutable before update or delete on public.leave_benefit_reversal for each row execute function public.leave_immutable_row();

create function public.preview_leave_benefit(p_kind text,p_reference uuid,p_source uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w public.weekend_work;c public.leave_carryover_case;s public.leave_source;v public.leave_source_validity;eid uuid;y int;amount numeric;versions jsonb;details jsonb;
begin
 if not public.has_app_capability('LEAVE_MANAGE') then raise exception 'Denied' using errcode='42501';end if;
 if p_kind='WEEKEND' then
  select * into w from public.weekend_work where id=p_reference;
  if w.id is null or w.status<>'APPROVED' or w.indicative_days<=0 or p_source is not null then raise exception 'APPROVED_WORK_REQUIRED' using errcode='23514';end if;
  if exists(select 1 from public.leave_benefit_operation where work_id=w.id) then raise exception 'BENEFIT_ALREADY_LINKED' using errcode='23514';end if;
  eid:=w.employee_id;y:=extract(year from w.work_date);amount:=w.indicative_days;
  if exists(select 1 from public.leave_source x where x.employee_id=eid and x.year=y and x.bucket='SUBSTITUTE'
   and exists(select 1 from public.leave_ledger l where l.source_id=x.id and l.amount_delta>0)
   and not exists(select 1 from public.leave_benefit_operation o where o.to_source=x.id)) then raise exception 'PRIOR_SUBSTITUTE_MAPPING_REQUIRED' using errcode='23514';end if;
  -- No retroactive recreation of expired benefits through a new year.
  if extract(year from public.leave_today())<>y then raise exception 'EXPIRED_WORK_REVIEW_REQUIRED' using errcode='23514';end if;
  details:=jsonb_build_object('work_version',w.version,'work_date',w.work_date,'net_minutes',w.net_minutes,'classification','COMPANY_BENEFIT_NO_WAGE_OFFSET');
 elsif p_kind='CARRYOVER' then
  select * into c from public.leave_carryover_case where id=p_reference;
  select * into s from public.leave_source where id=p_source;
  select * into v from public.leave_source_validity where source_id=p_source;
  if c.id is null or c.state<>'CONFIRMED' or s.employee_id is distinct from c.employee_id or s.bucket not in ('ANNUAL','SUBSTITUTE') or v.receiving_year is distinct from c.year or v.valid_until is distinct from make_date(c.year,12,31) then raise exception 'CONFIRMED_CARRYOVER_SOURCE_REQUIRED' using errcode='23514';end if;
  if public.leave_today()<make_date(c.year+1,1,1) or public.leave_today()>make_date(c.year+1,12,31) then raise exception 'YEAR_END_NOT_RECONCILED' using errcode='23514';end if;
  if exists(select 1 from public.leave_benefit_operation where from_source=s.id) then raise exception 'BENEFIT_ALREADY_LINKED' using errcode='23514';end if;
  if exists(select 1 from public.leave_request where employee_id=c.employee_id and status='PENDING' and start_date<=make_date(c.year,12,31)) then raise exception 'PENDING_YEAR_END_REQUESTS' using errcode='23514';end if;
  if exists(select 1 from public.leave_source x left join public.leave_source_validity xv on xv.source_id=x.id where x.employee_id=c.employee_id and x.year=c.year and xv.source_id is null and public.leave_source_balance(x.id)<>0) then raise exception 'UNVERIFIED_OPENING_BALANCE' using errcode='23514';end if;
  -- Do not infer a historical Dec31 balance from later manual imports/corrections.
  if exists(select 1 from public.leave_ledger where source_id=s.id and (occurred_at at time zone 'Asia/Seoul')::date>make_date(c.year,12,31)) then raise exception 'POST_CUTOFF_ADJUSTMENT_REVIEW_REQUIRED' using errcode='23514';end if;
  eid:=c.employee_id;y:=c.year+1;amount:=public.leave_source_balance(s.id);
  if amount<=0 then raise exception 'NO_REMAINDER' using errcode='23514';end if;
  details:=jsonb_build_object('case_version',c.version,'project_end',c.project_end,'cutoff',make_date(c.year,12,31),'from_year',s.year,'from_bucket',s.bucket,'from_balance',amount,'evidence_version',(select max(version) from public.leave_carryover_evidence where case_id=c.id));
 else raise exception 'INVALID_BENEFIT_KIND' using errcode='23514';end if;
 if not exists(select 1 from public.employee where id=eid and employment_status='ACTIVE') then raise exception 'INACTIVE_EMPLOYEE_REVIEW_REQUIRED' using errcode='23514';end if;
 select coalesce(jsonb_object_agg(year::text,version),'{}') into versions from public.leave_account where employee_id=eid and bucket='ANNUAL';
 return jsonb_build_object('kind',p_kind,'reference',p_reference,'source',p_source,'employee_id',eid,'year',y,'days',amount,'valid_from',make_date(y,1,1),'valid_until',make_date(y,12,31),'versions',versions,'details',details,'as_of',public.leave_today(),'policy','DXT-BENEFIT-2026-11');
end $$;

create function public.apply_leave_benefit(p_id uuid,p_plan jsonb,p_reason text,p_reconciled boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare old public.leave_benefit_operation;fresh jsonb;eid uuid;sid uuid:=gen_random_uuid();ref uuid;src uuid;y int;amount numeric;b text;ver int;
begin
 if not public.has_app_capability('LEAVE_MANAGE') then raise exception 'Denied' using errcode='42501';end if;
 if p_reconciled is distinct from true or p_id is null or p_reason is null or length(trim(p_reason)) not between 5 and 1000 or jsonb_typeof(p_plan) is distinct from 'object' then raise exception 'RECONCILIATION_REQUIRED' using errcode='23514';end if;
 ref:=(p_plan->>'reference')::uuid;src:=(p_plan->>'source')::uuid;
 -- Derive employee from persisted evidence, never from caller employee_id.
 if p_plan->>'kind'='WEEKEND' then select employee_id into eid from public.weekend_work where id=ref;
 elsif p_plan->>'kind'='CARRYOVER' then select employee_id into eid from public.leave_carryover_case where id=ref;
 else raise exception 'INVALID_BENEFIT_KIND';end if;
 if eid is null then raise exception 'Denied' using errcode='42501';end if;
 -- Carryover capture takes this advisory lock before case/employee locks; use same order.
 if p_plan->>'kind'='CARRYOVER' then perform pg_advisory_xact_lock(hashtextextended('carryover:'||eid::text||':'||(select year::text from public.leave_carryover_case where id=ref),0));end if;
 perform 1 from public.employee where id=eid for update;
 if p_plan->>'kind'='WEEKEND' then perform 1 from public.weekend_work where id=ref for update;
 else perform 1 from public.leave_carryover_case where id=ref for update;end if;
 select * into old from public.leave_benefit_operation where id=p_id;
 if found then
  if old.employee_id=eid and old.plan=p_plan and old.reason=trim(p_reason) and old.actor_id=auth.uid() then return old.to_source;end if;
  raise exception 'BENEFIT_REPLAY_MISMATCH' using errcode='23514';
 end if;
 fresh:=public.preview_leave_benefit(p_plan->>'kind',ref,src);
 if fresh is distinct from p_plan then raise exception 'STALE_BENEFIT_PREVIEW' using errcode='40001';end if;
 y:=(fresh->>'year')::int;amount:=(fresh->>'days')::numeric;b:=case when fresh->>'kind'='WEEKEND' then 'SUBSTITUTE' else 'CARRYOVER' end;
 insert into public.leave_account(employee_id,year,bucket) values(eid,y,'ANNUAL') on conflict do nothing;
 select version into ver from public.leave_account where employee_id=eid and year=y and bucket='ANNUAL';
 perform public.grant_leave_source(sid,eid,y,b,amount,case when b='SUBSTITUTE' then '주말근무 복리후생 대휴 · 임금 대체 아님' else '확정된 연말 잔여분 이월' end,ver);
 if src is not null then
  insert into public.leave_ledger(employee_id,year,bucket,source_id,amount_delta,event_type,actor_id,note)
   select employee_id,year,bucket,id,-amount,'ADJUSTMENT',auth.uid(),'다음 회계연도로 이월 · 기존 사용 이력 보존' from public.leave_source where id=src;
  update public.leave_account set version=version+1 where employee_id=eid and year=(fresh->'details'->>'from_year')::int;
 end if;
 insert into public.leave_benefit_operation(id,employee_id,kind,work_id,case_id,from_source,to_source,days,plan,reason,actor_id)
 values(p_id,eid,fresh->>'kind',case when b='SUBSTITUTE' then ref end,case when b='CARRYOVER' then ref end,src,sid,amount,fresh,trim(p_reason),auth.uid());
 return sid;
end $$;

-- A reversal is a compensating transaction; the original operation/source/evidence remain.
create function public.reverse_leave_benefit(p_operation uuid,p_version int,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare o public.leave_benefit_operation;s public.leave_source;r public.leave_benefit_reversal;v int;
begin
 if not public.has_app_capability('LEAVE_MANAGE') then raise exception 'Denied' using errcode='42501';end if;
 if p_reason is null or length(trim(p_reason)) not between 5 and 1000 then raise exception 'REASON_REQUIRED';end if;
 select * into o from public.leave_benefit_operation where id=p_operation;if o.id is null then raise exception 'Denied' using errcode='42501';end if;
 perform 1 from public.employee where id=o.employee_id for update;
 select * into r from public.leave_benefit_reversal where operation_id=p_operation;
 if found then
  if r.actor_id=auth.uid() and r.reason=trim(p_reason) then return;end if;raise exception 'REVERSAL_REPLAY_MISMATCH';
 end if;
 select * into s from public.leave_source where id=o.to_source;
 select version into v from public.leave_account where employee_id=o.employee_id and year=s.year and bucket='ANNUAL';
 if v is distinct from p_version then raise exception 'STALE_LEAVE' using errcode='40001';end if;
 if public.leave_source_balance(s.id)<>o.days or exists(select 1 from public.leave_benefit_operation where from_source=s.id) then raise exception 'BENEFIT_ALREADY_USED_REVIEW_REQUIRED' using errcode='23514';end if;
 insert into public.leave_ledger(employee_id,year,bucket,source_id,amount_delta,event_type,actor_id,note) values(o.employee_id,s.year,s.bucket,s.id,-o.days,'ADJUSTMENT',auth.uid(),'대휴/이월 지급 정정 · 원본 보존');
 if o.from_source is not null then
  insert into public.leave_ledger(employee_id,year,bucket,source_id,amount_delta,event_type,actor_id,note)
  select employee_id,year,bucket,id,o.days,'ADJUSTMENT',auth.uid(),'이월 정정 · 원래 유효기간으로 복원' from public.leave_source where id=o.from_source;
 end if;
 insert into public.leave_benefit_reversal(operation_id,reason,actor_id) values(o.id,trim(p_reason),auth.uid());
 update public.leave_account set version=version+1 where employee_id=o.employee_id;
end $$;
revoke all on function public.preview_leave_benefit(text,uuid,uuid),public.apply_leave_benefit(uuid,jsonb,text,boolean),public.reverse_leave_benefit(uuid,int,text) from public,anon,authenticated;
grant execute on function public.preview_leave_benefit(text,uuid,uuid),public.apply_leave_benefit(uuid,jsonb,text,boolean),public.reverse_leave_benefit(uuid,int,text) to authenticated;
-- Approved evidence cancellation retains the original minutes and the full event trail.
create table public.weekend_work_void (
 work_id uuid primary key references public.weekend_work(id),reason text not null check(length(trim(reason)) between 5 and 1000),
 actor_id uuid not null references auth.users(id),occurred_at timestamptz not null default now()
);
alter table public.weekend_work_void enable row level security;
revoke all on public.weekend_work_void from public,anon,authenticated;
grant select on public.weekend_work_void to authenticated;
create policy weekend_void_read on public.weekend_work_void for select to authenticated using(public.has_app_capability('LEAVE_MANAGE'));
create trigger weekend_void_immutable before update or delete on public.weekend_work_void for each row execute function public.leave_immutable_row();
create or replace function public.weekend_work_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='weekend_work_event' or tg_op='DELETE' then raise exception 'IMMUTABLE_WEEKEND_EVIDENCE' using errcode='23514';end if;
 if old.status<>'PENDING' and not (old.status='APPROVED' and new.status='CANCELLED' and exists(select 1 from public.weekend_work_void where work_id=old.id)) then raise exception 'IMMUTABLE_WEEKEND_EVIDENCE' using errcode='23514';end if;
 if (to_jsonb(new)-array['status','version','decided_at','decided_by','net_minutes','indicative_days']) is distinct from (to_jsonb(old)-array['status','version','decided_at','decided_by','net_minutes','indicative_days']) then raise exception 'IMMUTABLE_WEEKEND_EVIDENCE' using errcode='23514';end if;
 return new;
end $$;
create function public.cancel_approved_weekend_work(p_work uuid,p_version int,p_account_version int,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare w public.weekend_work;o public.leave_benefit_operation;r public.weekend_work_void;
begin
 if not public.has_app_capability('LEAVE_MANAGE') then raise exception 'Denied' using errcode='42501';end if;
 if p_reason is null or length(trim(p_reason)) not between 5 and 1000 then raise exception 'REASON_REQUIRED';end if;
 select * into w from public.weekend_work where id=p_work;
 if w.id is null or w.employee_id=public.current_employee_id() then raise exception 'Denied' using errcode='42501';end if;
 perform 1 from public.employee where id=w.employee_id for update;
 select * into w from public.weekend_work where id=p_work for update;
 select * into r from public.weekend_work_void where work_id=p_work;
 if found then if r.actor_id=auth.uid() and r.reason=trim(p_reason) then return;end if;raise exception 'VOID_REPLAY_MISMATCH';end if;
 if w.status<>'APPROVED' or w.version is distinct from p_version then raise exception 'STALE_WEEKEND_WORK' using errcode='40001';end if;
 select * into o from public.leave_benefit_operation where work_id=p_work;
 if found and not exists(select 1 from public.leave_benefit_reversal where operation_id=o.id) then perform public.reverse_leave_benefit(o.id,p_account_version,p_reason);end if;
 insert into public.weekend_work_void(work_id,reason,actor_id) values(p_work,trim(p_reason),auth.uid());
 update public.weekend_work set status='CANCELLED',version=version+1,decided_at=now(),decided_by=auth.uid() where id=p_work;
 insert into public.weekend_work_event(work_id,action,actor_id) values(p_work,'CANCELLED',auth.uid());
end $$;
revoke all on function public.cancel_approved_weekend_work(uuid,int,int,text) from public,anon,authenticated;
grant execute on function public.cancel_approved_weekend_work(uuid,int,int,text) to authenticated;
commit;
