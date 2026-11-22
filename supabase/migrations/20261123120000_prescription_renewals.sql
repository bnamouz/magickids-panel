-- Paid prescription-renewal requests from families of ADHD patients (one or three months).
-- A patient with no documented assessment at the institute must attach a previous assessment summary.
-- Files (payment proof, summary) live in the existing private 'adhd-payments' bucket under rx/<id>/.
create table public.prescription_renewal_requests (
 id uuid primary key,
 months smallint not null check (months in (1, 3)),
 amount_ils integer not null check (amount_ils between 1 and 100000),
 payment_method text not null check (payment_method in ('bank','bit')),
 patient_name text not null check (length(patient_name) between 2 and 100),
 patient_id text not null check (patient_id ~ '^[0-9]{9}$'),
 birth_date date not null,
 contact_name text not null check (length(contact_name) between 2 and 100),
 phone text not null check (phone ~ '^\+[1-9][0-9]{6,14}$'),
 fund text not null check (fund in ('maccabi','clalit','meuhedet','leumit','private')),
 medication text not null check (length(medication) between 2 and 200),
 note text check (note is null or length(note) <= 500),
 language text not null default 'ar' check (language in ('he','ar','en')),
 proof_path text not null unique,
 proof_type text not null check (proof_type in ('image/jpeg','image/png','application/pdf')),
 summary_paths text[] not null default '{}' check (cardinality(summary_paths) <= 3),
 -- What the system knew when the request arrived: assessed here, a file without a documented assessment, or nothing.
 recognition text not null check (recognition in ('diagnosed','file_only','unknown')),
 matched_patient_id uuid,
 matched_session_id uuid,
 status text not null default 'uploading' check (status in ('uploading','pending','issued','rejected')),
 ip_hash text not null,
 review_note text check (review_note is null or length(review_note) <= 500),
 reviewed_at timestamptz,
 reviewed_by uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 -- Without a documented assessment at the institute, a summary is mandatory.
 constraint prescription_summary_required check (recognition = 'diagnosed' or cardinality(summary_paths) >= 1)
);
alter table public.prescription_renewal_requests enable row level security;
revoke all on public.prescription_renewal_requests from public, anon, authenticated;
grant all on public.prescription_renewal_requests to service_role;
create index prescription_renewal_requests_status on public.prescription_renewal_requests(status, created_at desc);

-- One row per submission attempt, kept only to limit how often one address can try patient details.
create table public.prescription_renewal_attempts (
 id bigint generated always as identity primary key,
 ip_hash text not null,
 created_at timestamptz not null default now()
);
alter table public.prescription_renewal_attempts enable row level security;
revoke all on public.prescription_renewal_attempts from public, anon, authenticated;
grant all on public.prescription_renewal_attempts to service_role;
create index prescription_renewal_attempts_rate on public.prescription_renewal_attempts(ip_hash, created_at);
