alter table public.moxo_requests add column preferred_start timestamptz;
alter table public.moxo_requests alter column duration_minutes set default 60;
create or replace function public.approve_moxo_request(p_id uuid,p_start timestamptz,p_duration integer,p_staff uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare r public.moxo_requests; l timestamp;
begin
 perform pg_advisory_xact_lock(20260909);
 select * into r from public.moxo_requests where id=p_id for update;
 if not found then return 'not_found'; end if;
 if r.status='approved' then
  if r.scheduled_at=p_start and r.duration_minutes=p_duration then return 'approved'; end if;
  return 'already_approved';
 end if;
 if r.status<>'pending' then return 'not_pending'; end if;
 l=p_start at time zone 'Asia/Jerusalem';
 if p_start<=now() or p_duration<>60 or extract(dow from l) not in (2,4) or extract(hour from l) not between 9 and 12 or extract(minute from l)<>0 or extract(second from l)<>0 then return 'invalid_slot'; end if;
 if exists(select 1 from public.moxo_requests where status='approved' and scheduled_at<p_start+interval '1 hour' and scheduled_at+make_interval(mins=>duration_minutes)>p_start) then return 'slot_taken'; end if;
 update public.moxo_requests set status='approved',scheduled_at=p_start,duration_minutes=60,approved_by=p_staff,approved_at=now() where id=p_id;
 return 'approved';
end $$;
create function public.submit_moxo_preference(p_id uuid,p_patient text,p_contact text,p_phone text,p_language text,p_date date,p_start timestamptz)
returns text language plpgsql security invoker set search_path='' as $$
declare prior public.moxo_requests; result text; l timestamp;
begin
 perform pg_advisory_xact_lock(hashtext(p_phone));
 select * into prior from public.moxo_requests where id=p_id;
 if found and prior.preferred_start is distinct from p_start then return 'invalid_retry'; end if;
 if not found then
  if p_date is not null and extract(dow from p_date) not in (2,4) then return 'invalid_date'; end if;
  if p_start is not null then
   l=p_start at time zone 'Asia/Jerusalem';
   if p_date is null or l::date<>p_date or p_start<=now() or extract(dow from l) not in (2,4) or extract(hour from l) not between 9 and 12 or extract(minute from l)<>0 or extract(second from l)<>0 then return 'invalid_slot'; end if;
  end if;
 end if;
 result=public.submit_moxo_request(p_id,p_patient,p_contact,p_phone,p_language,p_date);
 if result='pending' then update public.moxo_requests set preferred_start=p_start where id=p_id; end if;
 return result;
end $$;
revoke all on function public.approve_moxo_request(uuid,timestamptz,integer,uuid),public.submit_moxo_preference(uuid,text,text,text,text,date,timestamptz) from public,anon,authenticated;
grant execute on function public.approve_moxo_request(uuid,timestamptz,integer,uuid),public.submit_moxo_preference(uuid,text,text,text,text,date,timestamptz) to service_role;
