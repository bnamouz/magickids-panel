alter table public.development_referrals drop constraint if exists development_referrals_education_role_check;
alter table public.development_referrals add constraint development_referrals_education_role_check check(education_role in ('teacher','kindergarten','none'));
alter table public.development_referrals add column form_version text,add column form_template text check(form_template in ('infant','child')),add column intake_ip_hash text;
create function public.register_development_original(p_child text,p_birth date,p_parent text,p_phone text,p_education text,p_parent_hash text,p_education_hash text,p_template text,p_ip text) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_ip,7));
 if (select count(*) from public.development_referrals where intake_ip_hash=p_ip and created_at>now()-interval '1 hour')>=10 or (select count(*) from public.development_referrals where phone=p_phone and created_at>now()-interval '1 day')>=5 then raise exception 'RATE_LIMIT';end if;
 insert into public.development_referrals(child_name,birth_date,parent_name,phone,education_role,parent_hash,education_hash,consent_version,form_version,form_template,intake_ip_hash) values(p_child,p_birth,p_parent,p_phone,p_education,p_parent_hash,p_education_hash,'maccabi-upload-20261003-v1','maccabi-upload-20261003-v1',p_template,p_ip) returning id into v_id;
 return v_id;
end;$$;
revoke all on function public.register_development_original(text,date,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.register_development_original(text,date,text,text,text,text,text,text,text) to service_role;
