alter table public.patients add column if not exists national_id text check (national_id is null or national_id ~ '^[0-9]{9}$');
comment on column public.patients.national_id is 'Israeli ID of the child (9 digits, checksum-validated at intake). Required on the public case-opening form since 22.10.2026; older cases may be null.';
create index if not exists patients_national_id_idx on public.patients (national_id) where national_id is not null;
