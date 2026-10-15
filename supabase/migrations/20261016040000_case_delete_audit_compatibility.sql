-- Fix deletion compatibility with production's immutable audit log.
-- Installing this function does not delete any case or audit record.
-- Keep all authorization, appointment, document and shared-patient safeguards.
create or replace function public.delete_intake_case(p_session uuid,p_staff uuid,p_expected_name text)
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
 perform 1 from public.appointments where session_id=p_session for update;
 if exists(select 1 from public.appointments where session_id=p_session and (
  (status::text in ('scheduled','confirmed') and scheduled_at+make_interval(mins=>duration_minutes)>now())
  or calendar_sync in ('syncing','cancelling')
 )) then raise exception 'active_appointment';end if;
 if exists(select 1 from public.moxo_tests where session_id=p_session and nullif(results_pdf_path,'') is not null) then raise exception 'external_document';end if;
 select coalesce(array_agg(distinct pdf_storage_path) filter(where nullif(pdf_storage_path,'') is not null),'{}') into paths from public.reports where session_id=p_session;
 if exists(select 1 from public.reports where session_id<>p_session and pdf_storage_path=any(paths)) then raise exception 'shared_document';end if;
 insert into public.case_deletion_jobs(session_id,staff_id,report_paths,files_deleted_at) values(p_session,p_staff,paths,case when cardinality(paths)=0 then now() end);
 -- Audit is append-only. Never disable its trigger or delete historical entries.
 delete from public.intake_sessions where id=p_session;
 if not exists(select 1 from public.intake_sessions where patient_id=s.patient_id)
 and not exists(select 1 from public.appointments where patient_id=s.patient_id)
 and not exists(select 1 from public.intake_sessions i join public.parents p on p.id=i.primary_parent_id where p.patient_id=s.patient_id)
 then delete from public.patients where id=s.patient_id;end if;
 -- Staff are authenticated users; 'staff' is not a valid production actor_type.
 insert into public.audit_log(actor_id,actor_type,action,entity_type,entity_id,metadata)
 values(p_staff,'user','case_permanently_deleted','intake_session',p_session,'{}');
 return p_session;
end $$;
revoke all on function public.delete_intake_case(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.delete_intake_case(uuid,uuid,text) to service_role;
