begin;
create table public.employee_hr_document (
 id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employee(id),
 document_type text not null check(document_type in ('BANKBOOK_COPY','RESIDENT_REGISTRATION_COPY','RESUME','OTHER_HR')),
 filename text not null check(length(filename) between 1 and 200 and filename !~ '[[:cntrl:]/\\]'),
 mime_type text not null check(mime_type in ('application/pdf','image/png','image/jpeg')),
 byte_size integer not null check(byte_size between 1 and 10485760),
 storage_path text not null unique, sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 issued_date date, expires_at date, version integer not null check(version>0),
 uploaded_by uuid not null references auth.users(id), uploaded_at timestamptz not null default now(),
 ready boolean not null default false, archived_at timestamptz,
 check(storage_path=employee_id::text||'/'||id::text),
 check(expires_at is null or issued_date is null or expires_at>=issued_date),
 unique(employee_id,document_type,version)
);
create index hr_document_employee on public.employee_hr_document(employee_id,document_type);
create table public.employee_hr_document_event (
 id uuid primary key default gen_random_uuid(), document_id uuid not null references public.employee_hr_document(id),
 action text not null check(action in ('UPLOAD','VIEW','DOWNLOAD','ARCHIVE')),
 actor_id uuid not null references auth.users(id), occurred_at timestamptz not null default now()
);
alter table public.employee_hr_document enable row level security;
alter table public.employee_hr_document_event enable row level security;
-- Own published standard documents only; OTHER_HR and history remain private HR.
create policy hr_document_read on public.employee_hr_document for select to authenticated using(
 ready and (public.has_app_capability('PRIVATE_HR_ACCESS') or
 (public.has_app_capability('EMPLOYEE_ACCESS') and employee_id=public.current_employee_id()
 and document_type<>'OTHER_HR' and archived_at is null)));
create policy hr_document_event_read on public.employee_hr_document_event for select to authenticated using(public.has_app_capability('PRIVATE_HR_ACCESS'));
revoke all on public.employee_hr_document,public.employee_hr_document_event from anon,authenticated;
grant select on public.employee_hr_document,public.employee_hr_document_event to authenticated;
create function private.guard_hr_document() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'IMMUTABLE_DOCUMENT'; end if;
 if (to_jsonb(new)-'ready'-'archived_at') is distinct from (to_jsonb(old)-'ready'-'archived_at')
 or (old.ready and not new.ready) or (old.archived_at is not null and new.archived_at is distinct from old.archived_at)
 then raise exception 'IMMUTABLE_DOCUMENT'; end if;
 return new;
end $$;
create trigger hr_document_guard before update or delete on public.employee_hr_document for each row execute function private.guard_hr_document();
create trigger hr_document_event_guard before update or delete on public.employee_hr_document_event for each row execute function public.contract_immutable();
create function public.reserve_hr_document(p_employee uuid,p_type text,p_filename text,p_mime text,p_size integer,p_hash text,p_issued date,p_expires date) returns uuid
language plpgsql security definer set search_path='' as $$
declare doc uuid:=gen_random_uuid(); v integer;
begin
 if not public.has_app_capability('PRIVATE_HR_ACCESS') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 perform 1 from public.employee where id=p_employee for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 select coalesce(max(version),0)+1 into v from public.employee_hr_document where employee_id=p_employee and document_type=p_type;
 insert into public.employee_hr_document(id,employee_id,document_type,filename,mime_type,byte_size,storage_path,sha256,issued_date,expires_at,version,uploaded_by)
 values(doc,p_employee,p_type,p_filename,p_mime,p_size,p_employee::text||'/'||doc::text,p_hash,p_issued,p_expires,v,auth.uid());
 return doc;
end $$;
-- Called only by the trusted upload adapter after byte/MIME/signature/hash validation.
create function public.finish_hr_document(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare d public.employee_hr_document;
begin
 select * into d from public.employee_hr_document where id=p_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if d.ready then return; end if;
 if not exists(select 1 from storage.objects where bucket_id='employee-hr-documents' and name=d.storage_path
 and (metadata->>'size')::bigint=d.byte_size and metadata->>'mimetype'=d.mime_type) then raise exception 'INVALID_OBJECT'; end if;
 update public.employee_hr_document set ready=true where id=p_id;
 insert into public.employee_hr_document_event(document_id,action,actor_id) values(p_id,'UPLOAD',d.uploaded_by);
end $$;
create function public.archive_hr_document(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.has_app_capability('PRIVATE_HR_ACCESS') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 update public.employee_hr_document set archived_at=now() where id=p_id and ready and archived_at is null;
 if found then insert into public.employee_hr_document_event(document_id,action,actor_id) values(p_id,'ARCHIVE',auth.uid()); end if;
end $$;
create function public.access_hr_document(p_id uuid,p_action text) returns public.employee_hr_document
language plpgsql security definer set search_path='' as $$
declare d public.employee_hr_document;
begin
 select * into d from public.employee_hr_document where id=p_id and ready for share;
 if not found or not coalesce((public.has_app_capability('PRIVATE_HR_ACCESS') or
 (public.has_app_capability('EMPLOYEE_ACCESS') and d.employee_id=public.current_employee_id() and d.document_type<>'OTHER_HR' and d.archived_at is null)),false)
 then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_action not in ('VIEW','DOWNLOAD') or p_action is null then raise exception 'INVALID_ACTION'; end if;
 insert into public.employee_hr_document_event(document_id,action,actor_id) values(p_id,p_action,auth.uid());
 return d;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('employee-hr-documents','employee-hr-documents',false,10485760,array['application/pdf','image/png','image/jpeg']);
-- No authenticated or anon Storage policy: all byte access uses checked server proxy.
revoke all on function private.guard_hr_document(),public.reserve_hr_document(uuid,text,text,text,integer,text,date,date),public.finish_hr_document(uuid),public.archive_hr_document(uuid),public.access_hr_document(uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_hr_document(uuid,text,text,text,integer,text,date,date),public.archive_hr_document(uuid),public.access_hr_document(uuid,text) to authenticated;
grant execute on function public.finish_hr_document(uuid) to service_role;
commit;
