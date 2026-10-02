create table public.class_interests (
 id uuid primary key, class_type text not null check(class_type in ('chess','robotics','art','music','young-science','theatre','family','therapist-groups','young-doctor')),
 patient text not null, contact text not null, phone text not null, language text not null check(language in ('he','ar','en')),
 created_at timestamptz not null default now(), consent_at timestamptz not null default now(),
 unique(class_type,phone,patient)
);
alter table public.class_interests enable row level security;
revoke all on public.class_interests from anon,authenticated;
grant select,insert,update,delete on public.class_interests to service_role;
create index class_interests_type_created on public.class_interests(class_type,created_at);
create function public.submit_class_interest(p_id uuid,p_class text,p_patient text,p_contact text,p_phone text,p_language text) returns text language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_phone,0));
 if exists(select 1 from public.class_interests where class_type=p_class and phone=p_phone and patient=p_patient) then return 'received';end if;
 if (select count(*) from public.class_interests where phone=p_phone and created_at>now()-interval '1 day')>=15 then return 'rate_limited';end if;
 insert into public.class_interests(id,class_type,patient,contact,phone,language) values(p_id,p_class,p_patient,p_contact,p_phone,p_language);
 return 'received';
end;$$;
revoke all on function public.submit_class_interest(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_class_interest(uuid,text,text,text,text,text) to service_role;
