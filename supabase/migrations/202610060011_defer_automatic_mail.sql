begin;
-- Issue #15: disable even stale workers using service credentials.
-- Preserve verified-identity function bodies, RLS, and all delivery history.
revoke all on function public.enqueue_company_mail(uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function public.claim_company_mail(uuid) from public,anon,authenticated,service_role;
-- finish_company_mail remains restricted to service_role for reconciliation of
-- already claimed work; it cannot enqueue or return a transport payload.
commit;
