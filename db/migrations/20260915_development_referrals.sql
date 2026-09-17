-- Isolated workflow. No changes to existing ADHD cases.
create table if not exists public.development_referrals (
 id uuid primary key default gen_random_uuid(),
 child_name text not null, birth_date date not null, parent_name text not null, phone text not null,
 education_role text not null check (education_role in ('teacher','kindergarten')),
 parent_hash text not null unique, education_hash text not null unique,
 expires_at timestamptz not null default now()+interval '30 days',
 parent_answers jsonb not null default '{}', education_answers jsonb not null default '{}',
 parent_submitted_at timestamptz, education_submitted_at timestamptz,
 consent_at timestamptz not null default now(), consent_version text not null,
 summary text, approved_by uuid, approved_at timestamptz,
 status text not null default 'parent' check(status in ('parent','education','review','uploading','approved','sending','accepted','delivered','bounced','failed','unknown')),
 email_id text, dispatch_started_at timestamptz, error_code text,
 created_at timestamptz not null default now()
);
alter table public.development_referrals enable row level security;
revoke all on public.development_referrals from anon, authenticated;
grant all on public.development_referrals to service_role;
create table if not exists public.development_documents (
 id uuid primary key default gen_random_uuid(), referral_id uuid not null references public.development_referrals(id),
 kind text not null check(kind in ('parent_original','education_original','referral','consent')),
 storage_path text not null, created_at timestamptz not null default now(), unique(referral_id,kind)
);
alter table public.development_documents enable row level security;
revoke all on public.development_documents from anon, authenticated;
grant all on public.development_documents to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('development-private','development-private',false,5242880,array['application/pdf']) on conflict(id) do nothing;
-- There are deliberately no public storage policies. Staff-authenticated API only.
