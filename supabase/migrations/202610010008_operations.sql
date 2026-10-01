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
create table public.operation_case (
 id uuid primary key, kind text not null check(kind in ('onboarding','offboarding')),
 employee_id uuid not null references public.employee(id), resignation_date date check(resignation_date>='1900-01-01'),
 unused_leave_checked boolean not null default false, document_received boolean not null default false,
 completed_at timestamptz, created_at timestamptz not null default now(), version int not null default 1,
 unique(kind,employee_id), check(kind='onboarding' or resignation_date is not null)
);
create table public.operation_task (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references public.operation_case(id),
 type text not null check(type in ('GMAIL','NOTION','M365','DEVICE','WINDOWS','BUSINESS_CARD','LEAVE_SETUP','GUIDE','SETTLEMENT')),
 status text not null default 'TODO' check(status in ('TODO','IN_PROGRESS','DONE','NOT_APPLICABLE')),
 memo text not null default '' check(length(memo)<=2000), version int not null default 1,
 unique(case_id,type)
);
create table public.operation_task_owner (
 task_id uuid not null references public.operation_task(id), employee_id uuid not null references public.employee(id), primary key(task_id,employee_id)
);
create table public.operation_history (
 id uuid primary key default gen_random_uuid(),case_id uuid not null references public.operation_case(id),task_id uuid references public.operation_task(id),
 action text not null, previous_status text, status text, owner_ids uuid[], actor_id uuid references auth.users(id), occurred_at timestamptz not null default now()
);
create table public.resignation_private (
 case_id uuid primary key references public.operation_case(id),reason_encrypted text not null check(length(reason_encrypted)<=20000 and reason_encrypted ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$'),version int not null default 1
);
create table public.resignation_document (
 id uuid primary key, case_id uuid not null references public.operation_case(id), storage_path text not null unique,
 filename text not null check(length(filename) between 1 and 200),mime_type text not null check(mime_type in ('application/pdf','image/png','image/jpeg')),
 byte_size int not null check(byte_size between 1 and 10485760), ready boolean not null default false,created_at timestamptz not null default now()
);
create function public.can_manage_case(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.operation_case where id=p_id and public.has_app_capability(case kind when 'onboarding' then 'ONBOARDING_MANAGE' else 'OFFBOARDING_MANAGE' end));
$$;
create table public.announcement (
 id uuid primary key,title text not null check(length(trim(title)) between 1 and 200),body text not null check(length(trim(body)) between 1 and 20000),
 author_id uuid not null references auth.users(id),author_name text not null,published_at timestamptz,version int not null default 1
);
-- Private registration and deliberately authored board content never share a SELECT projection.
create table public.family_registration (
 id uuid primary key,employee_id uuid not null references public.employee(id),category text not null check(category in ('OWN_MARRIAGE','FAMILY_MARRIAGE','CHILDBIRTH','CONDOLENCE')),
 event_date date not null check(event_date>='1900-01-01'),title text not null check(length(trim(title)) between 1 and 200),details text not null check(length(trim(details)) between 1 and 5000),
 created_at timestamptz not null default now(),version int not null default 1
);
create table public.family_post (
 registration_id uuid primary key references public.family_registration(id),employee_id uuid not null references public.employee(id),
 category text not null check(category in ('OWN_MARRIAGE','FAMILY_MARRIAGE','CHILDBIRTH','CONDOLENCE')),event_date date not null,
 title text not null check(length(trim(title)) between 1 and 200),body text not null check(length(trim(body)) between 1 and 5000),published_at timestamptz not null default now(),version int not null default 1
);
create table public.birthday_template (
 year int primary key check(year between 1900 and 9999),subject text not null check(length(trim(subject)) between 1 and 200 and subject !~ '[\r\n]'),
 body text not null check(length(trim(body)) between 1 and 10000),updated_by uuid not null references auth.users(id),version int not null default 1
);
-- Minimal recurring date for scheduler; no DOB or authenticated SELECT access.
create table public.birthday_calendar (
 employee_id uuid primary key references public.employee(id),month int not null,day int not null,
 check(month between 1 and 12 and day between 1 and 31),check(make_date(2000,month,day) is not null)
);
create table public.company_mail_delivery (
 id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('BIRTHDAY','FAMILY_EVENT')),
 subject_id uuid not null,recipient_employee_id uuid not null references public.employee(id),delivery_date date not null,
 state text not null default 'PENDING' check(state in ('PENDING','SENDING','SENT','UNKNOWN','CANCELLED')),
 claim_token uuid,claimed_at timestamptz,sent_at timestamptz,provider_message_id text,error_code text,
 unique(kind,subject_id,recipient_employee_id,delivery_date)
);
-- Birthday deduplication is per employee/year, even if DOB is corrected after a send.
create unique index birthday_delivery_year on public.company_mail_delivery(subject_id,extract(year from delivery_date)) where kind='BIRTHDAY';

alter table public.operation_case enable row level security;
alter table public.operation_task enable row level security;
alter table public.operation_task_owner enable row level security;
alter table public.operation_history enable row level security;
alter table public.resignation_private enable row level security;
alter table public.resignation_document enable row level security;
alter table public.announcement enable row level security;
alter table public.family_registration enable row level security;
alter table public.family_post enable row level security;
alter table public.birthday_template enable row level security;
alter table public.birthday_calendar enable row level security;
alter table public.company_mail_delivery enable row level security;
revoke all on public.operation_case,public.operation_task,public.operation_task_owner,public.operation_history,public.resignation_private,public.resignation_document,public.announcement,public.family_registration,public.family_post,public.birthday_template,public.birthday_calendar,public.company_mail_delivery from public,anon,authenticated;
grant select on public.operation_case,public.operation_task,public.operation_task_owner,public.operation_history,public.resignation_document,public.announcement,public.family_registration,public.family_post,public.birthday_template to authenticated;
grant all on public.operation_case,public.operation_task,public.operation_task_owner,public.operation_history,public.resignation_private,public.resignation_document,public.announcement,public.family_registration,public.family_post,public.birthday_template,public.birthday_calendar,public.company_mail_delivery to service_role;
create policy operation_case_read on public.operation_case for select to authenticated using(public.can_manage_case(id));
create policy operation_task_read on public.operation_task for select to authenticated using(public.can_manage_case(case_id));
create policy operation_owner_read on public.operation_task_owner for select to authenticated using(exists(select 1 from public.operation_task t where t.id=task_id));
create policy operation_history_read on public.operation_history for select to authenticated using(public.can_manage_case(case_id));
grant select(case_id,version) on public.resignation_private to authenticated;
create policy resignation_version_read on public.resignation_private for select to authenticated using(public.has_app_capability('RESIGNATION_REASON_ACCESS'));
create policy resignation_document_read on public.resignation_document for select to authenticated using(public.has_app_capability('RESIGNATION_REASON_ACCESS'));
create policy announcement_read on public.announcement for select to authenticated using(public.has_app_capability('ANNOUNCEMENT_MANAGE') or (public.has_app_capability('EMPLOYEE_ACCESS') and published_at<=now()));
create policy family_registration_read on public.family_registration for select to authenticated using(employee_id=public.current_employee_id() or public.has_app_capability('FAMILY_EVENT_REVIEW'));
create policy family_post_read on public.family_post for select to authenticated using(public.has_app_capability('EMPLOYEE_ACCESS'));
create policy birthday_template_read on public.birthday_template for select to authenticated using(public.has_app_capability('SETTINGS_MANAGE'));

create function public.start_operation(p_id uuid,p_kind text,p_employee uuid,p_date date) returns uuid language plpgsql security definer set search_path='' as $$
begin
 if p_kind is null or p_kind not in ('onboarding','offboarding') or not public.has_app_capability(case p_kind when 'onboarding' then 'ONBOARDING_MANAGE' else 'OFFBOARDING_MANAGE' end) then raise insufficient_privilege; end if;
 if not exists(select 1 from public.employee where id=p_employee and employment_status='ACTIVE') then raise exception 'Active employee required'; end if;
 insert into public.operation_case(id,kind,employee_id,resignation_date) values(p_id,p_kind,p_employee,p_date);
 insert into public.operation_task(case_id,type) select p_id,v from unnest(case p_kind when 'onboarding' then array['GMAIL','NOTION','M365','DEVICE','WINDOWS','BUSINESS_CARD','LEAVE_SETUP','GUIDE'] else array['SETTLEMENT'] end) v;
 insert into public.operation_history(case_id,action,actor_id) values(p_id,'START',auth.uid());
 return p_id;
end $$;
create function public.save_operation_task(p_id uuid,p_status text,p_memo text,p_owners uuid[],p_version int) returns void language plpgsql security definer set search_path='' as $$
declare old public.operation_task;
begin
 select * into old from public.operation_task where id=p_id;
 if not public.can_manage_case(old.case_id) then raise insufficient_privilege; end if;
 -- Same lock order as case completion so a task cannot change after completion.
 perform 1 from public.operation_case where id=old.case_id and completed_at is null for update;
 if not found then raise exception 'Completed case'; end if;
 select * into old from public.operation_task where id=p_id for update;
 if old.version is distinct from p_version then raise exception 'Stale record' using errcode='40001'; end if;
 if p_owners is null or cardinality(p_owners)>50 or exists(select 1 from unnest(p_owners) x where x is null or not exists(select 1 from public.employee where id=x and employment_status='ACTIVE')) then raise exception 'Invalid owners'; end if;
 update public.operation_task set status=p_status,memo=p_memo,version=version+1 where id=p_id;
 delete from public.operation_task_owner where task_id=p_id;
 insert into public.operation_task_owner select p_id,x from unnest(p_owners) x group by x;
 insert into public.operation_history(case_id,task_id,action,previous_status,status,owner_ids,actor_id) values(old.case_id,p_id,'TASK_UPDATE',old.status,p_status,p_owners,auth.uid());
end $$;
create function public.save_operation_case(p_id uuid,p_date date,p_leave boolean,p_complete boolean,p_version int) returns void language plpgsql security definer set search_path='' as $$
declare old public.operation_case;
begin
 if not public.can_manage_case(p_id) then raise insufficient_privilege; end if;
 select * into old from public.operation_case where id=p_id for update;
 if old.version is distinct from p_version or old.completed_at is not null then raise exception 'Stale record' using errcode='40001'; end if;
 if coalesce(p_complete,false) then
  if exists(select 1 from public.operation_task where case_id=p_id and status not in ('DONE','NOT_APPLICABLE')) then raise exception 'Checklist unfinished'; end if;
  if old.kind='offboarding' and (p_date is null or p_date>public.expense_today() or not coalesce(p_leave,false) or not old.document_received) then raise exception 'Departure date, leave check and letter required'; end if;
 end if;
 update public.operation_case set resignation_date=case when kind='offboarding' then p_date else null end,unused_leave_checked=coalesce(p_leave,false),completed_at=case when p_complete then now() else null end,version=version+1 where id=p_id;
 if p_complete and old.kind='offboarding' then
  -- No asset return predicate and no calls to external account systems.
  update public.employee set employment_status='INACTIVE',version=version+1 where id=old.employee_id;
 end if;
 insert into public.operation_history(case_id,action,actor_id) values(p_id,case when p_complete then 'COMPLETE' else 'UPDATE' end,auth.uid());
 insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),case when p_complete then 'COMPLETE' else 'UPDATE' end,'operation_case',p_id);
end $$;
create function public.save_resignation_reason(p_id uuid,p_ciphertext text,p_version int) returns void language plpgsql security definer set search_path='' as $$
declare v int;
begin
 if not public.has_app_capability('RESIGNATION_REASON_ACCESS') then raise insufficient_privilege; end if;
 perform 1 from public.operation_case where id=p_id and kind='offboarding' for update;
 if not found then raise exception 'Unavailable'; end if;
 select version into v from public.resignation_private where case_id=p_id;
 if coalesce(v,0) is distinct from p_version then raise exception 'Stale record' using errcode='40001'; end if;
 insert into public.resignation_private(case_id,reason_encrypted) values(p_id,p_ciphertext) on conflict(case_id) do update set reason_encrypted=excluded.reason_encrypted,version=public.resignation_private.version+1;
 insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),'EDIT_REASON','resignation',p_id);
end $$;
create function public.reveal_resignation_reason(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.has_app_capability('RESIGNATION_REASON_ACCESS') then raise insufficient_privilege; end if;
 if not exists(select 1 from public.operation_case where id=p_id and kind='offboarding') then raise exception 'Unavailable'; end if;
 select jsonb_build_object('ciphertext',reason_encrypted,'version',version) into result from public.resignation_private where case_id=p_id;
 insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),'REVEAL_REASON','resignation',p_id);
 return coalesce(result,'{"version":0}'::jsonb);
end $$;
create function public.reserve_resignation_document(p_id uuid,p_filename text,p_mime text,p_size int) returns uuid language plpgsql security definer set search_path='' as $$
declare doc uuid:=gen_random_uuid();
begin
 if not public.has_app_capability('RESIGNATION_REASON_ACCESS') then raise insufficient_privilege; end if;
 if not exists(select 1 from public.operation_case where id=p_id and kind='offboarding') then raise exception 'Unavailable'; end if;
 insert into public.resignation_document(id,case_id,storage_path,filename,mime_type,byte_size) values(doc,p_id,p_id::text||'/'||doc::text,p_filename,p_mime,p_size);
 return doc;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('resignation-letters','resignation-letters',false,10485760,array['application/pdf','image/png','image/jpeg']);
create policy resignation_storage_insert on storage.objects for insert to authenticated with check(bucket_id='resignation-letters' and public.has_app_capability('RESIGNATION_REASON_ACCESS') and exists(select 1 from public.resignation_document d where d.storage_path=name and not d.ready));
create function public.finish_resignation_document(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare doc public.resignation_document;
begin
 if not public.has_app_capability('RESIGNATION_REASON_ACCESS') then raise insufficient_privilege; end if;
 select * into doc from public.resignation_document where id=p_id for update;
 if doc.id is null or not exists(select 1 from storage.objects o where bucket_id='resignation-letters' and name=doc.storage_path and (metadata->>'size')::bigint=doc.byte_size and metadata->>'mimetype'=doc.mime_type) then raise exception 'Upload required'; end if;
 if doc.ready then return; end if;
 update public.resignation_document set ready=true where id=p_id;
 update public.operation_case set document_received=true,version=version+1 where id=doc.case_id;
 insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),'UPLOAD_DOCUMENT','resignation',p_id);
end $$;
create function public.record_resignation_download(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.has_app_capability('RESIGNATION_REASON_ACCESS') then raise insufficient_privilege; end if;
 if not exists(select 1 from public.resignation_document where id=p_id and ready) then raise exception 'Unavailable'; end if;
 insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),'DOWNLOAD_DOCUMENT','resignation',p_id);
end $$;
create function public.save_announcement(p_id uuid,p_title text,p_body text,p_publish boolean,p_version int) returns uuid language plpgsql security definer set search_path='' as $$
declare old public.announcement;
begin
 if not public.has_app_capability('ANNOUNCEMENT_MANAGE') then raise insufficient_privilege; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,8));
 select * into old from public.announcement where id=p_id for update;
 if coalesce(old.version,0) is distinct from p_version then raise exception 'Stale record' using errcode='40001'; end if;
 insert into public.announcement(id,title,body,author_id,author_name,published_at) values(p_id,p_title,p_body,auth.uid(),(select display_name from public.app_memberships where user_id=auth.uid()),case when p_publish then now() end)
 on conflict(id) do update set title=excluded.title,body=excluded.body,published_at=case when p_publish then coalesce(public.announcement.published_at,now()) end,version=public.announcement.version+1;
 insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),case when p_publish then 'PUBLISH' else 'SAVE_DRAFT' end,'announcement',p_id);
 return p_id;
end $$;
create function public.save_family_registration(p_id uuid,p_category text,p_date date,p_title text,p_details text,p_version int) returns uuid language plpgsql security definer set search_path='' as $$
declare old public.family_registration; own uuid:=public.current_employee_id();
begin
 if own is null then raise insufficient_privilege; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,8));
 select * into old from public.family_registration where id=p_id for update;
 if old.id is not null and old.employee_id<>own then raise insufficient_privilege; end if;
 if coalesce(old.version,0) is distinct from p_version then raise exception 'Stale record' using errcode='40001'; end if;
 insert into public.family_registration(id,employee_id,category,event_date,title,details) values(p_id,own,p_category,p_date,p_title,p_details)
 on conflict(id) do update set category=excluded.category,event_date=excluded.event_date,title=excluded.title,details=excluded.details,version=public.family_registration.version+1;
 -- A durable pending alert is derived from registration by enqueue_company_mail below.
 insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),case when old.id is null then 'REGISTER' else 'UPDATE' end,'family_registration',p_id);
 return p_id;
end $$;
create function public.publish_family_post(p_id uuid,p_title text,p_body text,p_publish boolean,p_version int) returns void language plpgsql security definer set search_path='' as $$
declare reg public.family_registration; v int;
begin
 select * into reg from public.family_registration where id=p_id for update;
 if reg.id is null or reg.employee_id is distinct from public.current_employee_id() then raise insufficient_privilege; end if;
 select version into v from public.family_post where registration_id=p_id;
 if coalesce(v,0) is distinct from p_version then raise exception 'Stale record' using errcode='40001'; end if;
 if p_publish then
  insert into public.family_post(registration_id,employee_id,category,event_date,title,body) values(p_id,reg.employee_id,reg.category,reg.event_date,p_title,p_body)
  on conflict(registration_id) do update set category=excluded.category,event_date=excluded.event_date,title=excluded.title,body=excluded.body,version=public.family_post.version+1;
 else delete from public.family_post where registration_id=p_id; end if;
 insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),case when p_publish then 'PUBLISH' else 'UNPUBLISH' end,'family_post',p_id);
end $$;
create function public.save_birthday_template(p_year int,p_subject text,p_body text,p_version int) returns void language plpgsql security definer set search_path='' as $$
declare v int;
begin
 if not public.has_app_capability('SETTINGS_MANAGE') then raise insufficient_privilege; end if;
 if (regexp_replace(p_subject||p_body,'\{\{(name|birthday)\}\}','','g') ~ '\{\{|\}\}') then raise exception 'Unsupported variable'; end if;
 perform pg_catalog.pg_advisory_xact_lock(p_year,8);
 select version into v from public.birthday_template where year=p_year for update;
 if coalesce(v,0) is distinct from p_version then raise exception 'Stale record' using errcode='40001'; end if;
 insert into public.birthday_template(year,subject,body,updated_by) values(p_year,p_subject,p_body,auth.uid()) on conflict(year) do update set subject=excluded.subject,body=excluded.body,updated_by=auth.uid(),version=public.birthday_template.version+1;
end $$;
-- Invalidate the minimal calendar whenever an older client changes encrypted DOB.
create function public.invalidate_birthday_calendar() returns trigger language plpgsql security definer set search_path='' as $$
begin delete from public.birthday_calendar where employee_id=coalesce(NEW.employee_id,OLD.employee_id);return coalesce(NEW,OLD);end $$;
create trigger birthday_calendar_invalidate after insert or update or delete on public.employee_birth_detail for each row execute function public.invalidate_birthday_calendar();
create function public.save_employee_with_birthday(p_id uuid,p_profile jsonb,p_expected_version int,p_birth_ciphertext text,p_clear_birth boolean,p_private_ciphertext text,p_month int,p_day int)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 if not public.has_app_capability('EMPLOYEE_MANAGE') then raise insufficient_privilege; end if;
 perform public.save_employee_profile(p_id,p_profile,p_expected_version,p_birth_ciphertext,p_clear_birth,p_private_ciphertext);
 if p_birth_ciphertext is not null then insert into public.birthday_calendar values(p_id,p_month,p_day) on conflict(employee_id) do update set month=excluded.month,day=excluded.day; end if;
 return p_id;
end $$;
revoke execute on function public.save_employee_profile(uuid,jsonb,int,text,boolean,text) from authenticated;
-- One-time backfill uses an encrypted-value comparison to avoid indexing a concurrent DOB edit.
create function public.backfill_birthday_calendar(p_id uuid,p_ciphertext text,p_month int,p_day int) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.employee_birth_detail where employee_id=p_id and birth_date_encrypted=p_ciphertext for update;
 if not found then raise exception 'DOB changed'; end if;
 insert into public.birthday_calendar values(p_id,p_month,p_day) on conflict(employee_id) do update set month=excluded.month,day=excluded.day;
end $$;
alter table public.family_registration add column notification_queued boolean not null default false;
create function public.company_mail_now() returns timestamptz language sql stable set search_path='' as $$ select now() $$;
revoke all on function public.company_mail_now() from public,anon,authenticated;
create function public.enqueue_company_mail(p_family_only uuid default null,p_birthdays boolean default true) returns void language plpgsql security definer set search_path='' as $$
declare r record; today date:=(public.company_mail_now() at time zone 'Asia/Seoul')::date;
begin
 if p_birthdays and extract(hour from public.company_mail_now() at time zone 'Asia/Seoul')>=9 then
  insert into public.company_mail_delivery(kind,subject_id,recipient_employee_id,delivery_date)
  select 'BIRTHDAY',e.id,e.id,today from public.employee e join public.birthday_calendar b on b.employee_id=e.id
  join public.birthday_template t on t.year=extract(year from today)::int
  where e.employment_status='ACTIVE' and e.hire_date<=today and b.month=extract(month from today) and b.day=extract(day from today)
  on conflict do nothing;
 end if;
 for r in select id,created_at from public.family_registration where not notification_queued and (p_family_only is null or id=p_family_only) for update skip locked loop
  insert into public.company_mail_delivery(kind,subject_id,recipient_employee_id,delivery_date)
  select 'FAMILY_EVENT',r.id,e.id,(r.created_at at time zone 'Asia/Seoul')::date from public.employee e join public.app_memberships m on e.auth_user_id=m.user_id
  where e.employment_status='ACTIVE' and e.hire_date<=today and m.status='ACTIVE' and m.roles @> array['CEO']::text[]
  on conflict do nothing;
  if exists(select 1 from public.company_mail_delivery where kind='FAMILY_EVENT' and subject_id=r.id) then update public.family_registration set notification_queued=true where id=r.id; end if;
 end loop;
end $$;
create function public.claim_company_mail(p_family_only uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.company_mail_delivery; recipient public.employee; t public.birthday_template; reg public.family_registration; token uuid:=gen_random_uuid(); result jsonb; today date:=(public.company_mail_now() at time zone 'Asia/Seoul')::date;
begin
 loop
  select * into d from public.company_mail_delivery where state='PENDING' and (p_family_only is null or (kind='FAMILY_EVENT' and subject_id=p_family_only)) order by delivery_date,id for update skip locked limit 1;
  if d.id is null then return null; end if;
  select * into recipient from public.employee where id=d.recipient_employee_id;
  if recipient.employment_status<>'ACTIVE' or recipient.hire_date>today or
   (d.kind='BIRTHDAY' and (d.delivery_date<>today or not exists(select 1 from public.birthday_calendar where employee_id=recipient.id and month=extract(month from today) and day=extract(day from today)))) or
   (d.kind='FAMILY_EVENT' and not exists(select 1 from public.app_memberships where user_id=recipient.auth_user_id and status='ACTIVE' and roles @> array['CEO']::text[])) then
   update public.company_mail_delivery set state='CANCELLED',error_code='RECIPIENT_NO_LONGER_ELIGIBLE' where id=d.id; continue;
  end if;
  if d.kind='BIRTHDAY' then
   if extract(hour from public.company_mail_now() at time zone 'Asia/Seoul')<9 then return null; end if;
   select * into t from public.birthday_template where year=extract(year from today)::int;
   if t.year is null then return null; end if;
   result:=jsonb_build_object('subject',t.subject,'body',t.body,'birthday',to_char(today,'MM-DD'));
  else
   select * into reg from public.family_registration where id=d.subject_id;
   result:=jsonb_build_object('subject','[DXT 경조사] '||reg.title,'body',concat((select name from public.employee where id=reg.employee_id),E'\n',reg.category,E'\n',reg.event_date,E'\n',reg.details));
  end if;
  update public.company_mail_delivery set state='SENDING',claim_token=token,claimed_at=now() where id=d.id;
  return result||jsonb_build_object('id',d.id,'token',token,'kind',d.kind,'email',recipient.company_email,'name',recipient.name);
 end loop;
end $$;
create function public.finish_company_mail(p_id uuid,p_token uuid,p_message_id text,p_uncertain boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_uncertain is null or (not p_uncertain and (p_message_id is null or length(p_message_id) not between 1 and 200)) then raise exception 'Delivery result required'; end if;
 update public.company_mail_delivery set state=case when p_uncertain then 'UNKNOWN' else 'SENT' end,sent_at=case when not p_uncertain then now() end,provider_message_id=case when not p_uncertain then p_message_id end,error_code=case when p_uncertain then 'DELIVERY_UNCERTAIN' end
 where id=p_id and claim_token=p_token and state='SENDING';
 if not found then raise exception 'Invalid delivery claim'; end if;
end $$;
create function public.family_notification_status(p_id uuid) returns text language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.family_registration where id=p_id and (employee_id=public.current_employee_id() or public.has_app_capability('FAMILY_EVENT_REVIEW'))) then raise insufficient_privilege; end if;
 if exists(select 1 from public.company_mail_delivery where subject_id=p_id and kind='FAMILY_EVENT' and state in ('UNKNOWN','SENDING','CANCELLED')) then return 'REVIEW'; end if;
 if exists(select 1 from public.company_mail_delivery where subject_id=p_id and kind='FAMILY_EVENT' and state='SENT') and not exists(select 1 from public.company_mail_delivery where subject_id=p_id and kind='FAMILY_EVENT' and state<>'SENT') then return 'SENT'; end if;
 return 'PENDING';
end $$;
-- Close default PUBLIC function execution, including all worker-only entry points.
revoke all on function public.can_manage_case(uuid),public.start_operation(uuid,text,uuid,date),public.save_operation_task(uuid,text,text,uuid[],int),public.save_operation_case(uuid,date,boolean,boolean,int),public.save_resignation_reason(uuid,text,int),public.reveal_resignation_reason(uuid),public.reserve_resignation_document(uuid,text,text,int),public.finish_resignation_document(uuid),public.record_resignation_download(uuid),public.save_announcement(uuid,text,text,boolean,int),public.save_family_registration(uuid,text,date,text,text,int),public.publish_family_post(uuid,text,text,boolean,int),public.save_birthday_template(int,text,text,int),public.invalidate_birthday_calendar(),public.save_employee_with_birthday(uuid,jsonb,int,text,boolean,text,int,int),public.backfill_birthday_calendar(uuid,text,int,int),public.enqueue_company_mail(uuid,boolean),public.claim_company_mail(uuid),public.finish_company_mail(uuid,uuid,text,boolean),public.family_notification_status(uuid) from public,anon,authenticated;
grant execute on function public.can_manage_case(uuid),public.start_operation(uuid,text,uuid,date),public.save_operation_task(uuid,text,text,uuid[],int),public.save_operation_case(uuid,date,boolean,boolean,int),public.save_resignation_reason(uuid,text,int),public.reveal_resignation_reason(uuid),public.reserve_resignation_document(uuid,text,text,int),public.finish_resignation_document(uuid),public.record_resignation_download(uuid),public.save_announcement(uuid,text,text,boolean,int),public.save_family_registration(uuid,text,date,text,text,int),public.publish_family_post(uuid,text,text,boolean,int),public.save_birthday_template(int,text,text,int),public.save_employee_with_birthday(uuid,jsonb,int,text,boolean,text,int,int),public.family_notification_status(uuid) to authenticated;
grant execute on function public.backfill_birthday_calendar(uuid,text,int,int),public.enqueue_company_mail(uuid,boolean),public.claim_company_mail(uuid),public.finish_company_mail(uuid,uuid,text,boolean) to service_role;
commit;
