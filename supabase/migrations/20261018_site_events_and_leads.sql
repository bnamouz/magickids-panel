-- Site usage events (first-party, cookieless) and a unified leads feed.
create table if not exists public.site_events (
  id bigserial primary key,
  ts timestamptz not null default now(),
  site text not null check (site in ('public','app')),
  event text not null check (event in ('view','click','step')),
  label text,
  path text not null,
  lang text,
  visitor text not null,
  session text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  device text,
  country text,
  city text
);
create index if not exists site_events_ts_idx on public.site_events (ts desc);
create index if not exists site_events_visitor_idx on public.site_events (visitor, ts);
alter table public.site_events enable row level security;

-- One row per contact touch-point, read by the admin leads page through the service role.
create or replace view public.leads_feed as
  select 'intake'::text as source, s.id::text as id, concat_ws(' ', p.first_name, p.last_name)::text as name, pr.full_name::text as contact,
         pr.phone::text as phone, null::text as lang, s.status::text as status, s.reason_for_referral::text as detail, s.created_at
    from public.intake_sessions s
    left join public.patients p on p.id = s.patient_id
    left join public.parents pr on pr.id = s.primary_parent_id
  union all
  select 'adhd_payment', id::text, child_name::text, parent_name::text, phone::text, language::text, status::text,
         concat_ws(' · ', visit_type, fund, case when moxo then 'MOXO' end)::text, created_at
    from public.adhd_payment_requests
  union all
  select 'moxo', id::text, patient_name::text, contact_name::text, phone::text, language::text, status::text, null::text, created_at from public.moxo_requests
  union all
  select 'treatment', id::text, patient_name::text, contact_name::text, phone::text, language::text, status::text, treatment::text, created_at from public.treatment_requests
  union all
  select 'rana', id::text, patient_name::text, contact_name::text, phone::text, null::text, status::text, null::text, created_at from public.therapist_booking_requests
  union all
  select 'classes', id::text, patient::text, contact::text, phone::text, language::text, 'new'::text, class_type::text, created_at from public.class_interests
  union all
  select 'development', id::text, child_name::text, parent_name::text, phone::text, null::text, status::text, null::text, created_at from public.development_referrals
  union all
  select 'abroad', id::text, null::text, parent::text, phone::text, null::text, status::text, concat_ws(', ', country, city)::text, created_at from public.abroad_requests
  union all
  select 'sarah', id::text, child_name::text, caller_name::text, caller_phone::text, language_used::text, coalesce(outcome, 'call')::text, purpose::text, coalesce(call_started_at, created_at) from public.voice_calls
  union all
  select 'nour', id::text, null::text, caller_name::text, caller_phone::text, language_used::text, coalesce(outcome, 'call')::text, purpose::text, coalesce(call_started_at, created_at) from public.nour_calls;
revoke all on public.leads_feed from anon, authenticated;
