-- Voice AI agent call log table
-- Stores every call handled by the ElevenLabs voice agent for auditing,
-- staff follow-up, and cross-linking to intake sessions and appointments.

create table if not exists public.voice_calls (
  id uuid primary key default gen_random_uuid(),
  call_started_at timestamptz not null default now(),
  call_ended_at timestamptz,
  duration_seconds int,
  caller_phone text not null,
  caller_name text,
  child_name text,
  child_age int,
  hmo text check (hmo in ('maccabi','clalit','leumit','meuhedet','private','unknown')),
  language_used text check (language_used in ('he','ar','mixed')),
  purpose text,
  outcome text check (outcome in ('booked','intake_sent','escalated','info_only','dropped','error')),
  next_action text,
  linked_case_id uuid references public.intake_sessions(id) on delete set null,
  linked_appointment_id uuid,
  transcript_url text,
  raw_summary jsonb,
  agent_tool_calls jsonb,
  created_at timestamptz not null default now()
);

create index if not exists voice_calls_phone_idx on public.voice_calls (caller_phone);
create index if not exists voice_calls_outcome_idx on public.voice_calls (outcome);
create index if not exists voice_calls_started_idx on public.voice_calls (call_started_at desc);

alter table public.voice_calls enable row level security;

-- Staff members can read all voice calls
drop policy if exists "staff_read_voice_calls" on public.voice_calls;
create policy "staff_read_voice_calls" on public.voice_calls
  for select using (
    exists (select 1 from public.staff_users where staff_users.id = auth.uid())
  );

-- Only service role can insert / update (from the voice API routes)
drop policy if exists "service_write_voice_calls" on public.voice_calls;
create policy "service_write_voice_calls" on public.voice_calls
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

comment on table public.voice_calls is
  'Log of every call handled by the ElevenLabs voice AI agent (Rana).';
