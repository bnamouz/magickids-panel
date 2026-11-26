-- Therapist edits of assigned treatment appointments: reschedule, cancel the
-- appointment (patient stays on the list) and remove the patient. Every change
-- is recorded with its reason. Additive only: one new table and three new
-- service-only functions. No existing table, function or row is modified.

create table public.treatment_request_changes (
 id uuid primary key,
 request_id uuid not null references public.treatment_requests(id),
 therapist_id uuid,
 kind text not null check(kind in ('rescheduled','cancelled','removed')),
 reason text not null check(reason ~ '^[a-z_]{2,40}$'),
 previous_at timestamptz,
 new_at timestamptz,
 note text check(note is null or length(note) between 1 and 300),
 whatsapp text check(whatsapp is null or length(whatsapp)<=40),
 actor text not null check(actor in ('therapist','staff')),
 staff_id uuid,
 created_at timestamptz not null default now(),
 check(kind<>'rescheduled' or (previous_at is not null and new_at is not null)),
 check(kind='rescheduled' or new_at is null),
 check(actor='staff' or staff_id is null)
);
create index treatment_request_changes_request on public.treatment_request_changes(request_id,created_at desc);
alter table public.treatment_request_changes enable row level security;
revoke all on public.treatment_request_changes from public,anon,authenticated;
grant select,insert,update on public.treatment_request_changes to service_role;

-- Move a scheduled appointment to a new start. One transaction: if the new slot
-- is not valid or overlaps anything (here or in the existing overlap triggers),
-- nothing changes and the old appointment stays as it was.
-- p_mode 'hours'  : general portal, validated against therapists.hours/leave_dates
--                   (same rules as schedule_assigned_treatment).
-- p_mode 'profile': personal diary; the server already matched p_start against
--                   the booking-profile slots. Here: ownership, state, horizon
--                   and overlap are re-checked under the lock.
-- The duration of the appointment is kept. The request's own current slot never
-- blocks itself.
create function public.reschedule_treatment_request(p_id uuid,p_therapist uuid,p_start timestamptz,p_mode text,
 p_change uuid,p_reason text,p_note text,p_actor text,p_staff uuid,p_whatsapp text)
returns text language plpgsql security invoker set search_path='' as $$
declare r public.treatment_requests; t public.therapists; local_start timestamp; local_end timestamp; m integer; finish integer;
begin
 perform pg_advisory_xact_lock(2026091202);
 select * into r from public.treatment_requests where id=p_id for update;
 if not found then return 'not_found'; end if;
 select * into t from public.therapists where id=p_therapist for update;
 if not found or not t.active or r.therapist_id is distinct from t.id then return 'not_assigned'; end if;
 if r.calendar_sync='syncing' then return 'busy'; end if;
 if r.status<>'scheduled' or r.scheduled_at is null then return 'invalid_state'; end if;
 if r.scheduled_at=p_start then return 'invalid_state'; end if;
 if p_mode not in ('hours','profile') then return 'invalid_request'; end if;
 if p_start<=now() or p_start>now()+interval '90 days' then return 'slot_taken'; end if;
 local_start=p_start at time zone 'Asia/Jerusalem'; local_end=(p_start+make_interval(mins=>r.duration_minutes)) at time zone 'Asia/Jerusalem';
 if local_start::date<>local_end::date or extract(second from local_start)<>0 then return 'slot_taken'; end if;
 if exists(select 1 from jsonb_array_elements(t.leave_dates) l where local_start::date between (l->>'start')::date and (l->>'end')::date) then return 'slot_taken'; end if;
 if p_mode='hours' then
  m=extract(hour from local_start)::integer*60+extract(minute from local_start)::integer;
  finish=extract(hour from local_end)::integer*60+extract(minute from local_end)::integer;
  if m%15<>0 then return 'slot_taken'; end if;
  if not exists(select 1 from jsonb_array_elements(t.hours) h where (h->>'day')::integer=extract(dow from local_start)::integer and (h->>'start')::integer<=m and (h->>'end')::integer>=finish) then return 'slot_taken'; end if;
 end if;
 if exists(select 1 from public.treatment_requests x where x.id<>r.id and x.status='scheduled' and (x.therapist_id=t.id or (x.therapist_id is null and lower(x.therapist)=lower(t.name))) and x.scheduled_at<p_start+make_interval(mins=>r.duration_minutes) and x.scheduled_at+make_interval(mins=>x.duration_minutes)>p_start) then return 'slot_taken'; end if;
 -- Existing triggers (parent booking requests, cross-calendar guard) raise
 -- 'slot_taken' here and roll the whole call back.
 update public.treatment_requests set scheduled_at=p_start,calendar_sync='pending',updated_by=p_staff,updated_at=now() where id=p_id;
 insert into public.treatment_request_changes(id,request_id,therapist_id,kind,reason,previous_at,new_at,note,whatsapp,actor,staff_id)
  values(p_change,p_id,t.id,'rescheduled',p_reason,r.scheduled_at,p_start,nullif(p_note,''),p_whatsapp,p_actor,p_staff);
 return 'rescheduled';
end $$;

-- Cancel a scheduled appointment. The patient stays assigned and waits for a
-- new time: status back to 'contacted', time cleared, calendar event removed by
-- the regular sync (calendar_sync 'pending' only when an event was stored).
create function public.cancel_treatment_appointment(p_id uuid,p_therapist uuid,
 p_change uuid,p_reason text,p_note text,p_actor text,p_staff uuid,p_whatsapp text)
returns text language plpgsql security invoker set search_path='' as $$
declare r public.treatment_requests;
begin
 perform pg_advisory_xact_lock(2026091202);
 select * into r from public.treatment_requests where id=p_id for update;
 if not found then return 'not_found'; end if;
 if r.therapist_id is distinct from p_therapist then return 'not_assigned'; end if;
 if r.calendar_sync='syncing' then return 'busy'; end if;
 if r.status<>'scheduled' then return 'invalid_state'; end if;
 update public.treatment_requests set status='contacted',scheduled_at=null,
  calendar_sync=case when r.calendar_event_id is not null then 'pending' else 'none' end,
  updated_by=p_staff,updated_at=now() where id=p_id;
 insert into public.treatment_request_changes(id,request_id,therapist_id,kind,reason,previous_at,new_at,note,whatsapp,actor,staff_id)
  values(p_change,p_id,p_therapist,'cancelled',p_reason,r.scheduled_at,null,nullif(p_note,''),p_whatsapp,p_actor,p_staff);
 return 'cancelled';
end $$;

-- Remove a patient from the therapist's list (same end state as the existing
-- close action: 'closed', calendar event deleted by the regular sync).
create function public.remove_treatment_patient(p_id uuid,p_therapist uuid,
 p_change uuid,p_reason text,p_note text,p_actor text,p_staff uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare r public.treatment_requests;
begin
 perform pg_advisory_xact_lock(2026091202);
 select * into r from public.treatment_requests where id=p_id for update;
 if not found then return 'not_found'; end if;
 if r.therapist_id is distinct from p_therapist then return 'not_assigned'; end if;
 if r.calendar_sync='syncing' then return 'busy'; end if;
 if r.status not in ('pending','contacted','scheduled') then return 'invalid_state'; end if;
 update public.treatment_requests set status='closed',calendar_sync='pending',updated_by=p_staff,updated_at=now() where id=p_id;
 insert into public.treatment_request_changes(id,request_id,therapist_id,kind,reason,previous_at,new_at,note,whatsapp,actor,staff_id)
  values(p_change,p_id,p_therapist,'removed',p_reason,case when r.status='scheduled' then r.scheduled_at end,null,nullif(p_note,''),null,p_actor,p_staff);
 return 'removed';
end $$;

revoke all on function public.reschedule_treatment_request(uuid,uuid,timestamptz,text,uuid,text,text,text,uuid,text),
 public.cancel_treatment_appointment(uuid,uuid,uuid,text,text,text,uuid,text),
 public.remove_treatment_patient(uuid,uuid,uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.reschedule_treatment_request(uuid,uuid,timestamptz,text,uuid,text,text,text,uuid,text),
 public.cancel_treatment_appointment(uuid,uuid,uuid,text,text,text,uuid,text),
 public.remove_treatment_patient(uuid,uuid,uuid,text,text,text,uuid) to service_role;
