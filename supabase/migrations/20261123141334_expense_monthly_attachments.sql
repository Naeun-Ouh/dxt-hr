begin;
-- Monthly evidence; legacy item links remain intact, including removed-file history.
alter table public.expense_attachment add column deleted_at timestamptz;
create index expense_attachment_active_claim on public.expense_attachment(claim_id) where deleted_at is null;
drop trigger expense_submitted_evidence on public.expense_item;
drop function public.guard_submitted_expense_evidence();

drop policy expense_attachment_read on public.expense_attachment;
create policy expense_attachment_read on public.expense_attachment for select to authenticated
 using(deleted_at is null and public.can_read_expense(claim_id));
drop policy expense_object_read on storage.objects;
create policy expense_object_read on storage.objects for select to authenticated using(bucket_id='expense-evidence' and exists(
 select 1 from public.expense_attachment a where a.storage_path=name and a.ready and a.deleted_at is null and public.can_read_expense(a.claim_id)));
drop policy expense_object_insert on storage.objects;
create policy expense_object_insert on storage.objects for insert to authenticated with check(bucket_id='expense-evidence' and exists(
 select 1 from public.expense_attachment a where a.storage_path=name and not a.ready and a.deleted_at is null and public.expense_editable(a.claim_id)));

-- Same parent lock as save/submit/lock/pay: concurrent reservations cannot exceed caps.
create or replace function public.reserve_expense_attachment(p_claim uuid,p_filename text,p_mime text,p_size int) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid:=gen_random_uuid(); n bigint; total bigint;
begin
 perform 1 from public.expense_claim where id=p_claim for update;
 if not public.expense_editable(p_claim) then raise insufficient_privilege; end if;
 select count(*),coalesce(sum(byte_size),0) into n,total from public.expense_attachment where claim_id=p_claim and deleted_at is null;
 if n>=20 or total+p_size>104857600 then raise check_violation using message='ATTACHMENT_LIMIT'; end if;
 insert into public.expense_attachment(id,claim_id,storage_path,filename,mime_type,byte_size) values(target,p_claim,p_claim::text||'/'||target::text,p_filename,p_mime,p_size);
 return target;
end; $$;
create or replace function public.finish_expense_attachment(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.expense_attachment; target uuid;
begin
 select claim_id into target from public.expense_attachment where id=p_id;
 perform 1 from public.expense_claim where id=target for update;
 if not public.expense_editable(target) then raise insufficient_privilege; end if;
 select * into a from public.expense_attachment where id=p_id and deleted_at is null;
 if a.id is null then raise insufficient_privilege; end if;
 if not exists(select 1 from storage.objects where bucket_id='expense-evidence' and name=a.storage_path and (metadata->>'size')::bigint=a.byte_size and metadata->>'mimetype'=a.mime_type) then raise check_violation; end if;
 update public.expense_attachment set ready=true where id=p_id;
end; $$;
-- Logical removal revokes object access immediately without breaking historical item FKs.
-- No Storage UPDATE/DELETE policy is granted. Removed objects remain private for retention.
create function public.remove_expense_attachment(p_claim uuid,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.expense_claim where id=p_claim for update;
 if not public.expense_editable(p_claim) then raise insufficient_privilege; end if;
 if not exists(select 1 from public.expense_attachment where id=p_id and claim_id=p_claim) then raise insufficient_privilege; end if;
 update public.expense_attachment set deleted_at=now() where id=p_id and claim_id=p_claim and deleted_at is null;
 if found then insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),'REMOVE','expense_attachment',p_id); end if;
end; $$;
revoke all on function public.remove_expense_attachment(uuid,uuid) from public,anon;
grant execute on function public.remove_expense_attachment(uuid,uuid) to authenticated;

create or replace function public.submit_expense_claim(p_claim uuid,p_version int,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare c public.expense_claim; pay date;
begin
 select * into c from public.expense_claim where id=p_claim for update;
 if not public.expense_editable(p_claim) then raise insufficient_privilege; end if;
 if p_version is null or c.version<>p_version then raise serialization_failure; end if;
 if not exists(select 1 from public.expense_item where claim_id=p_claim) or p_reason is null then raise check_violation; end if;
 if c.usage_month<=date_trunc('month',public.expense_today()-interval '2 months')::date and length(trim(p_reason))=0 then raise check_violation using message='RETRO_REASON'; end if;
 if not exists(select 1 from public.expense_attachment where claim_id=p_claim and ready and deleted_at is null) then raise check_violation using message='EVIDENCE_REQUIRED'; end if;
 -- Retroactive submissions enter the next available payment cycle, not an already closed period.
 pay:=greatest((c.usage_month+interval '1 month 14 days')::date,(date_trunc('month',public.expense_today())+interval '14 days')::date);
 if pay<public.expense_today() then pay:=(pay+interval '1 month')::date; end if;
 update public.expense_claim set status='SUBMITTED',submitted_at=coalesce(submitted_at,now()),payment_date=coalesce(payment_date,pay),late_reason=p_reason,version=version+1,updated_at=now() where id=p_claim;
 insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),'SUBMIT','expense_claim',p_claim);
end; $$;

commit;
