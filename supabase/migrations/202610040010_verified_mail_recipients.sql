begin;
-- Both automatic mail types use verified identity recipients, never profile addresses.
-- Auth email changes require the identity provider's verification flow.
create or replace function public.claim_company_mail(p_family_only uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.company_mail_delivery; recipient public.employee; t public.birthday_template; reg public.family_registration; token uuid:=gen_random_uuid(); result jsonb; recipient_email text; today date:=(public.company_mail_now() at time zone 'Asia/Seoul')::date;
begin
 loop
  select * into d from public.company_mail_delivery where state='PENDING' and (p_family_only is null or (kind='FAMILY_EVENT' and subject_id=p_family_only)) order by delivery_date,id for update skip locked limit 1;
  if d.id is null then return null; end if;
  select * into recipient from public.employee where id=d.recipient_employee_id;
  -- Resolve the verified address once and reuse that exact value in the payload.
  select u.email into recipient_email from auth.users u
   join public.app_memberships m on m.user_id=u.id
   where u.id=recipient.auth_user_id and m.status='ACTIVE'
    and u.email_confirmed_at is not null and nullif(trim(u.email),'') is not null
    and (d.kind='BIRTHDAY' or m.roles @> array['CEO']::text[]);
  if recipient.id is null or recipient.employment_status<>'ACTIVE' or recipient.hire_date>today or recipient_email is null or
   (d.kind='BIRTHDAY' and (d.delivery_date<>today or not exists(select 1 from public.birthday_calendar where employee_id=recipient.id and month=extract(month from today) and day=extract(day from today)))) then
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
  return result||jsonb_build_object('id',d.id,'token',token,'kind',d.kind,'email',recipient_email,'name',recipient.name);
 end loop;
end $$;
revoke all on function public.claim_company_mail(uuid) from public,anon,authenticated;
grant execute on function public.claim_company_mail(uuid) to service_role;
commit;
