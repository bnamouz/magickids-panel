-- Run in the project's Supabase SQL editor. No patient data is included.
create table if not exists public.moxo_requests (
 id uuid primary key,
 patient_name text not null check(length(patient_name) between 2 and 100),
 contact_name text not null check(length(contact_name) between 2 and 100),
 phone text not null check(phone ~ '^\+9725[0-9]{8}$'),
 language text not null check(language in ('he','ar','en')),
 preferred_date date,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 scheduled_at timestamptz,
 duration_minutes integer not null default 30 check(duration_minutes between 15 and 120),
 approved_by uuid,
 created_at timestamptz not null default now(),
 approved_at timestamptz,
 check(status <> 'approved' or (scheduled_at is not null and approved_at is not null and approved_by is not null))
);
alter table public.moxo_requests enable row level security;
revoke all on public.moxo_requests from anon, authenticated;
grant all on public.moxo_requests to service_role;
create table if not exists public.clinic_notifications (
 id text primary key,
 state text not null default 'pending' check(state in ('pending','sending','accepted','failed','unknown')),
 provider_id text,
 updated_at timestamptz not null default now()
);
alter table public.clinic_notifications enable row level security;
revoke all on public.clinic_notifications from anon,authenticated;
grant all on public.clinic_notifications to service_role;
create or replace function public.approve_moxo_request(p_id uuid,p_start timestamptz,p_duration integer,p_staff uuid)
returns text language plpgsql security definer set search_path=public as $$
declare r public.moxo_requests;
begin
 perform pg_advisory_xact_lock(20260909);
 if p_start <= now() or p_duration < 15 or p_duration > 120 then return 'invalid_slot'; end if;
 select * into r from public.moxo_requests where id=p_id for update;
 if not found then return 'not_found'; end if;
 if r.status='approved' then
  if r.scheduled_at=p_start and r.duration_minutes=p_duration then return 'approved'; end if;
  return 'already_approved';
 end if;
 if r.status<>'pending' then return 'not_pending'; end if;
 if exists(select 1 from public.moxo_requests where status='approved' and scheduled_at < p_start + make_interval(mins=>p_duration) and scheduled_at + make_interval(mins=>duration_minutes) > p_start) then return 'slot_taken'; end if;
 update public.moxo_requests set status='approved',scheduled_at=p_start,duration_minutes=p_duration,approved_by=p_staff,approved_at=now() where id=p_id;
 return 'approved';
end $$;
revoke all on function public.approve_moxo_request(uuid,timestamptz,integer,uuid) from public,anon,authenticated;
grant execute on function public.approve_moxo_request(uuid,timestamptz,integer,uuid) to service_role;
create or replace function public.submit_moxo_request(p_id uuid,p_patient text,p_contact text,p_phone text,p_language text,p_date date)
returns text language plpgsql security definer set search_path=public as $$
declare r public.moxo_requests;
begin
 perform pg_advisory_xact_lock(hashtext(p_phone));
 select * into r from public.moxo_requests where id=p_id;
 if found then
  if r.patient_name=p_patient and r.contact_name=p_contact and r.phone=p_phone and r.language=p_language and r.preferred_date is not distinct from p_date then return 'pending'; end if;
  return 'invalid_retry';
 end if;
 if p_date < (now() at time zone 'Asia/Jerusalem')::date then return 'invalid_date'; end if;
 if (select count(*) from public.moxo_requests where phone=p_phone and created_at>now()-interval '1 day')>=3 then return 'rate_limited'; end if;
 insert into public.moxo_requests(id,patient_name,contact_name,phone,language,preferred_date) values(p_id,p_patient,p_contact,p_phone,p_language,p_date);
 return 'pending';
end $$;
revoke all on function public.submit_moxo_request(uuid,text,text,text,text,date) from public,anon,authenticated;
grant execute on function public.submit_moxo_request(uuid,text,text,text,text,date) to service_role;
