-- Maccabi financial-commitment (התחייבות / טופס 17) requests sent by the AI secretary for pediatric-clinic patients.
create table if not exists public.maccabi_commitments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  clinic_patient_id uuid references public.clinic_patients(id) on delete set null,
  patient_name text not null check (length(patient_name) between 2 and 160),
  national_id text not null check (national_id ~ '^[0-9]{5,9}$'),
  birth_date date,
  phone text not null check (phone ~ '^0[0-9]{8,9}$'),
  service text not null check (length(service) between 2 and 200),
  note text check (note is null or length(note) <= 2000),
  attachments jsonb not null default '[]'::jsonb,
  status text not null default 'sent' check (status in ('sent','reminded','reply_received','ready','rejected','cancelled')),
  gmail_thread_id text,
  gmail_message_id text,
  rfc_message_id text,
  sent_at timestamptz not null default now(),
  last_reminder_at timestamptz,
  reminders_count integer not null default 0,
  last_checked_at timestamptz,
  last_reply_at timestamptz,
  last_reply_snippet text,
  reply_count integer not null default 0,
  ready_at timestamptz,
  ready_source text check (ready_source is null or ready_source in ('email','manual')),
  patient_notified_at timestamptz,
  notify_provider_id text,
  notify_error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists maccabi_commitments_status_idx on public.maccabi_commitments (status, sent_at desc);
create index if not exists maccabi_commitments_thread_idx on public.maccabi_commitments (gmail_thread_id);
alter table public.maccabi_commitments enable row level security;
-- No policies on purpose: only the server (service role) reads and writes this table.
