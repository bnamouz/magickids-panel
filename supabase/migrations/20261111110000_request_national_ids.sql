-- Owner-approved additive change. Existing requests remain unchanged.
alter table public.treatment_requests add column if not exists national_id text
 check(national_id is null or (national_id ~ '^[0-9]{9}$' and national_id <> '000000000'));
alter table public.moxo_requests add column if not exists national_id text
 check(national_id is null or (national_id ~ '^[0-9]{9}$' and national_id <> '000000000'));

-- Separate entrypoints retain compatibility with existing internal clients.
-- Identity, capability and assignment are saved in the same transaction.
create function public.submit_identified_treatment(
 p_id uuid,p_patient text,p_contact text,p_phone text,p_ip text,p_treatment text,
 p_language text,p_availability text,p_national_id text,p_therapist uuid,
 p_parent_hash text,p_duration integer,p_reminder boolean
) returns text language plpgsql security invoker set search_path='' as $$
declare prior public.treatment_requests; result text; therapist_name text;
begin
 perform pg_advisory_xact_lock(2026091201);
 if p_national_id is null or p_national_id !~ '^[0-9]{9}$' or p_national_id='000000000' then return 'invalid_request'; end if;
 if (p_therapist is null) <> (p_parent_hash is null) then return 'invalid_request'; end if;
 if p_therapist is not null then
  select t.name into therapist_name from public.therapists t
   join public.therapist_booking_profiles p on p.therapist_id=t.id
   where t.id=p_therapist and t.active and p.enabled and p.booking_mode='therapist_time';
  if not found then return 'invalid_request'; end if;
 end if;
 select * into prior from public.treatment_requests where id=p_id;
 if found and (prior.national_id is distinct from p_national_id
  or (p_parent_hash is not null and prior.therapist_id is distinct from p_therapist)
  or prior.parent_hash is distinct from p_parent_hash
  or prior.reminder_consent is distinct from p_reminder) then return 'invalid_retry'; end if;
 -- Reusing the legacy function preserves rate limiting and exact-field retries.
 result=public.submit_treatment_request(p_id,p_patient,p_contact,p_phone,p_ip,p_treatment,p_language,p_availability);
 if result='received' and prior.id is null then
  update public.treatment_requests set national_id=p_national_id,
   therapist_id=p_therapist,therapist=therapist_name,parent_hash=p_parent_hash,
   duration_minutes=p_duration,reminder_consent=p_reminder where id=p_id;
 end if;
 return result;
end $$;
revoke all on function public.submit_identified_treatment(uuid,text,text,text,text,text,text,text,text,uuid,text,integer,boolean) from public,anon,authenticated;
grant execute on function public.submit_identified_treatment(uuid,text,text,text,text,text,text,text,text,uuid,text,integer,boolean) to service_role;

create function public.submit_identified_moxo(
 p_id uuid,p_patient text,p_contact text,p_phone text,p_language text,
 p_date date,p_start timestamptz,p_national_id text
) returns text language plpgsql security invoker set search_path='' as $$
declare prior public.moxo_requests; result text;
begin
 perform pg_advisory_xact_lock(hashtext(p_phone));
 if p_national_id is null or p_national_id !~ '^[0-9]{9}$' or p_national_id='000000000' then return 'invalid_request'; end if;
 select * into prior from public.moxo_requests where id=p_id;
 if found and prior.national_id is distinct from p_national_id then return 'invalid_retry'; end if;
 result=public.submit_moxo_preference(p_id,p_patient,p_contact,p_phone,p_language,p_date,p_start);
 if result='pending' and prior.id is null then
  update public.moxo_requests set national_id=p_national_id where id=p_id;
 end if;
 return result;
end $$;
revoke all on function public.submit_identified_moxo(uuid,text,text,text,text,date,timestamptz,text) from public,anon,authenticated;
grant execute on function public.submit_identified_moxo(uuid,text,text,text,text,date,timestamptz,text) to service_role;
