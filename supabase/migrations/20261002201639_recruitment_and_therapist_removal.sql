alter table public.therapists add column archived_at timestamptz;
alter table public.therapists add constraint archived_therapists_inactive check (archived_at is null or not active);
create table public.recruitment_candidates (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 100),
 email text not null check(length(email) between 3 and 254), phone text not null check(length(phone) between 7 and 25),
 treatments text[] not null check(cardinality(treatments) between 1 and 6), experience text not null default '' check(length(experience)<=3000),
 notes text not null default '' check(length(notes)<=5000),
 status text not null default 'new' check(status in ('new','contacted','interview','accepted','rejected')),
 therapist_id uuid references public.therapists(id) on delete set null,
 source text not null default 'staff', ip_hash text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.recruitment_candidates enable row level security;
revoke all on public.recruitment_candidates from public,anon,authenticated;
grant all on public.recruitment_candidates to service_role;
create index recruitment_candidates_status on public.recruitment_candidates(status,created_at);
create index recruitment_candidates_ip on public.recruitment_candidates(ip_hash,created_at);
create function public.submit_recruitment(p_id uuid,p_name text,p_email text,p_phone text,p_treatments text[],p_experience text,p_ip text)
returns text language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('recruitment:'||p_ip,0));
 if exists(select 1 from public.recruitment_candidates where id=p_id) then return 'received'; end if;
 if (select count(*) from public.recruitment_candidates where ip_hash=p_ip and created_at>now()-interval '1 hour')>=5 then return 'rate_limited'; end if;
 insert into public.recruitment_candidates(id,name,email,phone,treatments,experience,ip_hash,source) values(p_id,p_name,p_email,p_phone,p_treatments,p_experience,p_ip,'website');
 return 'received';
end $$;
create function public.accept_recruitment(p_id uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.recruitment_candidates; tid uuid;
begin
 select * into c from public.recruitment_candidates where id=p_id for update;
 if not found then raise exception 'not_found'; end if;
 if c.therapist_id is not null then return c.therapist_id; end if;
 insert into public.therapists(name,email,treatments,active) values(c.name,lower(c.email),c.treatments,false) returning id into tid;
 update public.recruitment_candidates set therapist_id=tid,status='accepted',updated_at=now() where id=p_id;
 return tid;
end $$;
create function public.remove_therapist(p_id uuid) returns text language plpgsql security invoker set search_path='' as $$
declare t public.therapists;
begin
 perform pg_advisory_xact_lock(2026091202);
 select * into t from public.therapists where id=p_id for update;
 if not found then return 'not_found'; end if;
 if exists(select 1 from public.treatment_requests where (therapist_id=p_id or (therapist_id is null and lower(therapist)=lower(t.name))) and (status in ('pending','contacted') or (status='scheduled' and scheduled_at+make_interval(mins=>duration_minutes)>now()) or calendar_sync='syncing')) then return 'has_open_treatments'; end if;
 if exists(select 1 from public.treatment_requests where therapist_id=p_id or (therapist_id is null and lower(therapist)=lower(t.name))) then
  update public.therapists set active=false,archived_at=now(),token_version=gen_random_uuid(),updated_at=now() where id=p_id;
  return 'archived';
 end if;
 delete from public.therapists where id=p_id;
 return 'deleted';
end $$;
-- Serialize assignments with removal and scheduling, including automatic assignment.
create function public.guard_therapist_assignment() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.therapist_id is not null and (tg_op='INSERT' or new.therapist_id is distinct from old.therapist_id) then
  perform 1 from public.therapists where id=new.therapist_id and active and archived_at is null for share;
  if not found then raise exception 'inactive_therapist'; end if;
 end if;
 return new;
end $$;
create trigger guard_therapist_assignment before insert or update of therapist_id on public.treatment_requests for each row execute function public.guard_therapist_assignment();
revoke all on function public.submit_recruitment(uuid,text,text,text,text[],text,text),public.accept_recruitment(uuid),public.remove_therapist(uuid),public.guard_therapist_assignment() from public,anon,authenticated;
grant execute on function public.submit_recruitment(uuid,text,text,text,text[],text,text),public.accept_recruitment(uuid),public.remove_therapist(uuid),public.guard_therapist_assignment() to service_role;
