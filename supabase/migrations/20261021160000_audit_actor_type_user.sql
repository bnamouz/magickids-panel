-- Fix: audit_log.actor_type only allows user/system/parent/teacher/external. Both functions wrote 'staff',
-- so every clinical note save and every dashboard archive/restore rolled back since 16.10. Staff are authenticated users.
CREATE OR REPLACE FUNCTION public.manage_clinical_note(p_staff uuid, p_session uuid, p_note uuid, p_action text, p_version integer DEFAULT NULL::integer, p_content text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare n public.clinical_notes; actor_role text;
begin
 select role::text into actor_role from public.staff_users where id=p_staff and is_active;
 if actor_role is null then raise exception 'unauthorized'; end if;
 if p_action is null or p_action not in ('create','edit','void') then raise exception 'invalid_action'; end if;
 if p_note is null then raise exception 'invalid_data'; end if;
 -- Serialize note writes and permanent case deletion using the same parent lock.
 perform 1 from public.intake_sessions where id=p_session for update;
 if not found then raise exception 'case_not_found'; end if;
 if p_action in ('create','edit') and
   (p_content is null or length(trim(p_content)) not between 1 and 5000
    or p_category is null or p_category not in ('general','clinical','follow_up','flag'))
 then raise exception 'invalid_data'; end if;
 if p_action in ('edit','void') and
   (p_reason is null or length(trim(p_reason)) not between 3 and 1000)
 then raise exception 'reason_required'; end if;

 select * into n from public.clinical_notes where id=p_note for update;
 if p_action='create' then
  if found then
   -- A network retry with the same fixed client ID must not create another note.
   if n.session_id=p_session and n.staff_id=p_staff and n.version=0
     and n.content=trim(p_content) and n.category=p_category and n.voided_at is null
   then return jsonb_build_object('ok',true,'id',n.id,'version',n.version); end if;
   raise exception 'note_changed';
  end if;
  insert into public.clinical_notes(id,session_id,staff_id,category,content)
  values(p_note,p_session,p_staff,p_category,trim(p_content)) returning * into n;
 else
  if not found or n.session_id<>p_session then raise exception 'note_not_found'; end if;
  if actor_role<>'admin' and n.staff_id<>p_staff then raise exception 'forbidden'; end if;
  if n.version is distinct from p_version then raise exception 'note_changed'; end if;
  if n.voided_at is not null then raise exception 'note_voided'; end if;
  insert into public.clinical_note_revisions(note_id,version,category,content,changed_by,action,reason)
  values(n.id,n.version,n.category,n.content,p_staff,p_action,trim(p_reason));
  if p_action='edit' then
   update public.clinical_notes set content=trim(p_content),category=p_category,version=version+1,updated_at=now()
   where id=n.id returning * into n;
  else
   update public.clinical_notes set voided_at=now(),voided_by=p_staff,void_reason=trim(p_reason),
     version=version+1,updated_at=now() where id=n.id returning * into n;
  end if;
 end if;
 -- No clinical text in the general-purpose audit log. Everything is atomic. Staff are 'user' actors.
 insert into public.audit_log(actor_id,actor_type,action,entity_type,entity_id,metadata)
 values(p_staff,'user','clinical_note_'||p_action,'intake_session',p_session,
   jsonb_build_object('note_id',n.id,'version',n.version));
 return jsonb_build_object('ok',true,'id',n.id,'version',n.version);
end $function$;

CREATE OR REPLACE FUNCTION public.manage_dashboard_case(p_session uuid, p_staff uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb, p_version text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
 -- Staff are 'user' actors in audit_log.
 insert into public.audit_log(actor_id,actor_type,action,entity_type,entity_id,metadata) values(p_staff,'user','dashboard_case_'||p_action,'intake_session',p_session,'{}'::jsonb);
 return jsonb_build_object('ok',true);
end $function$;
