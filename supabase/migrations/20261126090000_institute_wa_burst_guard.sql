-- Institute WhatsApp bot: skip identical replies in the same chat within 30 minutes (burst guard).
create or replace function public.institute_wa_reserve_reply(
  p_chat text, p_body text, p_mode text, p_type text,
  p_chat_cap integer, p_global_cap integer, p_window_minutes integer, p_meta jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.institute_wa_chats; n_chat integer; n_global integer; ref text; new_id uuid;
begin
 if p_mode not in ('shadow','on') then return jsonb_build_object('result','mode_off'); end if;
 perform pg_advisory_xact_lock(hashtext('institute_wa_reserve_reply'));
 select * into c from public.institute_wa_chats where chat_phone = p_chat for update;
 if not found then return jsonb_build_object('result','no_chat'); end if;
 if c.paused_until is not null and c.paused_until > now() then return jsonb_build_object('result','paused'); end if;
 -- Burst guard: never create the same reply twice in one chat within 30 minutes
 -- (e.g. a parent sends five photos at once → one "please write text" reply).
 if exists (select 1 from public.institute_wa_messages
   where chat_phone = p_chat and direction = 'bot' and body = p_body
     and status in ('shadow','sending','sent','uncertain')
     and created_at > now() - interval '30 minutes') then
  return jsonb_build_object('result','duplicate_reply');
 end if;
 select count(*) into n_chat from public.institute_wa_messages
  where chat_phone = p_chat and direction = 'bot' and status in ('shadow','sending','sent','uncertain')
    and created_at > now() - make_interval(mins => p_window_minutes);
 if n_chat >= p_chat_cap then
  update public.institute_wa_chats set needs_staff = true, staff_reason = 'auto_reply_cap',
   staff_flagged_at = coalesce(staff_flagged_at, now()), handled_at = null, updated_at = now() where chat_phone = p_chat;
  return jsonb_build_object('result','chat_cap');
 end if;
 select count(*) into n_global from public.institute_wa_messages
  where direction = 'bot' and status in ('shadow','sending','sent','uncertain')
    and created_at > now() - interval '1 hour';
 if n_global >= p_global_cap then
  update public.institute_wa_chats set needs_staff = true, staff_reason = 'global_cap',
   staff_flagged_at = coalesce(staff_flagged_at, now()), handled_at = null, updated_at = now() where chat_phone = p_chat;
  return jsonb_build_object('result','global_cap');
 end if;
 ref := 'mkbot-' || replace(gen_random_uuid()::text, '-', '');
 insert into public.institute_wa_messages (chat_phone, direction, reference_id, body, type, mode, status, meta)
  values (p_chat, 'bot', ref, p_body, coalesce(p_type, 'chat'), p_mode, case when p_mode = 'on' then 'sending' else 'shadow' end, coalesce(p_meta, '{}'::jsonb))
  returning id into new_id;
 update public.institute_wa_chats set
  auto_reply_window_start = case when auto_reply_window_start is null or auto_reply_window_start < now() - make_interval(mins => p_window_minutes) then now() else auto_reply_window_start end,
  auto_reply_count = n_chat + 1,
  last_outbound_at = case when p_mode = 'on' then now() else last_outbound_at end,
  updated_at = now()
  where chat_phone = p_chat;
 return jsonb_build_object('result','ok','id',new_id,'reference_id',ref);
end $$;
revoke all on function public.institute_wa_reserve_reply(text,text,text,text,integer,integer,integer,jsonb) from public, anon, authenticated;
grant execute on function public.institute_wa_reserve_reply(text,text,text,text,integer,integer,integer,jsonb) to service_role;
