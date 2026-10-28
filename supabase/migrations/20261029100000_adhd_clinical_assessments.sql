-- Clinician's DSM-5 assessment captured during the ADHD evaluation (criteria A–E, observation, history, plan).
-- One row per intake session; the report generator merges it with the Vanderbilt questionnaires.
create table if not exists public.adhd_clinical_assessments (
  session_id uuid primary key references public.intake_sessions(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.adhd_clinical_assessments enable row level security;
-- No policies on purpose: only the server (service role) reads and writes this table.
