-- Applied version 20261009220528. Existing rows remain unchanged.
-- Never infer or replace an existing contact.
alter table public.class_interests add column email text;
alter table public.class_interests add constraint class_interest_email_valid
 check (email is null or (length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'));
create function public.submit_class_interest_email(
 p_id uuid,p_class text,p_patient text,p_contact text,p_phone text,p_language text,p_email text
) returns text language plpgsql security invoker set search_path='' as $$
declare existing_email text;
begin
 if p_email is null or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then return 'invalid'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_phone,0));
 select email into existing_email from public.class_interests
 where class_type=p_class and phone=p_phone and patient=p_patient;
 if found then
   if existing_email=lower(trim(p_email)) then return 'received'; end if;
   return 'already_registered';
 end if;
 if (select count(*) from public.class_interests where phone=p_phone and created_at>now()-interval '1 day')>=15 then return 'rate_limited';end if;
 insert into public.class_interests(id,class_type,patient,contact,phone,language,email)
 values(p_id,p_class,p_patient,p_contact,p_phone,p_language,lower(trim(p_email)));
 return 'received';
end;$$;
revoke all on function public.submit_class_interest_email(uuid,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_class_interest_email(uuid,text,text,text,text,text,text) to service_role;
