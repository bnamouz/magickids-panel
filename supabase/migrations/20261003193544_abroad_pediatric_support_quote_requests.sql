create table public.abroad_pricing (id boolean primary key default true check(id),config jsonb not null default '{"enabled":false}',updated_at timestamptz not null default now());
insert into public.abroad_pricing(id) values(true);
alter table public.abroad_pricing enable row level security;
revoke all on public.abroad_pricing from anon,authenticated;
grant all on public.abroad_pricing to service_role;
create table public.abroad_requests(id uuid primary key,parent text not null,email text not null,phone text not null,country text not null,city text not null,region text not null,start_date date not null,end_date date not null,children integer not null check(children between 1 and 10),days integer not null check(days between 1 and 365),total_agorot bigint,pricing_snapshot jsonb,status text not null default 'pending' check(status in ('pending','contacted','closed')),ip_hash text not null,consent_at timestamptz not null default now(),created_at timestamptz not null default now());
alter table public.abroad_requests enable row level security;
revoke all on public.abroad_requests from anon,authenticated;
grant all on public.abroad_requests to service_role;
create index abroad_requests_ip on public.abroad_requests(ip_hash,created_at);
create function public.submit_abroad_request(p_data jsonb,p_ip text) returns text language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_ip,2));
 if exists(select 1 from public.abroad_requests where id=(p_data->>'id')::uuid) then return 'received';end if;
 if (select count(*) from public.abroad_requests where ip_hash=p_ip and created_at>now()-interval '1 day')>=5 then return 'rate_limited';end if;
 insert into public.abroad_requests(id,parent,email,phone,country,city,region,start_date,end_date,children,days,total_agorot,pricing_snapshot,ip_hash) values((p_data->>'id')::uuid,p_data->>'parent',p_data->>'email',p_data->>'phone',p_data->>'country',p_data->>'city',p_data->>'region',(p_data->>'start')::date,(p_data->>'end')::date,(p_data->>'children')::int,(p_data->>'days')::int,(p_data->>'total')::bigint,p_data->'pricing',p_ip);
 return 'received';
end $$;
revoke all on function public.submit_abroad_request(jsonb,text) from public,anon,authenticated;
grant execute on function public.submit_abroad_request(jsonb,text) to service_role;
