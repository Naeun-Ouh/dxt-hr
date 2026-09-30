begin;
-- Career read scope is separate from project administration. Only a trusted
-- TEAM_LEADER role adds same-direct-department reads; writes remain owner-only.
create function public.can_read_career(p_employee uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(public.has_app_capability('EMPLOYEE_ACCESS') and (
  p_employee=public.current_employee_id() or (
   exists(select 1 from public.app_memberships where user_id=auth.uid() and roles @> array['TEAM_LEADER']::text[])
   and exists(select 1 from public.employee target join public.employee self on self.department_id=target.department_id
    where self.id=public.current_employee_id() and target.id=p_employee)
  )
 ),false);
$$;
revoke all on function public.can_read_career(uuid) from public,anon;
grant execute on function public.can_read_career(uuid) to authenticated;
drop policy career_read on public.career;
create policy career_read on public.career for select to authenticated using(public.can_read_career(employee_id));
-- No table write grants or save_career changes: the owner is still derived from auth.uid().
commit;
