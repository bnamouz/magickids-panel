-- Secretary desk: a second kind of Maccabi request – approval of a recommended imaging test (sent to the national imaging center).
-- Backward compatible: existing rows become kind 'commitment'; recipient_email stays null for rows sent before this change.
alter table public.maccabi_commitments
  add column if not exists kind text not null default 'commitment' check (kind in ('commitment','imaging')),
  add column if not exists recipient_email text check (recipient_email is null or length(recipient_email) <= 320);
