-- The family states on the MOXO request form that it asks for the test through Maccabi.
-- For such a request the physician's referral must be attached; staff check eligibility against it.
-- Additive: earlier requests are recorded as not stated (false).
alter table public.moxo_requests add column via_maccabi boolean not null default false;
