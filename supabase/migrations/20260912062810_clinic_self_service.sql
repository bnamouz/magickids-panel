-- Public requests are submitted through the server only; staff-only queue.
create table public.treatment_requests (
 id uuid primary key,
 patient_name text not null check(length(patient_name) between 2 and 100),
 contact_name text not null check(length(contact_name) between 2 and 100),
 phone text not null check(phone ~ '^\+9725[0-9]{8}$'),
 ip_hash text not null,
 treatment text not null check(treatment in ('speech','occupational','emotional','parent-guidance','groups','other')),
 language text not null check(language in ('he','ar','en')),
 availability text not null default '' check(length(availability)<=300),
 status text not null default 'pending' check(status in ('pending','contacted','scheduled','closed')),
 therapist text,
 scheduled_at timestamptz,
 duration_minutes integer check(duration_minutes between 15 and 180),
 updated_by uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(status<>'scheduled' or (therapist is not null and scheduled_at is not null and duration_minutes is not null))
);
alter table public.treatment_requests enable row level security;
revoke all on public.treatment_requests from public,anon,authenticated;
grant select,insert,update,delete on public.treatment_requests to service_role;
create index treatment_requests_queue on public.treatment_requests(status,treatment,created_at);
create index treatment_requests_phone on public.treatment_requests(phone,created_at);
create index treatment_requests_ip on public.treatment_requests(ip_hash,created_at);
create function public.submit_treatment_request(p_id uuid,p_patient text,p_contact text,p_phone text,p_ip text,p_treatment text,p_language text,p_availability text)
returns text language plpgsql security invoker set search_path='' as $$
declare r public.treatment_requests;
begin
 perform pg_advisory_xact_lock(2026091201);
 select * into r from public.treatment_requests where id=p_id;
 if found then
  if r.patient_name=p_patient and r.contact_name=p_contact and r.phone=p_phone and r.treatment=p_treatment and r.language=p_language and r.availability=p_availability then return 'received'; end if;
  return 'invalid_retry';
 end if;
 if (select count(*) from public.treatment_requests where phone=p_phone and created_at>now()-interval '1 day')>=3
 or (select count(*) from public.treatment_requests where ip_hash=p_ip and created_at>now()-interval '1 hour')>=12 then return 'rate_limited'; end if;
 insert into public.treatment_requests(id,patient_name,contact_name,phone,ip_hash,treatment,language,availability) values(p_id,p_patient,p_contact,p_phone,p_ip,p_treatment,p_language,p_availability);
 return 'received';
end $$;
revoke all on function public.submit_treatment_request(uuid,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_treatment_request(uuid,text,text,text,text,text,text,text) to service_role;
create function public.schedule_treatment_request(p_id uuid,p_start timestamptz,p_duration integer,p_therapist text,p_staff uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare r public.treatment_requests;
begin
 perform pg_advisory_xact_lock(2026091202);
 select * into r from public.treatment_requests where id=p_id for update;
 if not found then return 'not_found'; end if;
 if p_start<=now() or p_duration<15 or p_duration>180 or length(trim(p_therapist))<2 or length(trim(p_therapist))>100 then return 'invalid_slot'; end if;
 if r.status='scheduled' then
  if r.scheduled_at=p_start and r.duration_minutes=p_duration and r.therapist=trim(p_therapist) then return 'scheduled'; end if;
  return 'already_scheduled';
 end if;
 if r.status not in ('pending','contacted') then return 'closed'; end if;
 if exists(select 1 from public.treatment_requests where status='scheduled' and lower(therapist)=lower(trim(p_therapist)) and scheduled_at<p_start+make_interval(mins=>p_duration) and scheduled_at+make_interval(mins=>duration_minutes)>p_start) then return 'slot_taken'; end if;
 update public.treatment_requests set status='scheduled',scheduled_at=p_start,duration_minutes=p_duration,therapist=trim(p_therapist),updated_by=p_staff,updated_at=now() where id=p_id;
 return 'scheduled';
end $$;
revoke all on function public.schedule_treatment_request(uuid,timestamptz,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.schedule_treatment_request(uuid,timestamptz,integer,text,uuid) to service_role;
