-- Only hashes and routing metadata live here; request text remains in the private clinic calendar.
create table public.pediatrics_doctor_requests (
 id uuid primary key, fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
 phone_hash text not null, ip_hash text not null, calendar_day date not null,
 calendar_id text not null, created_at timestamptz not null default now()
);
alter table public.pediatrics_doctor_requests enable row level security;
revoke all on public.pediatrics_doctor_requests from public, anon, authenticated;
grant select, insert on public.pediatrics_doctor_requests to service_role;
create index doctor_requests_phone_time on public.pediatrics_doctor_requests(phone_hash,created_at);
create index doctor_requests_ip_time on public.pediatrics_doctor_requests(ip_hash,created_at);
create function public.reserve_pediatrics_doctor_request(p_id uuid,p_fingerprint text,p_phone text,p_ip text,p_day date,p_calendar text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare prior public.pediatrics_doctor_requests; lock_key bigint;
begin
 if p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' or p_phone is null or p_phone !~ '^[a-f0-9]{64}$' or p_ip is null or p_ip !~ '^[a-f0-9]{64}$' or p_calendar is null or length(p_calendar)=0 or p_day is null then
  return jsonb_build_object('error','invalid_body');
 end if;
 -- Sorted advisory locks serialize retries and phone/IP limits across concurrent requests.
 for lock_key in select distinct k from unnest(array[hashtextextended('doctor:id:'||p_id::text,0),hashtextextended('doctor:phone:'||p_phone,0),hashtextextended('doctor:ip:'||p_ip,0)]) k order by k loop
  perform pg_advisory_xact_lock(lock_key);
 end loop;
 select * into prior from public.pediatrics_doctor_requests where id=p_id;
 if found then
  if prior.fingerprint<>p_fingerprint then return jsonb_build_object('error','invalid_retry'); end if;
  return jsonb_build_object('day',prior.calendar_day,'calendar_id',prior.calendar_id);
 end if;
 if (select count(*) from public.pediatrics_doctor_requests where phone_hash=p_phone and created_at>now()-interval '24 hours')>=3
 or (select count(*) from public.pediatrics_doctor_requests where ip_hash=p_ip and created_at>now()-interval '1 hour')>=12 then
  return jsonb_build_object('error','rate_limited');
 end if;
 insert into public.pediatrics_doctor_requests(id,fingerprint,phone_hash,ip_hash,calendar_day,calendar_id) values(p_id,p_fingerprint,p_phone,p_ip,p_day,p_calendar);
 return jsonb_build_object('day',p_day,'calendar_id',p_calendar);
end;
$$;
revoke all on function public.reserve_pediatrics_doctor_request(uuid,text,text,text,date,text) from public,anon,authenticated;
grant execute on function public.reserve_pediatrics_doctor_request(uuid,text,text,text,date,text) to service_role;
