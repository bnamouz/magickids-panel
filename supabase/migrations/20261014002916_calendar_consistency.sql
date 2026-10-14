-- One read model and one database guard for all booking entry points.
alter table public.appointments add column if not exists calendar_sync text not null default 'pending';
alter table public.appointments add column if not exists calendar_checked_at timestamptz;
alter table public.appointments add column if not exists calendar_sync_started_at timestamptz;
update public.appointments set calendar_sync='synced' where gcal_event_id is not null and gcal_calendar_id is not null;

create or replace view public.v_calendar_reservations with (security_invoker=true) as
select 'website_bookings'::text source,id,starts_at,ends_at,calendar_id,event_id,
 'doctor'::text staff_resource,null::text therapist_name,status::text status
from public.website_bookings where status<>'released'
union all
select 'appointments',id,scheduled_at,scheduled_at+make_interval(mins=>duration_minutes),gcal_calendar_id,gcal_event_id,
 case when appointment_type::text in ('assessment','followup') then 'doctor' end,null,status::text
from public.appointments where status::text in ('scheduled','confirmed')
union all
select 'moxo_requests',id,scheduled_at,scheduled_at+make_interval(mins=>duration_minutes),google_calendar_id,google_event_id,null,null,status
from public.moxo_requests where status='approved'
union all
select 'treatment_requests',id,scheduled_at,scheduled_at+make_interval(mins=>duration_minutes),calendar_id,calendar_event_id,
 'therapist:'||therapist_id::text,lower(trim(therapist)),status
from public.treatment_requests where status='scheduled'
union all
select 'therapist_booking_requests',b.id,b.starts_at,b.ends_at,b.calendar_id,b.event_id,
 'therapist:'||b.therapist_id::text,lower(trim(t.name)),b.status
from public.therapist_booking_requests b join public.therapists t on t.id=b.therapist_id
where b.status in ('syncing','confirmed','cancelling') or (b.status='pending' and b.expires_at>now());
revoke all on public.v_calendar_reservations from public,anon,authenticated;
grant select on public.v_calendar_reservations to service_role;

create or replace function public.guard_calendar_reservation() returns trigger
language plpgsql set search_path='' as $$
declare j jsonb:=to_jsonb(new); s timestamptz; e timestamptz; cal text; ev text; resource text; therapist text; active boolean:=false;
begin
 if tg_table_name='website_bookings' then
  active:=j->>'status'<>'released'; s:=(j->>'starts_at')::timestamptz;e:=(j->>'ends_at')::timestamptz;
  cal:=j->>'calendar_id';ev:=j->>'event_id';resource:='doctor';
 elsif tg_table_name='appointments' then
  active:=j->>'status' in ('scheduled','confirmed');s:=(j->>'scheduled_at')::timestamptz;e:=s+make_interval(mins=>(j->>'duration_minutes')::int);
  cal:=j->>'gcal_calendar_id';ev:=j->>'gcal_event_id';if j->>'appointment_type' in ('assessment','followup') then resource:='doctor';end if;
 elsif tg_table_name='moxo_requests' then
  active:=j->>'status'='approved';s:=(j->>'scheduled_at')::timestamptz;e:=s+make_interval(mins=>(j->>'duration_minutes')::int);
  cal:=j->>'google_calendar_id';ev:=j->>'google_event_id';
 elsif tg_table_name='treatment_requests' then
  active:=j->>'status'='scheduled';s:=(j->>'scheduled_at')::timestamptz;e:=s+make_interval(mins=>(j->>'duration_minutes')::int);
  cal:=j->>'calendar_id';ev:=j->>'calendar_event_id';resource:='therapist:'||(j->>'therapist_id');therapist:=lower(trim(j->>'therapist'));
 else
  active:=j->>'status' in ('syncing','confirmed','cancelling') or (j->>'status'='pending' and (j->>'expires_at')::timestamptz>now());
  s:=(j->>'starts_at')::timestamptz;e:=(j->>'ends_at')::timestamptz;cal:=j->>'calendar_id';ev:=j->>'event_id';resource:='therapist:'||(j->>'therapist_id');
  select lower(trim(name)) into therapist from public.therapists where id=(j->>'therapist_id')::uuid;
 end if;
 if not active then return new;end if;
 if s is null or e is null or e<=s then raise exception 'invalid_slot';end if;
 -- All five tables serialize against the same lock, including legacy writers.
 perform pg_advisory_xact_lock(2026101401);
 if exists(select 1 from public.v_calendar_reservations r
  where not(r.source=tg_table_name and r.id=new.id) and r.starts_at<e and r.ends_at>s
  and ((cal is not null and r.calendar_id=cal) or (resource is not null and r.staff_resource=resource)
    or (therapist is not null and therapist<>'' and r.therapist_name=therapist))
  and not(ev is not null and r.event_id=ev and r.calendar_id is not distinct from cal))
 then raise exception 'slot_taken' using errcode='23P01';end if;
 return new;
end $$;
revoke all on function public.guard_calendar_reservation() from public,anon,authenticated;
grant execute on function public.guard_calendar_reservation() to service_role;
create trigger zz_calendar_reservation_guard before insert or update of starts_at,ends_at,status,calendar_id,event_id on public.website_bookings for each row execute function public.guard_calendar_reservation();
create trigger zz_calendar_reservation_guard before insert or update of scheduled_at,duration_minutes,status,gcal_calendar_id,gcal_event_id on public.appointments for each row execute function public.guard_calendar_reservation();
create trigger zz_calendar_reservation_guard before insert or update of scheduled_at,duration_minutes,status,google_calendar_id,google_event_id on public.moxo_requests for each row execute function public.guard_calendar_reservation();
create trigger zz_calendar_reservation_guard before insert or update of scheduled_at,duration_minutes,status,calendar_id,calendar_event_id,therapist_id,therapist on public.treatment_requests for each row execute function public.guard_calendar_reservation();
create trigger zz_calendar_reservation_guard before insert or update of starts_at,ends_at,status,calendar_id,event_id on public.therapist_booking_requests for each row execute function public.guard_calendar_reservation();

create table public.calendar_sync_health(id boolean primary key default true check(id),last_run timestamptz,lease_id uuid,lease_until timestamptz,details jsonb not null default '{}');
alter table public.calendar_sync_health enable row level security;
revoke all on public.calendar_sync_health from anon,authenticated;
grant all on public.calendar_sync_health to service_role;

insert into public.calendar_sync_health(id) values(true);
