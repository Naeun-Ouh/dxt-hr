begin;
-- Preserve any pre-upgrade signatures and completed PDFs exactly as recorded. Never
-- invent historical session/email evidence. NOT VALID exempts existing rows only;
-- every new signature must carry the complete v2 evidence tuple.
alter table public.employment_contract_signature
 add column auth_session_id uuid,
 add column authenticated_email text,
 add column auth_provider text,
 alter column evidence set default 'authenticated-google-consent-v2',
 add constraint contract_signature_evidence_v2 check (
  auth_session_id is not null and authenticated_email is not null
  and length(btrim(authenticated_email)) > 0 and auth_provider is not null
  and auth_provider = 'google' and evidence = 'authenticated-google-consent-v2'
 ) not valid;

-- No FK to auth.sessions: routine session cleanup must never delete evidence.
create schema if not exists private;
create function private.contract_signing_evidence() returns jsonb
language plpgsql security definer set search_path='' as $$
declare claims jsonb:=auth.jwt(); session_text text; signer_email text; provider text;
begin
 session_text:=claims->>'session_id';
 if auth.uid() is null or jsonb_typeof(claims->'session_id') is distinct from 'string'
 or session_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or not coalesce(claims @> '{"amr":[{"method":"oauth"}],"app_metadata":{"provider":"google"}}'::jsonb,false)
 then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if not exists(select 1 from auth.sessions s where s.id=session_text::uuid
   and s.user_id=auth.uid() and (s.not_after is null or s.not_after>now()))
 then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select u.email,i.provider into signer_email,provider from auth.users u
 join auth.identities i on i.user_id=u.id and i.provider='google'
 where u.id=auth.uid() and u.email_confirmed_at is not null;
 if signer_email is null or length(btrim(signer_email))=0 or provider is distinct from 'google'
 then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 return jsonb_build_object('session_id',session_text,'email',signer_email,'provider',provider);
end $$;
revoke all on function private.contract_signing_evidence() from public,anon,authenticated,service_role;

create or replace function public.sign_employee_contract(p_id uuid,p_version int,p_hash text,p_consent boolean) returns void language plpgsql security definer set search_path='' as $$
declare c public.employment_contract; v public.employment_contract_version; proof jsonb;
begin
 proof:=private.contract_signing_evidence();
 select * into c from public.employment_contract where id=p_id for update;
 -- No role or employee ID input; explicit auth-to-employee join, not the caller's claimed identity.
 if not found or not public.has_app_capability('EMPLOYEE_ACCESS') or not exists(select 1 from public.employee e where e.id=c.employee_id and e.auth_user_id=auth.uid() and e.employment_status='ACTIVE')
 or not coalesce(auth.jwt() @> '{"amr":[{"method":"oauth"}],"app_metadata":{"provider":"google"}}'::jsonb,false)
 or not exists(select 1 from auth.identities i where i.user_id=auth.uid() and i.provider='google') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into v from public.employment_contract_version where contract_id=p_id and version=c.current_version;
 if p_consent is distinct from true or p_version is distinct from c.current_version or p_hash is distinct from v.body_sha256 then raise exception 'STALE_CONTRACT'; end if;
 if exists(select 1 from public.employment_contract_signature where contract_id=p_id and party='EMPLOYEE' and actor_id=auth.uid()) then return; end if;
 if c.status not in ('SENT','VIEWED') then raise exception 'INVALID_STATE'; end if;
 insert into public.employment_contract_signature(contract_id,version,party,actor_id,body_sha256,auth_session_id,authenticated_email,auth_provider) values(p_id,p_version,'EMPLOYEE',auth.uid(),p_hash,(proof->>'session_id')::uuid,proof->>'email',proof->>'provider');
 update public.employment_contract set status='EMPLOYEE_SIGNED',employee_signed_at=now(),first_viewed_at=coalesce(first_viewed_at,now()) where id=p_id;
 insert into public.employment_contract_event(contract_id,action,actor_id) values(p_id,'EMPLOYEE_SIGNED',auth.uid());
end $$;
create or replace function public.sign_company_contract(p_id uuid,p_version int,p_hash text,p_consent boolean) returns void language plpgsql security definer set search_path='' as $$
declare c public.employment_contract; proof jsonb;
begin
 proof:=private.contract_signing_evidence();
 if not public.has_app_capability('EMPLOYMENT_CONTRACT_COMPANY_SIGN') or not coalesce(auth.jwt() @> '{"amr":[{"method":"oauth"}],"app_metadata":{"provider":"google"}}'::jsonb,false) or not exists(select 1 from auth.identities where user_id=auth.uid() and provider='google') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into c from public.employment_contract where id=p_id for update;
 if not found or p_consent is distinct from true or p_version is distinct from c.current_version or not exists(select 1 from public.employment_contract_version where contract_id=p_id and version=p_version and body_sha256=p_hash) then raise exception 'STALE_CONTRACT'; end if;
 if c.company_signed_at is not null then return; end if;
 if c.status<>'EMPLOYEE_SIGNED' then raise exception 'INVALID_STATE'; end if;
 insert into public.employment_contract_signature(contract_id,version,party,actor_id,body_sha256,auth_session_id,authenticated_email,auth_provider) values(p_id,p_version,'COMPANY',auth.uid(),p_hash,(proof->>'session_id')::uuid,proof->>'email',proof->>'provider');
 update public.employment_contract set company_signed_at=now() where id=p_id;
 insert into public.employment_contract_event(contract_id,action,actor_id) values(p_id,'COMPANY_SIGNED',auth.uid());
end $$;
commit;
