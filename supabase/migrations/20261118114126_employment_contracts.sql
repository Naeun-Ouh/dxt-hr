begin;
create or replace function public.has_app_capability(requested text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.app_memberships m where m.user_id=auth.uid() and m.status='ACTIVE'
 and not exists(select 1 from public.employee e where e.auth_user_id=m.user_id and e.employment_status='INACTIVE')
 and case requested when 'EMPLOYEE_ACCESS' then cardinality(m.roles)>0
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

create table public.employment_contract_template (
 id uuid primary key, name text not null check(length(name) between 1 and 120),
 encrypted_body text not null check(encrypted_body like 'v1.%'), active boolean not null default true,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.employment_contract (
 id uuid primary key, employee_id uuid not null references public.employee(id),
 employee_snapshot jsonb not null, template_id uuid references public.employment_contract_template(id),
 status text not null default 'DRAFT' check(status in ('DRAFT','READY_TO_SEND','SENT','VIEWED','EMPLOYEE_SIGNED','COMPLETED','CANCELLED','DECLINED')),
 current_version int not null default 1 check(current_version>0),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 sent_at timestamptz, first_viewed_at timestamptz, employee_signed_at timestamptz,
 company_signed_at timestamptz, completed_at timestamptz, pdf_path text unique, pdf_sha256 text,
 check((status='COMPLETED')=(completed_at is not null)),
 check(status<>'COMPLETED' or (company_signed_at is not null and employee_signed_at is not null and pdf_path is not null and pdf_sha256 ~ '^[a-f0-9]{64}$'))
);
create table public.employment_contract_version (
 contract_id uuid not null references public.employment_contract(id), version int not null,
 encrypted_body text not null check(encrypted_body like 'v1.%'), body_sha256 text not null check(body_sha256 ~ '^[a-f0-9]{64}$'),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 primary key(contract_id,version)
);
-- Terms are part of the encrypted, versioned document, never duplicated as plaintext salary columns.
create table public.employment_contract_signature (
 contract_id uuid not null, version int not null, party text not null check(party in ('EMPLOYEE','COMPANY')),
 actor_id uuid not null references auth.users(id), signed_at timestamptz not null default now(),
 body_sha256 text not null, evidence text not null default 'authenticated-google-consent-v1',
 primary key(contract_id,party), foreign key(contract_id,version) references public.employment_contract_version(contract_id,version)
);
create table public.employment_contract_event (
 id uuid primary key default gen_random_uuid(), contract_id uuid not null references public.employment_contract(id),
 action text not null, actor_id uuid references auth.users(id), occurred_at timestamptz not null default now()
);
create index employment_contract_employee on public.employment_contract(employee_id);
create index employment_contract_event_contract on public.employment_contract_event(contract_id,occurred_at);
create function public.contract_scope(p_id uuid,p_private boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(exists(select 1 from public.employment_contract c where c.id=p_id and (
 public.has_app_capability(case when p_private then 'EMPLOYMENT_CONTRACT_PRIVATE_ACCESS' else 'EMPLOYMENT_CONTRACT_MANAGE' end)
 or (c.employee_id=public.current_employee_id() and c.sent_at is not null))),false)
$$;
create function public.contract_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'IMMUTABLE_CONTRACT_RECORD' using errcode='42501'; end $$;
create function public.contract_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' or old.status in ('COMPLETED','CANCELLED','DECLINED') or new.employee_id<>old.employee_id or new.employee_snapshot<>old.employee_snapshot or new.created_by<>old.created_by or new.created_at<>old.created_at or new.template_id is distinct from old.template_id then
 raise exception 'IMMUTABLE_CONTRACT' using errcode='42501'; end if;
 return new;
end $$;
create trigger contract_guard before update or delete on public.employment_contract for each row execute function public.contract_guard();
create trigger contract_version_immutable before update or delete on public.employment_contract_version for each row execute function public.contract_immutable();
create trigger contract_signature_immutable before update or delete on public.employment_contract_signature for each row execute function public.contract_immutable();
create trigger contract_event_immutable before update or delete on public.employment_contract_event for each row execute function public.contract_immutable();
create trigger contract_template_immutable before update or delete on public.employment_contract_template for each row execute function public.contract_immutable();
alter table public.employment_contract enable row level security;
alter table public.employment_contract_version enable row level security;
alter table public.employment_contract_template enable row level security;
alter table public.employment_contract_signature enable row level security;
alter table public.employment_contract_event enable row level security;
create policy contract_read on public.employment_contract for select to authenticated using(public.contract_scope(id));
create policy contract_version_read on public.employment_contract_version for select to authenticated using(public.contract_scope(contract_id,true));
create policy contract_template_read on public.employment_contract_template for select to authenticated using(public.has_app_capability('EMPLOYMENT_CONTRACT_PRIVATE_ACCESS'));
create policy contract_signature_read on public.employment_contract_signature for select to authenticated using(public.contract_scope(contract_id,true));
create policy contract_event_read on public.employment_contract_event for select to authenticated using(public.contract_scope(contract_id));
revoke all on public.employment_contract,public.employment_contract_version,public.employment_contract_template,public.employment_contract_signature,public.employment_contract_event from anon,authenticated;
grant select on public.employment_contract,public.employment_contract_version,public.employment_contract_template,public.employment_contract_signature,public.employment_contract_event to authenticated;

create function public.create_contract_template(p_id uuid,p_name text,p_body text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.has_app_capability('EMPLOYMENT_CONTRACT_PRIVATE_ACCESS') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 insert into public.employment_contract_template(id,name,encrypted_body,created_by) values(p_id,p_name,p_body,auth.uid());
end $$;
-- One transaction for an entire individual/bulk batch. Snapshots come exclusively from Employee Master.
create function public.create_employment_contracts(p_items jsonb,p_template uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare item jsonb; e public.employee; snap jsonb; cid uuid;
begin
 if not public.has_app_capability('EMPLOYMENT_CONTRACT_PRIVATE_ACCESS') or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 for item in select * from jsonb_array_elements(p_items) loop
  cid:=(item->>'id')::uuid;
  select * into e from public.employee where id=(item->>'employee_id')::uuid and employment_status='ACTIVE' for share;
  if not found then raise exception 'INVALID_EMPLOYEE'; end if;
  snap:=jsonb_build_object('name',e.name,'department',(select name from public.organization where id=e.department_id),'title',e.title,'email',e.company_email,'hire_date',e.hire_date);
  insert into public.employment_contract(id,employee_id,employee_snapshot,template_id,created_by) values(cid,e.id,snap,p_template,auth.uid());
  insert into public.employment_contract_version(contract_id,version,encrypted_body,body_sha256,created_by) values(cid,1,item->>'body',item->>'hash',auth.uid());
  insert into public.employment_contract_event(contract_id,action,actor_id) values(cid,'CREATED',auth.uid());
 end loop;
end $$;
create function public.revise_employment_contract(p_id uuid,p_version int,p_body text,p_hash text) returns void language plpgsql security definer set search_path='' as $$
declare c public.employment_contract;
begin
 if not public.has_app_capability('EMPLOYMENT_CONTRACT_PRIVATE_ACCESS') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into c from public.employment_contract where id=p_id for update;
 if not found or c.current_version is distinct from p_version or c.status not in ('DRAFT','READY_TO_SEND') then raise exception 'STALE_CONTRACT'; end if;
 insert into public.employment_contract_version values(p_id,p_version+1,p_body,p_hash,auth.uid(),now());
 update public.employment_contract set current_version=p_version+1,status='DRAFT' where id=p_id;
 insert into public.employment_contract_event(contract_id,action,actor_id) values(p_id,'REVISED',auth.uid());
end $$;
create function public.transition_employment_contract(p_id uuid,p_version int,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare c public.employment_contract; target text;
begin
 select * into c from public.employment_contract where id=p_id for update;
 if not found or not public.contract_scope(p_id) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if c.current_version is distinct from p_version then raise exception 'STALE_CONTRACT'; end if;
 if p_action='VIEWED' then
  if c.employee_id is distinct from public.current_employee_id() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if c.status<>'SENT' then return; end if; target:='VIEWED';
 elsif p_action='DECLINED' then
  if c.employee_id is distinct from public.current_employee_id() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if c.status='DECLINED' then return; end if;
  if c.status not in ('SENT','VIEWED') then raise exception 'INVALID_STATE'; end if; target:='DECLINED';
 else
  if not public.has_app_capability('EMPLOYMENT_CONTRACT_MANAGE') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_action=c.status then return; end if;
  if p_action='READY_TO_SEND' and c.status='DRAFT' and public.has_app_capability('EMPLOYMENT_CONTRACT_PRIVATE_ACCESS') then target:=p_action;
  elsif p_action='SENT' and c.status='READY_TO_SEND' then target:=p_action;
  elsif p_action='CANCELLED' and c.status in ('DRAFT','READY_TO_SEND','SENT','VIEWED') then target:=p_action;
  else raise exception 'INVALID_STATE'; end if;
 end if;
 update public.employment_contract set status=target,sent_at=case when target='SENT' then now() else sent_at end,
 first_viewed_at=case when target='VIEWED' then now() else first_viewed_at end where id=p_id;
 insert into public.employment_contract_event(contract_id,action,actor_id) values(p_id,target,auth.uid());
end $$;
create function public.sign_employee_contract(p_id uuid,p_version int,p_hash text,p_consent boolean) returns void language plpgsql security definer set search_path='' as $$
declare c public.employment_contract; v public.employment_contract_version;
begin
 select * into c from public.employment_contract where id=p_id for update;
 -- No role or employee ID input; explicit auth-to-employee join, not the caller's claimed identity.
 if not found or not public.has_app_capability('EMPLOYEE_ACCESS') or not exists(select 1 from public.employee e where e.id=c.employee_id and e.auth_user_id=auth.uid() and e.employment_status='ACTIVE')
 or not coalesce(auth.jwt() @> '{"amr":[{"method":"oauth"}],"app_metadata":{"provider":"google"}}'::jsonb,false)
 or not exists(select 1 from auth.identities i where i.user_id=auth.uid() and i.provider='google') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into v from public.employment_contract_version where contract_id=p_id and version=c.current_version;
 if p_consent is distinct from true or p_version is distinct from c.current_version or p_hash is distinct from v.body_sha256 then raise exception 'STALE_CONTRACT'; end if;
 if exists(select 1 from public.employment_contract_signature where contract_id=p_id and party='EMPLOYEE' and actor_id=auth.uid()) then return; end if;
 if c.status not in ('SENT','VIEWED') then raise exception 'INVALID_STATE'; end if;
 insert into public.employment_contract_signature(contract_id,version,party,actor_id,body_sha256) values(p_id,p_version,'EMPLOYEE',auth.uid(),p_hash);
 update public.employment_contract set status='EMPLOYEE_SIGNED',employee_signed_at=now(),first_viewed_at=coalesce(first_viewed_at,now()) where id=p_id;
 insert into public.employment_contract_event(contract_id,action,actor_id) values(p_id,'EMPLOYEE_SIGNED',auth.uid());
end $$;
create function public.sign_company_contract(p_id uuid,p_version int,p_hash text,p_consent boolean) returns void language plpgsql security definer set search_path='' as $$
declare c public.employment_contract;
begin
 if not public.has_app_capability('EMPLOYMENT_CONTRACT_COMPANY_SIGN') or not coalesce(auth.jwt() @> '{"amr":[{"method":"oauth"}],"app_metadata":{"provider":"google"}}'::jsonb,false) or not exists(select 1 from auth.identities where user_id=auth.uid() and provider='google') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into c from public.employment_contract where id=p_id for update;
 if not found or p_consent is distinct from true or p_version is distinct from c.current_version or not exists(select 1 from public.employment_contract_version where contract_id=p_id and version=p_version and body_sha256=p_hash) then raise exception 'STALE_CONTRACT'; end if;
 if c.company_signed_at is not null then return; end if;
 if c.status<>'EMPLOYEE_SIGNED' then raise exception 'INVALID_STATE'; end if;
 insert into public.employment_contract_signature(contract_id,version,party,actor_id,body_sha256) values(p_id,p_version,'COMPANY',auth.uid(),p_hash);
 update public.employment_contract set company_signed_at=now() where id=p_id;
 insert into public.employment_contract_event(contract_id,action,actor_id) values(p_id,'COMPANY_SIGNED',auth.uid());
end $$;
-- Trusted server finalization only. User RPCs cannot provide a PDF or its final hash.
create function public.complete_employment_contract(p_id uuid,p_version int,p_path text,p_hash text) returns void language plpgsql security definer set search_path='' as $$
declare c public.employment_contract;
begin
 select * into c from public.employment_contract where id=p_id for update;
 if not found then raise exception 'INVALID_CONTRACT'; end if;
 if c.status='COMPLETED' then return; end if;
 if c.status<>'EMPLOYEE_SIGNED' or c.company_signed_at is null or c.current_version is distinct from p_version or p_hash is null or p_path is null or p_hash !~ '^[a-f0-9]{64}$' or p_path not like p_id::text||'/%' or not exists(select 1 from storage.objects where bucket_id='employment-contracts' and name=p_path) then raise exception 'INVALID_COMPLETION'; end if;
 update public.employment_contract set status='COMPLETED',completed_at=now(),pdf_path=p_path,pdf_sha256=p_hash where id=p_id;
 insert into public.employment_contract_event(contract_id,action) values(p_id,'COMPLETED');
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('employment-contracts','employment-contracts',false,10485760,array['application/pdf']);
-- No authenticated Storage policies: downloads only through the reauthorizing application proxy.
revoke all on function public.contract_scope(uuid,boolean),public.contract_immutable(),public.contract_guard(),public.create_contract_template(uuid,text,text),public.create_employment_contracts(jsonb,uuid),public.revise_employment_contract(uuid,int,text,text),public.transition_employment_contract(uuid,int,text),public.sign_employee_contract(uuid,int,text,boolean),public.sign_company_contract(uuid,int,text,boolean),public.complete_employment_contract(uuid,int,text,text) from public,anon,authenticated;
grant execute on function public.contract_scope(uuid,boolean),public.create_contract_template(uuid,text,text),public.create_employment_contracts(jsonb,uuid),public.revise_employment_contract(uuid,int,text,text),public.transition_employment_contract(uuid,int,text),public.sign_employee_contract(uuid,int,text,boolean),public.sign_company_contract(uuid,int,text,boolean) to authenticated;
grant execute on function public.complete_employment_contract(uuid,int,text,text) to service_role;
commit;
