-- Applied as migration 20261008052117. No existing patient records are changed.
create table public.therapist_booking_profiles (
 therapist_id uuid primary key references public.therapists(id),
 slug text not null unique check(slug ~ '^[a-z][a-z0-9-]{1,50}$'),
 calendar_id text not null check(length(calendar_id)>20),
 enabled boolean not null default false,
 availability jsonb not null,
 version integer not null default 1,
 updated_at timestamptz not null default now()
);
create table public.therapist_booking_requests (
 id uuid primary key,
 therapist_id uuid not null references public.therapists(id),
 parent_hash text not null check(length(parent_hash)=64),
 patient_name text not null check(length(patient_name) between 2 and 100),
 contact_name text not null check(length(contact_name) between 2 and 100),
 phone text not null check(phone ~ '^\+9725[0-9]{8}$'),
 ip_hash text not null,
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 duration integer not null check(duration in (30,45,60,90)),
 status text not null default 'pending' check(status in ('pending','syncing','confirmed','rejected','expired','cancelling','cancelled')),
 expires_at timestamptz not null,
 calendar_id text not null,
 event_id text not null unique,
 lease_id uuid,
 lease_until timestamptz,
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(ends_at>starts_at)
);
create index therapist_booking_requests_slots on public.therapist_booking_requests(therapist_id,starts_at,ends_at);
create index therapist_booking_requests_phone on public.therapist_booking_requests(phone,created_at);
create index therapist_booking_requests_ip on public.therapist_booking_requests(ip_hash,created_at);
alter table public.therapist_booking_profiles enable row level security;
alter table public.therapist_booking_requests enable row level security;
revoke all on public.therapist_booking_profiles,public.therapist_booking_requests from public,anon,authenticated;
grant all on public.therapist_booking_profiles,public.therapist_booking_requests to service_role;

create function public.therapy_booking_valid_slot(p_therapist uuid,p_start timestamptz,p_end timestamptz)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists (
  select 1 from public.therapist_booking_profiles p join public.therapists t on t.id=p.therapist_id
  cross join lateral jsonb_array_elements(p.availability->'windows') w
  where p.therapist_id=p_therapist and p.enabled and t.active
   and extract(second from p_start)=0
   and (p_start at time zone 'Asia/Jerusalem')::date=(p_end at time zone 'Asia/Jerusalem')::date
   and (w->>'day')::integer=extract(dow from p_start at time zone 'Asia/Jerusalem')::integer
   and (extract(hour from p_start at time zone 'Asia/Jerusalem')::integer*60+extract(minute from p_start at time zone 'Asia/Jerusalem')::integer)>=(w->>'start')::integer
   and (extract(hour from p_end at time zone 'Asia/Jerusalem')::integer*60+extract(minute from p_end at time zone 'Asia/Jerusalem')::integer)<=(w->>'end')::integer
   and mod(extract(hour from p_start at time zone 'Asia/Jerusalem')::integer*60+extract(minute from p_start at time zone 'Asia/Jerusalem')::integer-(w->>'start')::integer,(w->>'duration')::integer)=0
   and p_end=p_start+make_interval(mins=>(w->>'duration')::integer)
   and not (p.availability->'closedDates' ? ((p_start at time zone 'Asia/Jerusalem')::date::text))
   and not exists(select 1 from jsonb_array_elements(t.leave_dates) l
    where (p_start at time zone 'Asia/Jerusalem')::date between (l->>'start')::date and (l->>'end')::date)
 );
$$;
create function public.therapy_booking_conflict(p_therapist uuid,p_start timestamptz,p_end timestamptz,p_exclude uuid default null)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.therapist_booking_requests r where r.therapist_id=p_therapist
  and (p_exclude is null or r.id<>p_exclude)
  and (r.status in ('syncing','confirmed','cancelling') or (r.status='pending' and r.expires_at>now()))
  and r.starts_at<p_end and r.ends_at>p_start)
 or exists(select 1 from public.treatment_requests r join public.therapists t on t.id=p_therapist
  where r.status='scheduled' and (r.therapist_id=p_therapist or (r.therapist_id is null and lower(r.therapist)=lower(t.name)))
  and r.scheduled_at<p_end and r.scheduled_at+make_interval(mins=>r.duration_minutes)>p_start);
$$;
create function public.submit_therapy_booking(p_id uuid,p_slug text,p_hash text,p_patient text,p_contact text,p_phone text,p_ip text,p_start timestamptz,p_end timestamptz)
returns text language plpgsql security invoker set search_path='' as $$
declare p public.therapist_booking_profiles; r public.therapist_booking_requests; d integer;
begin
 perform pg_advisory_xact_lock(2026091202);
 select * into p from public.therapist_booking_profiles where slug=p_slug for update;
 if not found or not p.enabled then return 'unavailable'; end if;
 select * into r from public.therapist_booking_requests where id=p_id;
 if found then
  if r.therapist_id=p.therapist_id and r.parent_hash=p_hash and r.starts_at=p_start and r.ends_at=p_end
    and r.patient_name=p_patient and r.contact_name=p_contact and r.phone=p_phone then return 'received'; end if;
  return 'invalid_retry';
 end if;
 if p_start<=now()+interval '1 hour' or p_start>now()+interval '28 days' then return 'invalid_slot'; end if;
 if not public.therapy_booking_valid_slot(p.therapist_id,p_start,p_end) then return 'invalid_slot'; end if;
 if public.therapy_booking_conflict(p.therapist_id,p_start,p_end) then return 'slot_taken'; end if;
 if (select count(*) from public.therapist_booking_requests where phone=p_phone and created_at>now()-interval '1 day')>=3
 or (select count(*) from public.therapist_booking_requests where ip_hash=p_ip and created_at>now()-interval '1 hour')>=12 then return 'rate_limited'; end if;
 d=extract(epoch from p_end-p_start)::integer/60;
 insert into public.therapist_booking_requests(id,therapist_id,parent_hash,patient_name,contact_name,phone,ip_hash,starts_at,ends_at,duration,expires_at,calendar_id,event_id)
 values(p_id,p.therapist_id,p_hash,p_patient,p_contact,p_phone,p_ip,p_start,p_end,d,least(now()+interval '24 hours',p_start),p.calendar_id,'ranabook'||replace(p_id::text,'-',''));
 return 'received';
end $$;
create function public.claim_therapy_booking(p_id uuid,p_therapist uuid,p_action text,p_lease uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare r public.therapist_booking_requests;
begin
 perform pg_advisory_xact_lock(2026091202);
 select * into r from public.therapist_booking_requests where id=p_id and therapist_id=p_therapist for update;
 if not found then return 'not_found'; end if;
 if r.status='pending' and (r.expires_at<=now() or r.starts_at<=now()) then
  update public.therapist_booking_requests set status='expired',updated_at=now() where id=p_id;
  return 'expired';
 end if;
 if p_action='reject' then
  if r.status='rejected' then return 'rejected'; end if;
  if r.status<>'pending' then return 'cannot_reject'; end if;
  update public.therapist_booking_requests set status='rejected',updated_at=now() where id=p_id;
  return 'rejected';
 end if;
 if r.lease_until>now() then return 'busy'; end if;
 if p_action='approve' then
  if r.status='confirmed' then return 'confirmed'; end if;
  if r.status not in ('pending','syncing') then return 'invalid_state'; end if;
  -- Sync retries reconcile an uncertain Google write even after hours changed.
  if r.status='pending' and (not public.therapy_booking_valid_slot(r.therapist_id,r.starts_at,r.ends_at)
    or public.therapy_booking_conflict(r.therapist_id,r.starts_at,r.ends_at,r.id)) then return 'slot_taken'; end if;
  update public.therapist_booking_requests set status='syncing',lease_id=p_lease,lease_until=now()+interval '3 minutes',last_error=null,updated_at=now() where id=p_id;
  return 'claimed';
 elsif p_action='cancel' then
  if r.status='cancelled' then return 'cancelled'; end if;
  if r.status not in ('confirmed','syncing','cancelling') then return 'invalid_state'; end if;
  update public.therapist_booking_requests set status='cancelling',lease_id=p_lease,lease_until=now()+interval '3 minutes',last_error=null,updated_at=now() where id=p_id;
  return 'claimed';
 end if;
 return 'invalid_action';
end $$;
create function public.finish_therapy_booking(p_id uuid,p_lease uuid,p_result text)
returns text language plpgsql security invoker set search_path='' as $$
declare r public.therapist_booking_requests; s text;
begin
 perform pg_advisory_xact_lock(2026091202);
 select * into r from public.therapist_booking_requests where id=p_id for update;
 if not found or r.lease_id is distinct from p_lease then return 'lost_lease'; end if;
 if p_result='confirmed' and r.status='syncing' then s='confirmed';
 elsif p_result='cancelled' and r.status='cancelling' then s='cancelled';
 elsif p_result='conflict' and r.status='syncing' then s='pending';
 elsif p_result='failed' then s=r.status;
 else return 'invalid_state'; end if;
 update public.therapist_booking_requests set status=s,lease_id=null,lease_until=null,
  last_error=case when p_result in ('failed','conflict') then p_result else null end,updated_at=now() where id=p_id;
 return s;
end $$;
create function public.save_therapy_booking_hours(p_therapist uuid,p_version integer,p_availability jsonb)
returns text language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(2026091202);
 update public.therapist_booking_profiles set availability=p_availability,version=version+1,updated_at=now()
 where therapist_id=p_therapist and version=p_version;
 if not found then return 'stale_settings'; end if;
 return 'saved';
end $$;
-- Legacy scheduling takes the same lock, so concurrent old/new bookings cannot
-- book the same therapist. Existing scheduled rows are not modified.
create function public.guard_therapy_booking_overlap()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status='scheduled' then
  perform pg_advisory_xact_lock(2026091202);
  if exists(select 1 from public.therapist_booking_requests b join public.therapists t on t.id=b.therapist_id
   where (new.therapist_id=t.id or (new.therapist_id is null and lower(new.therapist)=lower(t.name)))
    and (b.status in ('syncing','confirmed','cancelling') or (b.status='pending' and b.expires_at>now()))
    and b.starts_at<new.scheduled_at+make_interval(mins=>new.duration_minutes) and b.ends_at>new.scheduled_at) then
    raise exception 'slot_taken'; end if;
 end if;
 return new;
end $$;
create trigger guard_therapy_booking_overlap before insert or update of status,scheduled_at,duration_minutes,therapist_id,therapist
 on public.treatment_requests for each row execute function public.guard_therapy_booking_overlap();
revoke all on function public.therapy_booking_valid_slot(uuid,timestamptz,timestamptz),public.therapy_booking_conflict(uuid,timestamptz,timestamptz,uuid),public.submit_therapy_booking(uuid,text,text,text,text,text,text,timestamptz,timestamptz),public.claim_therapy_booking(uuid,uuid,text,uuid),public.finish_therapy_booking(uuid,uuid,text),public.save_therapy_booking_hours(uuid,integer,jsonb),public.guard_therapy_booking_overlap() from public,anon,authenticated;
grant execute on function public.therapy_booking_valid_slot(uuid,timestamptz,timestamptz),public.therapy_booking_conflict(uuid,timestamptz,timestamptz,uuid),public.submit_therapy_booking(uuid,text,text,text,text,text,text,timestamptz,timestamptz),public.claim_therapy_booking(uuid,uuid,text,uuid),public.finish_therapy_booking(uuid,uuid,text),public.save_therapy_booking_hours(uuid,integer,jsonb),public.guard_therapy_booking_overlap() to service_role;
