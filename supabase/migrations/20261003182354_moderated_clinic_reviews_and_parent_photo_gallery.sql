create table public.clinic_reviews (
 id uuid primary key default gen_random_uuid(),
 display_name text not null check (length(display_name) between 2 and 60),
 service text not null check (service in ('pediatrics','adhd')),
 rating integer not null check (rating between 1 and 5),
 body text not null check (length(body) between 10 and 1500),
 consent boolean not null check(consent),
 status text not null default 'pending' check(status in ('pending','approved','hidden')),
 ip_hash text not null,
 created_at timestamptz not null default now(),
 moderated_at timestamptz,
 moderated_by uuid
);
alter table public.clinic_reviews enable row level security;
revoke all on public.clinic_reviews from anon, authenticated;
grant all on public.clinic_reviews to service_role;
create index clinic_reviews_status_date on public.clinic_reviews(status,created_at desc);
create index clinic_reviews_rate on public.clinic_reviews(ip_hash,created_at);
create function public.submit_clinic_review(p_id uuid,p_name text,p_service text,p_rating integer,p_body text,p_ip text) returns text
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_ip,0));
 if exists(select 1 from public.clinic_reviews where id=p_id) then return 'received'; end if;
 if (select count(*) from public.clinic_reviews where ip_hash=p_ip and created_at>now()-interval '1 day')>=3 then return 'rate_limited'; end if;
 insert into public.clinic_reviews(id,display_name,service,rating,body,consent,ip_hash) values(p_id,p_name,p_service,p_rating,p_body,true,p_ip);
 return 'received';
end $$;
revoke all on function public.submit_clinic_review(uuid,text,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.submit_clinic_review(uuid,text,text,integer,text,text) to service_role;
create table public.clinic_gallery (
 id uuid primary key,
 email text not null check(length(email)<=254),
 storage_path text not null unique,
 consent_version text not null default 'guardian-publication-v1',
 consent_at timestamptz not null default now(),
 status text not null default 'uploading' check(status in ('uploading','pending','approved','hidden')),
 ip_hash text not null,
 created_at timestamptz not null default now(),
 moderated_at timestamptz,
 moderated_by uuid
);
alter table public.clinic_gallery enable row level security;
revoke all on public.clinic_gallery from anon,authenticated;
grant all on public.clinic_gallery to service_role;
create index clinic_gallery_status on public.clinic_gallery(status,created_at desc);
create index clinic_gallery_rate on public.clinic_gallery(ip_hash,created_at);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('clinic-gallery','clinic-gallery',false,3145728,array['image/jpeg']) on conflict(id) do nothing;
create function public.reserve_clinic_photo(p_id uuid,p_email text,p_ip text) returns text language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_ip,1));
 if (select count(*) from public.clinic_gallery where ip_hash=p_ip and created_at>now()-interval '1 day')>=3 then return 'rate_limited'; end if;
 insert into public.clinic_gallery(id,email,storage_path,ip_hash) values(p_id,p_email,p_id::text||'.jpg',p_ip);
 return 'received';
end $$;
revoke all on function public.reserve_clinic_photo(uuid,text,text) from public,anon,authenticated;
grant execute on function public.reserve_clinic_photo(uuid,text,text) to service_role;
