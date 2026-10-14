create table public.case_deletion_jobs (
 session_id uuid primary key,
 staff_id uuid not null,
 report_paths text[] not null default '{}',
 created_at timestamptz not null default now(),
 files_deleted_at timestamptz
);
alter table public.case_deletion_jobs enable row level security;
revoke all on public.case_deletion_jobs from public,anon,authenticated;
grant all on public.case_deletion_jobs to service_role;

create function public.delete_intake_case(p_session uuid,p_staff uuid,p_expected_name text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare s public.intake_sessions; child_name text; paths text[];
begin
 if not exists(select 1 from public.staff_users where id=p_staff and is_active and role::text='admin') then raise exception 'admin_required';end if;
 select * into s from public.intake_sessions where id=p_session for update;
 if not found then
  if exists(select 1 from public.case_deletion_jobs where session_id=p_session) then return p_session;end if;
  raise exception 'case_not_found';
 end if;
 select trim(first_name||' '||last_name) into child_name from public.patients where id=s.patient_id;
 if child_name is distinct from p_expected_name then raise exception 'case_changed';end if;
 -- Row lock also prevents concurrent child inserts from passing their FK check.
 perform 1 from public.appointments where session_id=p_session for update;
 if exists(select 1 from public.appointments where session_id=p_session and (
  (status::text in ('scheduled','confirmed') and scheduled_at+make_interval(mins=>duration_minutes)>now())
  or calendar_sync in ('syncing','cancelling')
 )) then raise exception 'active_appointment';end if;
 -- Unknown external document storage must be resolved explicitly, never guessed.
 if exists(select 1 from public.moxo_tests where session_id=p_session and nullif(results_pdf_path,'') is not null) then raise exception 'external_document';end if;
 select coalesce(array_agg(distinct pdf_storage_path) filter(where nullif(pdf_storage_path,'') is not null),'{}') into paths from public.reports where session_id=p_session;
 if exists(select 1 from public.reports where session_id<>p_session and pdf_storage_path=any(paths)) then raise exception 'shared_document';end if;
 insert into public.case_deletion_jobs(session_id,staff_id,report_paths,files_deleted_at) values(p_session,p_staff,paths,case when cardinality(paths)=0 then now() end);
 delete from public.audit_log where entity_id=p_session;
 delete from public.intake_sessions where id=p_session;
 -- Preserve the shared patient/contact master when any other case or appointment uses it.
 if not exists(select 1 from public.intake_sessions where patient_id=s.patient_id)
 and not exists(select 1 from public.appointments where patient_id=s.patient_id)
 and not exists(select 1 from public.intake_sessions i join public.parents p on p.id=i.primary_parent_id where p.patient_id=s.patient_id)
 then delete from public.patients where id=s.patient_id;end if;
 insert into public.audit_log(actor_id,actor_type,action,entity_type,entity_id,metadata)
 values(p_staff,'staff','case_permanently_deleted','intake_session',p_session,'{}');
 return p_session;
end $$;
revoke all on function public.delete_intake_case(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.delete_intake_case(uuid,uuid,text) to service_role;

-- Match the production audit schema for edit/archive/restore too.
create or replace function public.manage_dashboard_case(p_session uuid,p_staff uuid,p_action text,p_data jsonb default '{}'::jsonb,p_version text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.intake_sessions; p public.patients; r public.parents; current_data jsonb; version text; actor_email text;
begin
 select email into actor_email from public.staff_users where id=p_staff and is_active=true;
 if actor_email is null then raise exception 'unauthorized'; end if;
 if p_action not in ('read','edit','archive','restore') then raise exception 'invalid_action'; end if;
 select * into s from public.intake_sessions where id=p_session for update;
 if not found then raise exception 'case_not_found'; end if;
 select * into p from public.patients where id=s.patient_id for update;
 select * into r from public.parents where id=s.primary_parent_id for update;
 current_data:=jsonb_build_object('first_name',p.first_name,'last_name',p.last_name,'birth_date',p.birth_date,
 'school',coalesce(p.school,''),'grade',coalesce(p.grade,''),'parent_name',coalesce(r.full_name,''),
 'parent_phone',coalesce(r.phone,''),'parent_email',coalesce(r.email::text,''),'teacher_name',coalesce(s.teacher_name,p.teacher_name,''),
 'teacher_phone',coalesce(s.teacher_phone,p.teacher_phone,''),'reason_for_referral',coalesce(s.reason_for_referral,''));
 version:=md5(current_data::text);
 if p_action='read' then return jsonb_build_object('fields',current_data,'version',version,'hasParent',r.id is not null,
 'archived',exists(select 1 from public.dashboard_case_archive where session_id=p_session)); end if;
 if p_action='edit' then
  if p_version is distinct from version then raise exception 'case_changed'; end if;
  if nullif(trim(p_data->>'first_name'),'') is null or nullif(trim(p_data->>'last_name'),'') is null or nullif(p_data->>'birth_date','') is null then raise exception 'invalid_data'; end if;
  update public.patients set first_name=p_data->>'first_name',last_name=p_data->>'last_name',birth_date=(p_data->>'birth_date')::date,
    school=nullif(p_data->>'school',''),grade=nullif(p_data->>'grade',''),teacher_name=nullif(p_data->>'teacher_name',''),teacher_phone=nullif(p_data->>'teacher_phone','') where id=s.patient_id;
  if r.id is not null then
   update public.parents set full_name=p_data->>'parent_name',phone=p_data->>'parent_phone',email=nullif(p_data->>'parent_email','') where id=r.id;
  end if;
  update public.intake_sessions set teacher_name=nullif(p_data->>'teacher_name',''),teacher_phone=nullif(p_data->>'teacher_phone',''),
    reason_for_referral=nullif(p_data->>'reason_for_referral','') where id=p_session;
 elsif p_action='archive' then
  insert into public.dashboard_case_archive(session_id,staff_id) values(p_session,p_staff) on conflict(session_id) do nothing;
 else
  delete from public.dashboard_case_archive where session_id=p_session;
 end if;
 insert into public.audit_log(actor_id,actor_type,action,entity_type,entity_id,metadata) values(p_staff,'staff','dashboard_case_'||p_action,'intake_session',p_session,'{}'::jsonb);
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.manage_dashboard_case(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.manage_dashboard_case(uuid,uuid,text,jsonb,text) to service_role;
