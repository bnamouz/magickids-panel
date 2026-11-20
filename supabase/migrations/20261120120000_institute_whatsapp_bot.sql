-- Institute WhatsApp auto-reply bot (054-402-0043, UltraMsg instance173060).
-- Every webhook event is claimed once by its provider message id (unique), so
-- retries and the message_received/message_create pair never produce two replies.
-- The bot never forwards messages to other numbers; staff work from /admin/whatsapp-inbox.
create table if not exists public.institute_wa_chats (
  chat_phone text primary key check (chat_phone ~ '^[0-9]{6,20}$'),
  chat_id text check (chat_id is null or length(chat_id) <= 80),
  name text check (name is null or length(name) <= 160),
  language text check (language is null or language in ('he','ar')),
  paused_until timestamptz,
  paused_reason text check (paused_reason is null or paused_reason in ('staff_takeover','manual')),
  needs_staff boolean not null default false,
  staff_reason text check (staff_reason is null or length(staff_reason) <= 200),
  staff_flagged_at timestamptz,
  handled_at timestamptz,
  handled_by uuid,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_preview text check (last_preview is null or length(last_preview) <= 200),
  auto_reply_window_start timestamptz,
  auto_reply_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists institute_wa_chats_queue_idx on public.institute_wa_chats (needs_staff desc, last_inbound_at desc nulls last);

create table if not exists public.institute_wa_messages (
  id uuid primary key default gen_random_uuid(),
  chat_phone text not null references public.institute_wa_chats(chat_phone) on delete cascade,
  -- inbound: from the family; bot: auto reply (sent or shadow draft);
  -- bot_echo: message_create echo of a bot reply; staff: typed by staff on the phone/WhatsApp Web.
  direction text not null check (direction in ('inbound','bot','bot_echo','staff')),
  provider_id text unique check (provider_id is null or length(provider_id) <= 200),
  reference_id text unique check (reference_id is null or length(reference_id) <= 80),
  send_id text check (send_id is null or length(send_id) <= 80),
  body text check (body is null or length(body) <= 8000),
  type text not null default 'chat' check (length(type) <= 40),
  mode text not null check (mode in ('off','shadow','on')),
  status text not null default 'received' check (status in ('received','skipped','shadow','sending','sent','failed','uncertain','matched')),
  created_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb check (jsonb_typeof(meta) = 'object')
);
create index if not exists institute_wa_messages_chat_idx on public.institute_wa_messages (chat_phone, created_at desc);
create index if not exists institute_wa_messages_bot_idx on public.institute_wa_messages (created_at desc) where direction = 'bot';

alter table public.institute_wa_chats enable row level security;
alter table public.institute_wa_messages enable row level security;
-- No policies on purpose: only the server (service role) reads and writes these tables.
revoke all on public.institute_wa_chats, public.institute_wa_messages from public, anon, authenticated;
grant all on public.institute_wa_chats, public.institute_wa_messages to service_role;

-- Atomically decides whether one more auto reply (or shadow draft) may be created
-- for a chat, and records it as 'sending'/'shadow' before any provider call.
-- Serialised by an advisory lock so concurrent webhooks cannot exceed the caps.
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
