-- Child-development follow-up (additive only; no existing column, row or constraint is changed).
-- The personal links are kept next to their hashes so staff can show and resend the same link a family already has,
-- and the educator's contact is kept so a reminder can reach her. Service role only, as the rest of the table.
alter table public.development_referrals
  add column if not exists parent_token text,
  add column if not exists education_token text,
  add column if not exists education_contact_name text,
  add column if not exists education_phone text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'development_referrals_followup_lengths') then
    alter table public.development_referrals add constraint development_referrals_followup_lengths check (
      (parent_token is null or parent_token ~ '^[a-f0-9]{64}$') and (education_token is null or education_token ~ '^[a-f0-9]{64}$')
      and (education_contact_name is null or char_length(education_contact_name) <= 100)
      and (education_phone is null or char_length(education_phone) <= 20));
  end if;
end $$;
create unique index if not exists development_referrals_parent_token_key on public.development_referrals(parent_token) where parent_token is not null;
create unique index if not exists development_referrals_education_token_key on public.development_referrals(education_token) where education_token is not null;
