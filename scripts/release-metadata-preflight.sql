-- Read-only metadata inventory. No employee rows, object paths, keys or Auth tokens.
-- Run on the explicitly selected staging project; compare with the reviewed app SHA.
-- This is not user-session RLS acceptance, migration authorization or a release PASS.
begin read only;
select jsonb_build_object(
  'migrations', (select jsonb_agg(jsonb_build_object('version',version,'name',name) order by version)
    from supabase_migrations.schema_migrations),
  'public_tables_without_rls', (select coalesce(jsonb_agg(c.relname order by c.relname),'[]'::jsonb)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and not c.relrowsecurity),
  'private_buckets', (select jsonb_agg(jsonb_build_object('id',id,'public',public,'file_size_limit',file_size_limit) order by id)
    from storage.buckets where id in ('company-seals','employee-hr-documents','employment-contracts',
      'expense-evidence','hr-certificates','resignation-letters')),
  'automatic_mail_privileges', (select jsonb_agg(jsonb_build_object('function',p.proname,
      'authenticated_execute',has_function_privilege('authenticated',p.oid,'execute'),
      'service_role_execute',has_function_privilege('service_role',p.oid,'execute')) order by p.proname)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      and p.proname in ('enqueue_company_mail','claim_company_mail'))
) as release_metadata;
rollback;
