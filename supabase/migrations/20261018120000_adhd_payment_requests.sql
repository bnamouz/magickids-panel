-- Prepayment requests for ADHD visits by patients outside Maccabi.
-- Maccabi patients keep booking directly (card swipe at the visit).
create table public.adhd_payment_requests (
 id uuid primary key,
 visit_type text not null check (visit_type in ('assessment','followup')),
 fund text not null check (fund in ('clalit','meuhedet','leumit','private')),
 moxo boolean not null default false,
 amount_ils integer check (amount_ils is null or amount_ils between 0 and 100000),
 payment_method text not null check (payment_method in ('bank','bit')),
 child_name text not null check (length(child_name) between 2 and 100),
 child_id text not null check (child_id ~ '^[0-9]{9}$'),
 parent_name text not null check (length(parent_name) between 2 and 100),
 phone text not null check (phone ~ '^\+[1-9][0-9]{6,14}$'),
 language text not null default 'ar' check (language in ('he','ar','en')),
 proof_path text not null unique,
 proof_type text not null check (proof_type in ('image/jpeg','image/png','application/pdf')),
 status text not null default 'uploading' check (status in ('uploading','pending','approved','rejected','booked')),
 ip_hash text not null,
 review_note text check (review_note is null or length(review_note) <= 500),
 reviewed_at timestamptz,
 reviewed_by uuid,
 booking_token_hash text unique,
 booking_id uuid,
 booked_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.adhd_payment_requests enable row level security;
revoke all on public.adhd_payment_requests from public, anon, authenticated;
grant all on public.adhd_payment_requests to service_role;
create index adhd_payment_requests_status on public.adhd_payment_requests(status, created_at desc);
create index adhd_payment_requests_rate on public.adhd_payment_requests(ip_hash, created_at);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('adhd-payments', 'adhd-payments', false, 5242880, array['image/jpeg','image/png','application/pdf'])
on conflict (id) do nothing;
