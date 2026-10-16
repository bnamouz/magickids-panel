-- Pediatric clinic patient registry. Isolated from the ADHD `patients` table.
create table if not exists public.clinic_patients (
 id uuid primary key default gen_random_uuid(),
 national_id text not null unique check (national_id ~ '^[0-9]{5,9}$'),
 first_name text not null check (length(first_name) between 1 and 80),
 last_name text not null check (length(last_name) between 1 and 80),
 phone1 text check (phone1 is null or phone1 ~ '^0[0-9]{8,9}$'),
 phone2 text check (phone2 is null or phone2 ~ '^0[0-9]{8,9}$'),
 birth_date date,
 last_visit date,
 next_visit date,
 notes text check (notes is null or length(notes) <= 2000),
 extra jsonb not null default '{}'::jsonb,
 source text not null default 'manual',
 needs_review boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid,
 archived_at timestamptz
);
create index if not exists clinic_patients_last_name_idx on public.clinic_patients (last_name);
create index if not exists clinic_patients_phone1_idx on public.clinic_patients (phone1);
create index if not exists clinic_patients_phone2_idx on public.clinic_patients (phone2);
create index if not exists clinic_patients_next_visit_idx on public.clinic_patients (next_visit) where archived_at is null;
alter table public.clinic_patients enable row level security;
revoke all on public.clinic_patients from anon, authenticated;
grant all on public.clinic_patients to service_role;
-- No public policies: staff-authenticated API only.
