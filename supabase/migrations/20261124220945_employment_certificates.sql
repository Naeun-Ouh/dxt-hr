begin;
create or replace function public.has_app_capability(requested text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.app_memberships m where m.user_id=auth.uid() and m.status='ACTIVE'
 and not exists(select 1 from public.employee e where e.auth_user_id=m.user_id and e.employment_status='INACTIVE')
 and case requested when 'EMPLOYEE_ACCESS' then cardinality(m.roles)>0
 when 'HR_CERTIFICATE_MANAGE' then m.roles && array['ADMIN','CEO']::text[]
 when 'EMPLOYMENT_CONTRACT_MANAGE' then m.roles && array['ADMIN','CEO']::text[]
 when 'EMPLOYMENT_CONTRACT_PRIVATE_ACCESS' then m.roles @> array['CEO']::text[] or (m.roles @> array['ADMIN']::text[] and m.capabilities @> array['PRIVATE_HR_ACCESS']::text[])
 when 'EMPLOYMENT_CONTRACT_COMPANY_SIGN' then m.roles @> array['CEO']::text[]
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

create table public.hr_certificate_setting (
 singleton boolean primary key default true check(singleton), address text not null default '' check(length(address)<=300),
 registration_number text not null default '' check(length(registration_number)<=30), updated_at timestamptz not null default now()
);
insert into public.hr_certificate_setting default values;
create table public.hr_certificate (
 id uuid primary key, employee_id uuid not null references public.employee(id),
 purpose text not null check(length(btrim(purpose)) between 1 and 200), note text not null default '' check(length(note)<=1000),
 language text not null default 'KO' check(language='KO'), status text not null default 'REQUESTED' check(status in('REQUESTED','APPROVED','ISSUED','REJECTED','CANCELLED')),
 requested_at timestamptz not null default now(), reviewed_at timestamptz, reviewed_by uuid references auth.users(id),
 rejection_reason text check(length(rejection_reason) between 1 and 1000), snapshot jsonb, seal_id uuid references public.company_seal(id),
 issued_at timestamptz, pdf_path text unique, pdf_sha256 text check(pdf_sha256 ~ '^[a-f0-9]{64}$'),
 check((status in('APPROVED','ISSUED'))=(snapshot is not null and seal_id is not null)),
 check((status='ISSUED')=(issued_at is not null and pdf_path is not null and pdf_sha256 is not null)),
 check(pdf_path is null or pdf_path like id::text||'/%'), check((status='REJECTED')=(rejection_reason is not null))
);
create index hr_certificate_employee on public.hr_certificate(employee_id,requested_at);
create table public.hr_certificate_event (
 id uuid primary key default gen_random_uuid(),certificate_id uuid not null references public.hr_certificate(id),
 action text not null check(action in('REQUESTED','APPROVED','ISSUED','REJECTED','CANCELLED','DOWNLOADED')),
 actor_id uuid not null references auth.users(id),occurred_at timestamptz not null default now()
);
alter table public.hr_certificate enable row level security;
alter table public.hr_certificate_event enable row level security;
alter table public.hr_certificate_setting enable row level security;
create policy certificate_read on public.hr_certificate for select to authenticated using(public.has_app_capability('EMPLOYEE_ACCESS') and (employee_id=public.current_employee_id() or public.has_app_capability('HR_CERTIFICATE_MANAGE')));
create policy certificate_event_read on public.hr_certificate_event for select to authenticated using(exists(select 1 from public.hr_certificate c where c.id=certificate_id));
create policy certificate_setting_read on public.hr_certificate_setting for select to authenticated using(public.has_app_capability('HR_CERTIFICATE_MANAGE'));
revoke all on public.hr_certificate,public.hr_certificate_event,public.hr_certificate_setting from anon,authenticated;
grant select on public.hr_certificate,public.hr_certificate_event,public.hr_certificate_setting to authenticated;
grant select on public.hr_certificate to service_role;
create trigger certificate_event_immutable before update or delete on public.hr_certificate_event for each row execute function public.contract_immutable();
create function private.guard_certificate() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' or old.status in('ISSUED','REJECTED','CANCELLED') then raise exception 'IMMUTABLE_CERTIFICATE';end if;
 if (to_jsonb(new)-array['status','reviewed_at','reviewed_by','rejection_reason','snapshot','seal_id','issued_at','pdf_path','pdf_sha256']) is distinct from (to_jsonb(old)-array['status','reviewed_at','reviewed_by','rejection_reason','snapshot','seal_id','issued_at','pdf_path','pdf_sha256']) then raise exception 'IMMUTABLE_REQUEST';end if;
 if old.status='APPROVED' and (new.status<>'ISSUED' or (to_jsonb(new)-array['status','issued_at','pdf_path','pdf_sha256']) is distinct from (to_jsonb(old)-array['status','issued_at','pdf_path','pdf_sha256'])) then raise exception 'IMMUTABLE_APPROVAL';end if;
 return new;
end $$;
create trigger certificate_guard before update or delete on public.hr_certificate for each row execute function private.guard_certificate();
create function public.request_hr_certificate(p_id uuid,p_purpose text,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare owner uuid:=public.current_employee_id(); existing public.hr_certificate;
begin
 if owner is null or not public.has_app_capability('EMPLOYEE_ACCESS') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into existing from public.hr_certificate where id=p_id;
 if found then
  if existing.employee_id<>owner or existing.purpose<>btrim(p_purpose) or existing.note<>coalesce(p_note,'') then raise exception 'CONFLICT';end if;
  return p_id;
 end if;
 insert into public.hr_certificate(id,employee_id,purpose,note) values(p_id,owner,btrim(p_purpose),coalesce(p_note,''));
 insert into public.hr_certificate_event(certificate_id,action,actor_id) values(p_id,'REQUESTED',auth.uid());return p_id;
end $$;
create function public.review_hr_certificate(p_id uuid,p_action text,p_reason text default '') returns void language plpgsql security definer set search_path='' as $$
declare c public.hr_certificate;e public.employee;s public.company_seal;settings public.hr_certificate_setting;dept text;
begin
 if not public.has_app_capability('HR_CERTIFICATE_MANAGE') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into c from public.hr_certificate where id=p_id for update;
 if not found or p_action not in('APPROVED','REJECTED') then raise exception 'INVALID_REQUEST';end if;
 if c.status=p_action or (p_action='APPROVED' and c.status='ISSUED') then return;end if;
 if c.status<>'REQUESTED' then raise exception 'INVALID_STATE';end if;
 if p_action='REJECTED' then
  update public.hr_certificate set status=p_action,reviewed_at=now(),reviewed_by=auth.uid(),rejection_reason=nullif(btrim(p_reason),'') where id=p_id;
 else
  select * into e from public.employee where id=c.employee_id for share;
  if e.employment_status<>'ACTIVE' or e.hire_date>(now() at time zone 'Asia/Seoul')::date then raise exception 'NOT_EMPLOYED';end if;
  perform pg_advisory_xact_lock(782431,1);
  select * into s from public.company_seal where active and ready;
  if not found then raise exception 'ACTIVE_SEAL_REQUIRED';end if;
  select name into dept from public.organization where id=e.department_id;
  select * into settings from public.hr_certificate_setting where singleton;
  update public.hr_certificate set status=p_action,reviewed_at=now(),reviewed_by=auth.uid(),seal_id=s.id,
   snapshot=jsonb_build_object('name',e.name,'department',coalesce(dept,''),'title',e.title,'hire_date',e.hire_date,'employment_status',e.employment_status,
   'company_name',s.company_name,'representative_name',s.representative_name,'address',settings.address,'registration_number',settings.registration_number,'issue_date',(now() at time zone 'Asia/Seoul')::date)
   where id=p_id;
 end if;
 insert into public.hr_certificate_event(certificate_id,action,actor_id) values(p_id,p_action,auth.uid());
end $$;
create function public.cancel_hr_certificate(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.hr_certificate;
begin
 select * into c from public.hr_certificate where id=p_id for update;
 if not found or not public.has_app_capability('EMPLOYEE_ACCESS') or c.employee_id is distinct from public.current_employee_id() then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if c.status='CANCELLED' then return;end if;
 if c.status<>'REQUESTED' then raise exception 'INVALID_STATE';end if;
 update public.hr_certificate set status='CANCELLED' where id=p_id;
 insert into public.hr_certificate_event(certificate_id,action,actor_id) values(p_id,'CANCELLED',auth.uid());
end $$;
create function public.finish_hr_certificate(p_id uuid,p_path text,p_hash text) returns void language plpgsql security definer set search_path='' as $$
declare c public.hr_certificate;
begin
 select * into c from public.hr_certificate where id=p_id for update;
 if not found then raise exception 'NOT_FOUND';end if;
 if c.status='ISSUED' then return;end if;
 if c.status<>'APPROVED' or not exists(select 1 from storage.objects where bucket_id='hr-certificates' and name=p_path) then raise exception 'INVALID_STATE';end if;
 update public.hr_certificate set status='ISSUED',pdf_path=p_path,pdf_sha256=p_hash,issued_at=now() where id=p_id;
 insert into public.hr_certificate_event(certificate_id,action,actor_id) values(p_id,'ISSUED',c.reviewed_by);
end $$;
create function public.record_hr_certificate_download(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.has_app_capability('EMPLOYEE_ACCESS') or not exists(select 1 from public.hr_certificate where id=p_id and status='ISSUED' and (employee_id=public.current_employee_id() or public.has_app_capability('HR_CERTIFICATE_MANAGE'))) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 insert into public.hr_certificate_event(certificate_id,action,actor_id) values(p_id,'DOWNLOADED',auth.uid());
end $$;
create function public.save_hr_certificate_setting(p_address text,p_registration text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.has_app_capability('HR_CERTIFICATE_MANAGE') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 update public.hr_certificate_setting set address=btrim(p_address),registration_number=btrim(p_registration),updated_at=now() where singleton;
 insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),'UPDATE','hr_certificate_setting','00000000-0000-4000-8000-000000000032');
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('hr-certificates','hr-certificates',false,20971520,array['application/pdf']);
-- No authenticated Storage policies: server reauthorizes every download.
revoke all on function private.guard_certificate(),public.request_hr_certificate(uuid,text,text),public.review_hr_certificate(uuid,text,text),public.cancel_hr_certificate(uuid),public.finish_hr_certificate(uuid,text,text),public.record_hr_certificate_download(uuid),public.save_hr_certificate_setting(text,text) from public,anon,authenticated;
grant execute on function public.request_hr_certificate(uuid,text,text),public.review_hr_certificate(uuid,text,text),public.cancel_hr_certificate(uuid),public.record_hr_certificate_download(uuid),public.save_hr_certificate_setting(text,text) to authenticated;
grant execute on function public.finish_hr_certificate(uuid,text,text) to service_role;
commit;
