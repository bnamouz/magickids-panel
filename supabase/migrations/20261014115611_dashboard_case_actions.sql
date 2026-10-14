-- Dashboard visibility only. Clinical records, forms and appointments remain intact.
create table public.dashboard_case_archive (
 session_id uuid primary key references public.intake_sessions(id) on delete cascade,
 hidden_at timestamptz not null default now(),
 staff_id uuid not null
);
alter table public.dashboard_case_archive enable row level security;
revoke all on public.dashboard_case_archive from public,anon,authenticated;
grant all on public.dashboard_case_archive to service_role;

create function public.manage_dashboard_case(p_session uuid,p_staff uuid,p_action text,p_data jsonb default '{}'::jsonb,p_version text default null)
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
 insert into public.audit_log(session_id,actor,action,payload) values(p_session,'staff:'||actor_email,'dashboard_case_'||p_action,'{}'::jsonb);
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.manage_dashboard_case(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.manage_dashboard_case(uuid,uuid,text,jsonb,text) to service_role;
