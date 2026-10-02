create table public.therapists (
 id uuid primary key default gen_random_uuid(), name text not null, email text not null,
 treatments text[] not null, active boolean not null default true,
 duration integer not null default 60 check(duration between 15 and 180),
 hours jsonb not null default '[]', leave_dates jsonb not null default '[]',
 token_version uuid not null default gen_random_uuid(), token_expires_at timestamptz not null default now()+interval '90 days',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(length(name) between 2 and 100), check(cardinality(treatments)>0)
);
create unique index therapists_email_unique on public.therapists(lower(email));
alter table public.therapists enable row level security;
revoke all on public.therapists from public,anon,authenticated;
grant all on public.therapists to service_role;
alter table public.treatment_requests add column therapist_id uuid references public.therapists(id),
 add column reminder_consent boolean not null default false,
 add column calendar_sync text not null default 'none',
 add column calendar_sync_started_at timestamptz, add column calendar_id text, add column calendar_event_id text, add column calendar_synced_at timestamptz;
create index treatment_requests_therapist on public.treatment_requests(therapist_id,scheduled_at);

-- Staff and therapist endpoints authenticate before invoking this service-only function.
-- Shared lock also serializes the legacy booking function during rollout.
create function public.schedule_assigned_treatment(p_id uuid,p_therapist uuid,p_start timestamptz,p_staff uuid default null)
returns text language plpgsql security invoker set search_path='' as $$
declare r public.treatment_requests; t public.therapists; local_start timestamp; local_end timestamp; m integer; finish integer;
begin
 perform pg_advisory_xact_lock(2026091202);
 select * into r from public.treatment_requests where id=p_id for update;
 if not found then return 'not_found'; end if;
 select * into t from public.therapists where id=p_therapist for update;
 if not found or not t.active or r.therapist_id is distinct from t.id or not (r.treatment=any(t.treatments)) then return 'not_assigned'; end if;
 if r.calendar_sync='syncing' then return 'syncing'; end if;
 if r.status='closed' then return 'closed'; end if;
 if p_start<=now() or p_start>now()+interval '90 days' then return 'invalid_slot'; end if;
 local_start=p_start at time zone 'Asia/Jerusalem'; local_end=(p_start+make_interval(mins=>t.duration)) at time zone 'Asia/Jerusalem';
 m=extract(hour from local_start)::integer*60+extract(minute from local_start)::integer;
 finish=extract(hour from local_end)::integer*60+extract(minute from local_end)::integer;
 if local_start::date<>local_end::date or extract(second from local_start)<>0 or m%15<>0 then return 'outside_hours'; end if;
 if not exists(select 1 from jsonb_array_elements(t.hours) h where (h->>'day')::integer=extract(dow from local_start)::integer and (h->>'start')::integer<=m and (h->>'end')::integer>=finish) then return 'outside_hours'; end if;
 if exists(select 1 from jsonb_array_elements(t.leave_dates) l where local_start::date between (l->>'start')::date and (l->>'end')::date) then return 'on_leave'; end if;
 if exists(select 1 from public.treatment_requests x where x.id<>r.id and x.status='scheduled' and (x.therapist_id=t.id or (x.therapist_id is null and lower(x.therapist)=lower(t.name))) and x.scheduled_at<p_start+make_interval(mins=>t.duration) and x.scheduled_at+make_interval(mins=>x.duration_minutes)>p_start) then return 'slot_taken'; end if;
 update public.treatment_requests set therapist=t.name,status='scheduled',scheduled_at=p_start,duration_minutes=t.duration,calendar_sync='pending',updated_by=p_staff,updated_at=now() where id=p_id;
 return 'scheduled';
end $$;
revoke all on function public.schedule_assigned_treatment(uuid,uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.schedule_assigned_treatment(uuid,uuid,timestamptz,uuid) to service_role;
create table public.treatment_worker_state(id boolean primary key default true check(id),last_run timestamptz);
alter table public.treatment_worker_state enable row level security;
revoke all on public.treatment_worker_state from public,anon,authenticated;
grant all on public.treatment_worker_state to service_role;
