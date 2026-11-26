-- READ ONLY. Run against the deployed basic-leave schema BEFORE source migration.
-- Fails closed; it neither repairs data nor assumes the monetary opening balance.
begin read only;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.leave_ledger'::regclass and conname='leave_ledger_request_id_event_type_key' and contype='u' and pg_get_constraintdef(oid)='UNIQUE (request_id, event_type)')
 or not exists(select 1 from pg_constraint where conrelid='public.leave_account'::regclass and conname='leave_account_bucket_check' and contype='c')
 or exists(select 1 from public.leave_ledger r left join public.leave_ledger d on d.request_id=r.request_id and d.event_type='DEDUCTION' where r.event_type='REVERSAL' and (d.id is null or (r.employee_id,r.year,r.bucket,r.amount_delta) is distinct from (d.employee_id,d.year,d.bucket,-d.amount_delta)))
 or exists(select 1 from public.leave_ledger l left join public.leave_account a on (a.employee_id,a.year,a.bucket)=(l.employee_id,l.year,l.bucket) where a.employee_id is null)
 or exists(select 1 from public.leave_ledger where bucket<>'ANNUAL')
 then raise exception 'LEAVE_SOURCE_PREFLIGHT_FAILED';end if;
end $$;
select 'PASS: expected basic leave constraints and reversal links; balances remain unverified' as result;
rollback;
