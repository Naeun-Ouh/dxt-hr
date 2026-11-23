begin;
-- Restore the existing DXT payment window; submission is not a lock.
-- Earlier migrations are intentionally preserved for already-applied environments.
create or replace function public.expense_editable(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select employee_id=public.current_employee_id() and status in ('DRAFT','SUBMITTED') and locked_at is null
 and (payment_date is null or public.expense_today()<=payment_date) from public.expense_claim where id=p_id),false);
$$;
-- Grid drafts may omit evidence. Submitted edits must keep the existing mandatory
-- evidence rule, including legacy item writers; the parent lock serializes payment.
create function public.guard_submitted_expense_evidence() returns trigger language plpgsql set search_path='' as $$
begin
 if new.attachment_id is null and exists(select 1 from public.expense_claim where id=new.claim_id and status='SUBMITTED') then
  raise check_violation using message='EVIDENCE_REQUIRED';
 end if;
 return new;
end; $$;
revoke all on function public.guard_submitted_expense_evidence() from public,anon,authenticated;
create trigger expense_submitted_evidence before insert or update on public.expense_item
 for each row execute function public.guard_submitted_expense_evidence();
commit;
