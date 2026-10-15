-- Additive only: existing notes and reports are retained.
-- All application writes already use authenticated server routes + service_role.
-- Prevent direct client writes from bypassing version/audit checks.
revoke insert,update,delete,truncate,references,trigger on public.clinical_notes from public,anon,authenticated;
alter table public.clinical_notes
 add column if not exists version integer not null default 0,
 add column if not exists voided_at timestamptz,
 add column if not exists voided_by uuid,
 add column if not exists void_reason text;

create table public.clinical_note_revisions (
 id bigint generated always as identity primary key,
 note_id uuid not null references public.clinical_notes(id) on delete cascade,
 version integer not null,
 category text not null,
 content text not null,
 changed_by uuid not null references public.users(id),
 changed_at timestamptz not null default now(),
 action text not null check (action in ('edit','void')),
 reason text not null,
 unique(note_id, version)
);
alter table public.clinical_note_revisions enable row level security;
revoke all on public.clinical_note_revisions from public,anon,authenticated;
grant select,insert,delete on public.clinical_note_revisions to service_role;
grant usage,select on sequence public.clinical_note_revisions_id_seq to service_role;

create function public.manage_clinical_note(
 p_staff uuid, p_session uuid, p_note uuid, p_action text,
 p_version integer default null, p_content text default null,
 p_category text default null, p_reason text default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
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
 -- No clinical text in the general-purpose audit log. Everything is atomic.
 insert into public.audit_log(actor_id,actor_type,action,entity_type,entity_id,metadata)
 values(p_staff,'staff','clinical_note_'||p_action,'intake_session',p_session,
   jsonb_build_object('note_id',n.id,'version',n.version));
 return jsonb_build_object('ok',true,'id',n.id,'version',n.version);
end $$;
revoke all on function public.manage_clinical_note(uuid,uuid,uuid,text,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.manage_clinical_note(uuid,uuid,uuid,text,integer,text,text,text) to service_role;
