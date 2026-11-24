-- A family may attach the physician's referral to a MOXO request.
-- The file lives in the existing private 'adhd-payments' bucket under moxo/<request id>/; no bucket is created.
-- Additive: existing rows keep working and the request functions are unchanged.
alter table public.moxo_requests
 add column referral_path text unique,
 add column referral_type text check (referral_type is null or referral_type in ('image/jpeg','image/png','application/pdf')),
 add column referral_uploaded_at timestamptz,
 add constraint moxo_requests_referral_complete check ((referral_path is null) = (referral_type is null) and (referral_path is null) = (referral_uploaded_at is null));
-- Supports the daily cap on stored referrals.
create index moxo_requests_referral_uploaded on public.moxo_requests(referral_uploaded_at) where referral_uploaded_at is not null;
