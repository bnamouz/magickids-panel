-- Run once with the database owner before enabling PUBLIC_BOOKING_ENABLED.
-- No names, phone numbers, questionnaire tokens, or medical notes are stored here.
create table if not exists public.website_bookings (
  id uuid primary key,
  clinic text not null check (clinic in ('pediatrics', 'adhd')),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  fingerprint text not null,
  phone_hash text not null,
  ip_hash text not null,
  session_id uuid,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'released')),
  calendar_id text not null,
  event_id text not null,
  attempt_id uuid not null,
  attempt_expires_at timestamptz not null default now() + interval '2 minutes',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists website_bookings_window on public.website_bookings(starts_at, ends_at) where status <> 'released';
create index if not exists website_bookings_phone on public.website_bookings(phone_hash, created_at);
create index if not exists website_bookings_ip on public.website_bookings(ip_hash, created_at);
alter table public.website_bookings enable row level security;
revoke all on public.website_bookings from anon, authenticated;
grant select, insert, update, delete on public.website_bookings to service_role;

create or replace function public.reserve_website_booking(
  p_id uuid, p_clinic text, p_start timestamptz, p_end timestamptz,
  p_fingerprint text, p_phone_hash text, p_ip_hash text,
  p_session_id uuid, p_calendar_id text, p_event_id text, p_attempt_id uuid
) returns text
language plpgsql security definer set search_path = '' as $$
declare prior public.website_bookings%rowtype;
begin
  -- Both clinics share one doctor. Serialize the overlap check and insert.
  perform pg_advisory_xact_lock(724693701);
  select * into prior from public.website_bookings where id = p_id;
  if found then
    if prior.fingerprint <> p_fingerprint then return 'invalid_retry'; end if;
    if prior.status = 'pending' then
      if prior.attempt_expires_at > now() then return 'processing'; end if;
      update public.website_bookings set attempt_id = p_attempt_id, attempt_expires_at = now() + interval '2 minutes', updated_at = now() where id = p_id;
    end if;
    return prior.status;
  end if;
  if p_start <= now() or p_end <= p_start or p_end > p_start + interval '60 minutes'
    or p_clinic not in ('pediatrics', 'adhd') then return 'invalid_slot'; end if;
  if (select count(*) from public.website_bookings where phone_hash = p_phone_hash and created_at > now() - interval '24 hours') >= 3
    or (select count(*) from public.website_bookings where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 12 then
    return 'rate_limited';
  end if;
  if exists(select 1 from public.website_bookings where status <> 'released' and starts_at < p_end and ends_at > p_start) then
    return 'slot_taken';
  end if;
  if p_session_id is not null and exists(select 1 from public.website_bookings where session_id = p_session_id and status <> 'released' and ends_at > now()) then
    return 'already_booked';
  end if;
  insert into public.website_bookings(id, clinic, starts_at, ends_at, fingerprint, phone_hash, ip_hash, session_id, calendar_id, event_id, attempt_id)
    values(p_id, p_clinic, p_start, p_end, p_fingerprint, p_phone_hash, p_ip_hash, p_session_id, p_calendar_id, p_event_id, p_attempt_id);
  return 'pending';
end;
$$;
revoke all on function public.reserve_website_booking(uuid,text,timestamptz,timestamptz,text,text,text,uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.reserve_website_booking(uuid,text,timestamptz,timestamptz,text,text,text,uuid,text,text,uuid) to service_role;
