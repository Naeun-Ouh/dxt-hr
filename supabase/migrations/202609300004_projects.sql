begin;
create or replace function public.has_app_capability(requested text) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.app_memberships m where m.user_id=auth.uid() and m.status='ACTIVE'
 and not exists(select 1 from public.employee e where e.auth_user_id=m.user_id and e.employment_status='INACTIVE')
 and case requested when 'EMPLOYEE_ACCESS' then cardinality(m.roles)>0
 when 'EMPLOYEE_MANAGE' then m.roles && array['ADMIN','CEO']::text[]
 when 'PROJECT_MANAGE' then m.roles && array['ADMIN','CEO']::text[]
 when 'TEAM_PROJECT_READ' then m.roles && array['ADMIN','CEO','TEAM_LEADER']::text[]
 when 'PRIVATE_HR_ACCESS' then m.roles @> array['CEO']::text[] or (m.roles @> array['ADMIN']::text[] and m.capabilities @> array['PRIVATE_HR_ACCESS']::text[]) else false end);
$$;
create function public.current_employee_id() returns uuid language sql stable security definer set search_path='' as $$
 select id from public.employee where auth_user_id=auth.uid() and employment_status='ACTIVE' and public.has_app_capability('EMPLOYEE_ACCESS');
$$;
-- TODO(PERMISSIONS.md): explicit leader/team mapping and division scope. Until defined,
-- TEAM_LEADER sees only the same non-null direct department, never descendants or all staff.
create function public.can_read_assignment(p_employee uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.has_app_capability('PROJECT_MANAGE') or p_employee=public.current_employee_id() or
 (public.has_app_capability('TEAM_PROJECT_READ') and exists(select 1 from public.employee target join public.employee self on self.department_id=target.department_id where self.id=public.current_employee_id() and target.id=p_employee));
$$;
create table public.project (
 id uuid primary key default gen_random_uuid(), customer_name text not null check(length(trim(customer_name)) between 1 and 200),
 name text not null check(length(trim(name)) between 1 and 200), start_date date not null check(start_date>='1900-01-01'), current_end_date date not null,
 pm_employee_id uuid not null references public.employee(id), work_location text not null check(length(trim(work_location)) between 1 and 200),
 status text not null check(status in ('PLANNED','ACTIVE','COMPLETED')), version integer not null default 1 check(version>0), check(current_end_date>=start_date and current_end_date<='9999-12-31')
);
create table public.project_assignment (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.project(id), employee_id uuid not null references public.employee(id),
 start_date date not null, end_date date not null, role text not null check(length(trim(role)) between 1 and 100),
 status text not null check(status in ('PLANNED','ACTIVE','COMPLETED')), version integer not null default 1 check(version>0), check(end_date>=start_date)
);
create index assignment_employee on public.project_assignment(employee_id,project_id);
create index assignment_project on public.project_assignment(project_id);
create table public.project_extension (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.project(id), previous_end_date date not null, new_end_date date not null,
 reason text check(length(reason)<=1000), changed_at timestamptz not null default now(), changed_by uuid references auth.users(id), changed_by_name text not null default '시스템', check(previous_end_date<>new_end_date)
);
create index extension_project on public.project_extension(project_id);
create table public.career (
 id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employee(id), assignment_id uuid not null references public.project_assignment(id),
 job_function text not null check(length(trim(job_function)) between 1 and 100), role text not null check(length(trim(role)) between 1 and 100),
 responsibilities text not null check(length(trim(responsibilities)) between 1 and 10000), skills text[] not null default '{}',
 version integer not null default 1 check(version>0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(cardinality(skills)<=30 and length(array_to_string(skills,','))<=3000)
);
create index career_employee on public.career(employee_id);
create index career_assignment on public.career(assignment_id);
alter table public.project enable row level security;
alter table public.project_assignment enable row level security;
alter table public.project_extension enable row level security;
alter table public.career enable row level security;
revoke all on public.project, public.project_assignment, public.project_extension, public.career from public, anon, authenticated;
grant select on public.project, public.project_assignment, public.project_extension, public.career to authenticated;
grant all on public.project, public.project_assignment, public.project_extension, public.career to service_role;
create policy assignment_read on public.project_assignment for select to authenticated using(public.can_read_assignment(employee_id));
create policy project_read on public.project for select to authenticated using(public.has_app_capability('PROJECT_MANAGE') or exists(select 1 from public.project_assignment a where a.project_id=project.id));
create policy extension_read on public.project_extension for select to authenticated using(public.has_app_capability('PROJECT_MANAGE'));
create policy career_read on public.career for select to authenticated using(employee_id=public.current_employee_id());

-- These triggers also protect trusted import paths; all application mutations use checked RPCs.
create function public.project_integrity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_TABLE_NAME='project_assignment' then
  perform 1 from public.project where id=NEW.project_id for update;
  if TG_OP='UPDATE' and (NEW.project_id<>OLD.project_id or NEW.employee_id<>OLD.employee_id) then raise check_violation using message='Assignment identity is immutable'; end if;
  if not exists(select 1 from public.project where id=NEW.project_id and start_date<=NEW.start_date and current_end_date>=NEW.end_date) then raise check_violation using message='Assignment outside project range'; end if;
 elsif TG_TABLE_NAME='project' then
  if exists(select 1 from public.project_assignment where project_id=NEW.id and (start_date<NEW.start_date or end_date>NEW.current_end_date)) then raise check_violation using message='Existing assignments outside new range'; end if;
  if NEW.current_end_date<>OLD.current_end_date then
   insert into public.project_extension(project_id,previous_end_date,new_end_date,changed_by,changed_by_name,reason) values(NEW.id,OLD.current_end_date,NEW.current_end_date,auth.uid(),coalesce((select display_name from public.app_memberships where user_id=auth.uid()),'시스템'),nullif(current_setting('app.extension_reason',true),''));
  end if;
 else
  if exists(select 1 from unnest(NEW.skills) as s(skill) where skill is null or length(trim(skill)) not between 1 and 100) then raise check_violation using message='Invalid career skill'; end if;
  if not exists(select 1 from public.project_assignment where id=NEW.assignment_id and employee_id=NEW.employee_id) then raise check_violation using message='Career must reference own assignment'; end if;
  if TG_OP='UPDATE' and NEW.employee_id<>OLD.employee_id then raise check_violation; end if;
 end if;
 return NEW;
end; $$;
create trigger assignment_integrity before insert or update on public.project_assignment for each row execute function public.project_integrity();
create trigger project_integrity before update on public.project for each row execute function public.project_integrity();
create trigger career_integrity before insert or update on public.career for each row execute function public.project_integrity();
create function public.project_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_log(actor_id,action,entity_type,entity_id) values(auth.uid(),TG_OP,TG_TABLE_NAME,coalesce(NEW.id,OLD.id));
 return coalesce(NEW,OLD);
end; $$;
create trigger project_audit after insert or update or delete on public.project for each row execute function public.project_audit();
create trigger assignment_audit after insert or update or delete on public.project_assignment for each row execute function public.project_audit();
create trigger career_audit after insert or update or delete on public.career for each row execute function public.project_audit();

create function public.save_project(p_id uuid,p_values jsonb,p_expected_version integer) returns uuid language plpgsql security definer set search_path='' as $$
begin
 if not public.has_app_capability('PROJECT_MANAGE') then raise insufficient_privilege; end if;
 perform set_config('app.extension_reason',coalesce(p_values->>'reason',''),true);
 if p_expected_version=0 then
  insert into public.project(id,customer_name,name,start_date,current_end_date,pm_employee_id,work_location,status) values(p_id,p_values->>'customer_name',p_values->>'name',(p_values->>'start_date')::date,(p_values->>'current_end_date')::date,(p_values->>'pm_employee_id')::uuid,p_values->>'work_location',p_values->>'status');
 else
  update public.project set customer_name=p_values->>'customer_name',name=p_values->>'name',start_date=(p_values->>'start_date')::date,current_end_date=(p_values->>'current_end_date')::date,pm_employee_id=(p_values->>'pm_employee_id')::uuid,work_location=p_values->>'work_location',status=p_values->>'status',version=version+1 where id=p_id and version=p_expected_version;
  if not found then raise serialization_failure; end if;
 end if;
 return p_id;
end; $$;
create function public.save_assignment(p_id uuid,p_values jsonb,p_expected_version integer) returns uuid language plpgsql security definer set search_path='' as $$
begin
 if not public.has_app_capability('PROJECT_MANAGE') then raise insufficient_privilege; end if;
 -- Same lock order for assignment edits and project range edits.
 perform 1 from public.project where id=(p_values->>'project_id')::uuid for update;
 if p_expected_version=0 then
  insert into public.project_assignment(id,project_id,employee_id,start_date,end_date,role,status) values(p_id,(p_values->>'project_id')::uuid,(p_values->>'employee_id')::uuid,(p_values->>'start_date')::date,(p_values->>'end_date')::date,p_values->>'role',p_values->>'status');
 else
  update public.project_assignment set start_date=(p_values->>'start_date')::date,end_date=(p_values->>'end_date')::date,role=p_values->>'role',status=p_values->>'status',version=version+1 where id=p_id and project_id=(p_values->>'project_id')::uuid and employee_id=(p_values->>'employee_id')::uuid and version=p_expected_version;
  if not found then raise serialization_failure; end if;
 end if;
 return p_id;
end; $$;
create function public.save_career(p_id uuid,p_values jsonb,p_expected_version integer) returns uuid language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=public.current_employee_id();
begin
 if owner_id is null or not exists(select 1 from public.project_assignment where id=(p_values->>'assignment_id')::uuid and employee_id=owner_id) then raise insufficient_privilege; end if;
 if p_expected_version=0 then
  insert into public.career(id,employee_id,assignment_id,job_function,role,responsibilities,skills) values(p_id,owner_id,(p_values->>'assignment_id')::uuid,p_values->>'job_function',p_values->>'role',p_values->>'responsibilities',array(select jsonb_array_elements_text(p_values->'skills')));
 else
  update public.career set assignment_id=(p_values->>'assignment_id')::uuid,job_function=p_values->>'job_function',role=p_values->>'role',responsibilities=p_values->>'responsibilities',skills=array(select jsonb_array_elements_text(p_values->'skills')),version=version+1,updated_at=now() where id=p_id and employee_id=owner_id and version=p_expected_version;
  if not found then raise serialization_failure; end if;
 end if;
 return p_id;
end; $$;
create function public.delete_project_record(p_kind text,p_id uuid,p_expected_version integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.has_app_capability('PROJECT_MANAGE') then raise insufficient_privilege; end if;
 if p_kind='project' then delete from public.project where id=p_id and version=p_expected_version;
 elsif p_kind='assignment' then
  perform 1 from public.project where id=(select project_id from public.project_assignment where id=p_id) for update;
  delete from public.project_assignment where id=p_id and version=p_expected_version;
 else raise invalid_parameter_value; end if;
 if not found then raise serialization_failure; end if;
 -- Restrictive FKs retain projects with assignments/history, and assignments with career.
end; $$;
revoke all on function public.current_employee_id(),public.can_read_assignment(uuid),public.project_integrity(),public.project_audit(),public.save_project(uuid,jsonb,integer),public.save_assignment(uuid,jsonb,integer),public.save_career(uuid,jsonb,integer),public.delete_project_record(text,uuid,integer) from public,anon;
grant execute on function public.current_employee_id(),public.can_read_assignment(uuid),public.save_project(uuid,jsonb,integer),public.save_assignment(uuid,jsonb,integer),public.save_career(uuid,jsonb,integer),public.delete_project_record(text,uuid,integer) to authenticated;
commit;
